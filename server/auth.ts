import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import bcrypt from "bcryptjs";
import type { Express } from "express";
import type { IStorage } from "./storage";
import { notificationService } from "./services/notificationService";

export function setupAuth(app: Express, storage: IStorage) {
  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });
  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user || false);
    } catch (err) {
      done(err, false);
    }
  });

  passport.use(new LocalStrategy(
    { usernameField: 'email', passwordField: 'password' },
    async (email, password, done) => {
      try {
        const user = await storage.getUserByEmail(email);
        if (!user) return done(null, false, { message: 'Invalid email or password' });
        if (!user.passwordHash) return done(null, false, { message: 'Please use Google login or reset your password' });
        if (!user.isActive) return done(null, false, { message: 'Account is deactivated' });
        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) return done(null, false, { message: 'Invalid email or password' });
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }
  ));

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: '/api/auth/google/callback',
      scope: ['profile', 'email'],
    }, async (accessToken: string, refreshToken: string, profile: any, done: any) => {
      try {
        let user = await storage.getUserByGoogleId(profile.id);
        if (user) {
          const photo = profile.photos?.[0]?.value;
          if (photo && !user.avatarUrl) {
            await storage.updateUser(user.id, { avatarUrl: photo } as any);
          }
          await storage.updateUser(user.id, { lastLoginAt: new Date() } as any);
          return done(null, user);
        }

        const email = profile.emails?.[0]?.value;
        if (email) {
          user = await storage.getUserByEmail(email);
          if (user) {
            const photo = profile.photos?.[0]?.value;
            await storage.updateUser(user.id, {
              googleId: profile.id,
              avatarUrl: photo || user.avatarUrl,
              lastLoginAt: new Date()
            } as any);
            return done(null, user);
          }
        }

        const newUser = await storage.createUser({
          username: profile.displayName || email || `user-${profile.id}`,
          password: 'google-oauth',
          email: email || '',
          role: 'client',
          googleId: profile.id,
          avatarUrl: profile.photos?.[0]?.value || null,
          paymentMethod: 'pay_as_you_go',
        } as any);

        const platformUrl = process.env.PLATFORM_URL || '';
        notificationService.onClientWelcome(
          { userId: newUser.id, firstName: newUser.username, email: newUser.email || '' },
          { login_url: platformUrl }
        ).catch(err => console.error('Failed to send welcome email:', err));

        return done(null, newUser);
      } catch (err) {
        return done(err as Error);
      }
    }));
  }

  app.post('/api/auth/login', (req, res, next) => {
    passport.authenticate('local', (err: any, user: any, info: any) => {
      if (err) return res.status(500).json({ error: 'Internal server error' });
      if (!user) return res.status(401).json({ error: info?.message || 'Invalid credentials' });

      req.session.userId = user.id;
      req.session.userRole = user.role;

      storage.updateUser(user.id, { lastLoginAt: new Date() } as any).catch(console.error);

      res.json({
        userId: user.id,
        role: user.role,
        username: user.username,
        email: user.email,
        avatarUrl: user.avatarUrl
      });
    })(req, res, next);
  });

  app.post('/api/auth/register', async (req, res) => {
    try {
      const { email, password, firstName, lastName } = req.body;

      if (!email || !password || !firstName || !lastName) {
        return res.status(400).json({ error: 'All fields are required' });
      }

      if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }

      const existing = await storage.getUserByEmail(email);
      if (existing) {
        return res.status(409).json({ error: 'An account with this email already exists' });
      }

      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      const username = `${firstName} ${lastName}`;
      const newUser = await storage.createUser({
        username,
        password: 'auth-system',
        email,
        role: 'client',
        passwordHash,
        paymentMethod: 'pay_as_you_go',
      } as any);

      req.session.userId = newUser.id;
      req.session.userRole = newUser.role;

      const platformUrl = process.env.PLATFORM_URL || '';
      notificationService.onClientWelcome(
        { userId: newUser.id, firstName: newUser.username, email: newUser.email || '' },
        { login_url: platformUrl }
      ).catch(err => console.error('Failed to send welcome email:', err));

      res.status(201).json({
        userId: newUser.id,
        role: newUser.role,
        username: newUser.username,
        email: newUser.email,
        avatarUrl: newUser.avatarUrl
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ error: 'Failed to create account' });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    req.session.destroy((err) => {
      if (err) return res.status(500).json({ error: 'Failed to logout' });
      res.clearCookie('connect.sid');
      res.json({ success: true });
    });
  });

  app.get('/api/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

  app.get('/api/auth/google/callback', (req, res, next) => {
    passport.authenticate('google', (err: any, user: any) => {
      if (err || !user) {
        return res.redirect('/?auth_error=google_failed');
      }

      req.session.userId = user.id;
      req.session.userRole = user.role;

      res.redirect('/?auth_success=true');
    })(req, res, next);
  });

  app.post('/api/auth/forgot-password', async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ error: 'Email is required' });

      const user = await storage.getUserByEmail(email);
      if (!user) return res.json({ success: true });

      const crypto = await import('crypto');
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      await storage.createPasswordResetToken({
        userId: user.id,
        token,
        expiresAt,
      });

      const platformUrl = process.env.PLATFORM_URL || '';
      const resetUrl = `${platformUrl}/reset-password?token=${token}`;

      notificationService.onPasswordReset(
        { userId: user.id, firstName: user.username, email: user.email || '' },
        { reset_password_url: resetUrl }
      ).catch(err => console.error('Failed to send password reset email:', err));

      res.json({ success: true });
    } catch (error) {
      console.error('Forgot password error:', error);
      res.status(500).json({ error: 'Failed to process request' });
    }
  });

  app.post('/api/auth/reset-password', async (req, res) => {
    try {
      const { token, password } = req.body;
      if (!token || !password) return res.status(400).json({ error: 'Token and password are required' });
      if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

      const resetToken = await storage.getPasswordResetToken(token);
      if (!resetToken) return res.status(400).json({ error: 'Invalid or expired reset token' });
      if (new Date() > resetToken.expiresAt) return res.status(400).json({ error: 'Reset token has expired' });

      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      await storage.updateUser(resetToken.userId, { passwordHash } as any);

      await storage.markPasswordResetTokenUsed(resetToken.id);

      res.json({ success: true });
    } catch (error) {
      console.error('Reset password error:', error);
      res.status(500).json({ error: 'Failed to reset password' });
    }
  });

  app.get('/api/auth/me', async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const user = await storage.getUser(req.session.userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    res.json({
      userId: user.id,
      role: user.role,
      username: user.username,
      email: user.email,
      avatarUrl: user.avatarUrl,
      phone: user.phone,
      clientProfileId: user.clientProfileId,
      vendorId: user.vendorId,
    });
  });
}
