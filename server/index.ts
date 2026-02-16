import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import MemoryStore from "memorystore";
import passport from "passport";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    userRole?: string;
    impersonatorId?: string;
  }
}

const app = express();

// Stripe webhook must use raw body for signature verification - register before express.json()
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const { stripeService } = await import("./services/stripeService");
  const { storage } = await import("./storage");
  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('Stripe webhook secret not configured');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  if (!sig) {
    return res.status(400).json({ error: 'Missing stripe-signature header' });
  }

  try {
    const event = await stripeService.verifyWebhookSignature(
      req.body,
      sig as string,
      webhookSecret
    );

    const existingEvent = await storage.getStripeEvent(event.id);
    if (existingEvent?.processed) {
      return res.json({ received: true, message: 'Event already processed' });
    }

    let stripeEventRecord;
    if (existingEvent) {
      stripeEventRecord = existingEvent;
    } else {
      stripeEventRecord = await storage.createStripeEvent({
        stripeEventId: event.id,
        eventType: event.type,
        eventData: event.data as any,
        processed: false,
      });
    }

    let processingSuccessful = true;
    try {
      switch (event.type) {
        case 'payment_intent.succeeded': {
          const paymentIntent = event.data.object as any;
          const payment = await storage.getPaymentByStripeId(paymentIntent.id);
          if (payment) {
            await storage.updatePayment(payment.id, {
              status: 'succeeded',
              paidAt: new Date(),
            });
          }
          break;
        }

        case 'payment_intent.payment_failed': {
          const paymentIntent = event.data.object as any;
          const payment = await storage.getPaymentByStripeId(paymentIntent.id);
          if (payment) {
            await storage.updatePayment(payment.id, {
              status: 'failed',
              failureReason: paymentIntent.last_payment_error?.message || 'Payment failed',
            });
          }
          break;
        }

        case 'charge.refunded': {
          const charge = event.data.object as any;
          const paymentIntent = charge.payment_intent;
          if (paymentIntent) {
            const payment = await storage.getPaymentByStripeId(paymentIntent);
            if (payment) {
              const refundedAmount = charge.amount_refunded;
              const isFullRefund = refundedAmount >= payment.amountCents;
              await storage.updatePayment(payment.id, {
                status: isFullRefund ? 'refunded' : 'partially_refunded',
                refundedAt: new Date(),
                refundedAmount: refundedAmount,
              });
            }
          }
          break;
        }

        // ============= Pack Subscription Webhook Events =============

        case 'invoice.paid': {
          // Successful subscription payment (initial or renewal)
          const invoice = event.data.object as any;
          const subscriptionId = invoice.subscription;
          
          if (subscriptionId) {
            // Find our subscription by Stripe subscription ID (efficient O(1) lookup)
            const localSub = await storage.getClientPackSubscriptionByStripeId(subscriptionId);
            
            if (localSub) {
              // Retrieve the subscription to get accurate period dates
              // (invoice.lines may have multiple lines or be empty for prorations)
              let currentPeriodStart: Date | undefined;
              let currentPeriodEnd: Date | undefined;
              try {
                const stripeSubResp = await stripe.subscriptions.retrieve(subscriptionId) as any;
                currentPeriodStart = new Date(stripeSubResp.current_period_start * 1000);
                currentPeriodEnd = new Date(stripeSubResp.current_period_end * 1000);
              } catch (err) {
                console.error("Error retrieving subscription for period dates:", err);
                // Fall back to invoice lines if subscription retrieval fails
                if (invoice.lines?.data?.[0]?.period?.start) {
                  currentPeriodStart = new Date(invoice.lines.data[0].period.start * 1000);
                }
                if (invoice.lines?.data?.[0]?.period?.end) {
                  currentPeriodEnd = new Date(invoice.lines.data[0].period.end * 1000);
                }
              }
              
              // Update subscription status and clear any grace period
              await storage.updateClientPackSubscription(localSub.id, {
                stripeStatus: 'active',
                isActive: true,
                paymentFailedAt: null,
                gracePeriodEndsAt: null,
                currentPeriodStart,
                currentPeriodEnd,
              });
              console.log(`Invoice paid for subscription ${localSub.id}`);
            }
          }
          break;
        }

        case 'invoice.payment_failed': {
          // Failed subscription payment - start grace period
          const invoice = event.data.object as any;
          const subscriptionId = invoice.subscription;
          
          if (subscriptionId) {
            const localSub = await storage.getClientPackSubscriptionByStripeId(subscriptionId);
            
            if (localSub) {
              // Set 2-week grace period from first failure
              const now = new Date();
              const gracePeriodEndsAt = new Date(now);
              gracePeriodEndsAt.setDate(gracePeriodEndsAt.getDate() + 14); // 2 weeks
              
              await storage.updateClientPackSubscription(localSub.id, {
                stripeStatus: 'past_due',
                paymentFailedAt: localSub.paymentFailedAt || now, // Only set if not already set
                gracePeriodEndsAt: localSub.gracePeriodEndsAt || gracePeriodEndsAt, // Only set if not already set
              });
              console.log(`Payment failed for subscription ${localSub.id}, grace period ends: ${gracePeriodEndsAt}`);
            }
          }
          break;
        }

        case 'customer.subscription.updated': {
          // Subscription status changed (e.g., from past_due to active after retry)
          const subscription = event.data.object as any;
          const localSub = await storage.getClientPackSubscriptionByStripeId(subscription.id);
          
          if (localSub) {
            const updateData: any = {
              stripeStatus: subscription.status,
              currentPeriodStart: new Date(subscription.current_period_start * 1000),
              currentPeriodEnd: new Date(subscription.current_period_end * 1000),
            };
            
            // If status is active, clear grace period
            if (subscription.status === 'active') {
              updateData.paymentFailedAt = null;
              updateData.gracePeriodEndsAt = null;
              updateData.isActive = true;
            }
            
            // If cancel_at_period_end is set, capture the cancel_at timestamp
            if (subscription.cancel_at_period_end) {
              updateData.stripeStatus = 'cancel_at_period_end';
              if (subscription.cancel_at) {
                updateData.cancelAt = new Date(subscription.cancel_at * 1000);
              }
            }
            
            await storage.updateClientPackSubscription(localSub.id, updateData);
            console.log(`Subscription ${localSub.id} updated: ${subscription.status}`);
          }
          break;
        }

        case 'customer.subscription.deleted': {
          // Subscription fully canceled
          const subscription = event.data.object as any;
          const localSub = await storage.getClientPackSubscriptionByStripeId(subscription.id);
          
          if (localSub) {
            await storage.updateClientPackSubscription(localSub.id, {
              stripeStatus: 'canceled',
              isActive: false,
              endDate: new Date(),
            });
            console.log(`Subscription ${localSub.id} canceled`);
          }
          break;
        }
      }
    } catch (processingError) {
      console.error('Error processing webhook event:', processingError);
      processingSuccessful = false;
    }

    if (processingSuccessful) {
      await storage.markStripeEventProcessed(stripeEventRecord.id);
    }

    res.json({ received: true });
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const MemStore = MemoryStore(session);

app.use(session({
  secret: process.env.SESSION_SECRET || 'artwork-demo-secret',
  resave: false,
  saveUninitialized: true,
  cookie: { 
    secure: false,
    maxAge: 24 * 60 * 60 * 1000 
  },
  store: new MemStore({
    checkPeriod: 86400000
  })
}));

app.use(passport.initialize());
app.use(passport.session());

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const { cronScheduler } = await import("./services/cronScheduler");
  cronScheduler.initialize();
  
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, async () => {
    log(`serving on port ${port}`);

    // TEMPORARY: One-time fix to switch auth_login_type to "role" on staging
    try {
      const { storage } = await import("./storage");
      const authSetting = await storage.getSystemSetting("auth_login_type");
      if (authSetting?.settingValue === "auth") {
        await storage.setSystemSetting("auth_login_type", "role");
        log(`[STARTUP FIX] Switched auth_login_type from "auth" to "role"`);
      }
    } catch (e) {
      log(`[STARTUP FIX] Failed to update auth setting: ${e}`);
    }
  });
})();
