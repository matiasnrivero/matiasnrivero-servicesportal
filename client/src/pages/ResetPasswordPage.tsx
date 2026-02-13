import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import logoImg from "@assets/left_alligned_Services_1770755353119.png";

export default function ResetPasswordPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const token = new URLSearchParams(window.location.search).get("token");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 8) {
      toast({ title: "Password too short", description: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }
    if (password !== confirmPassword) {
      toast({ title: "Passwords don't match", description: "Please make sure your passwords match", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
        credentials: "include",
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Reset failed");
      }
      setSuccess(true);
    } catch (err: any) {
      toast({
        title: "Reset failed",
        description: err.message || "An error occurred",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="flex flex-col items-center gap-6 max-w-md w-full px-4">
          <img src={logoImg} alt="Tri-POD Services" className="h-12" data-testid="img-logo" />
          <Card className="w-full">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl" data-testid="text-error-heading">Invalid Reset Link</CardTitle>
              <CardDescription data-testid="text-error-description">
                This password reset link is invalid or has expired.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <a
                href="/login"
                onClick={(e) => { e.preventDefault(); setLocation("/login"); }}
                className="text-sm text-sky-blue-accent hover:underline"
                data-testid="link-back-to-login"
              >
                Back to Sign In
              </a>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30">
      <div className="flex flex-col items-center gap-6 max-w-md w-full px-4">
        <img src={logoImg} alt="Tri-POD Services" className="h-12" data-testid="img-logo" />
        <Card className="w-full">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl" data-testid="text-reset-password-heading">Set New Password</CardTitle>
          </CardHeader>
          <CardContent>
            {success ? (
              <div className="flex flex-col gap-4 text-center">
                <p className="text-sm text-muted-foreground" data-testid="text-success-message">
                  Your password has been reset successfully.
                </p>
                <a
                  href="/login"
                  onClick={(e) => { e.preventDefault(); setLocation("/login"); }}
                  className="text-sm text-sky-blue-accent hover:underline"
                  data-testid="link-back-to-login"
                >
                  Back to Sign In
                </a>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="password">New Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter new password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    data-testid="input-password"
                  />
                  <span className="text-xs text-muted-foreground">Must be at least 8 characters</span>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    data-testid="input-confirm-password"
                  />
                </div>
                <Button type="submit" disabled={isLoading} className="w-full" data-testid="button-reset-password">
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Reset Password
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
