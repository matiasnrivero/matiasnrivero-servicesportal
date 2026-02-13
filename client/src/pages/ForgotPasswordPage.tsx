import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import logoImg from "@assets/left_alligned_Services_1770755353119.png";

export default function ForgotPasswordPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
        credentials: "include",
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Request failed");
      }
      setSubmitted(true);
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "An error occurred",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30">
      <div className="flex flex-col items-center gap-6 max-w-md w-full px-4">
        <img src={logoImg} alt="Tri-POD Services" className="h-12" data-testid="img-logo" />
        <Card className="w-full">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl" data-testid="text-forgot-password-heading">Reset Password</CardTitle>
            <CardDescription data-testid="text-forgot-password-description">
              Enter your email and we'll send you a link to reset your password
            </CardDescription>
          </CardHeader>
          <CardContent>
            {submitted ? (
              <div className="flex flex-col gap-4 text-center">
                <p className="text-sm text-muted-foreground" data-testid="text-success-message">
                  If an account exists with that email, you'll receive a reset link shortly.
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
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    data-testid="input-email"
                  />
                </div>
                <Button type="submit" disabled={isLoading} className="w-full" data-testid="button-send-reset-link">
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Send Reset Link
                </Button>
                <a
                  href="/login"
                  onClick={(e) => { e.preventDefault(); setLocation("/login"); }}
                  className="text-sm text-sky-blue-accent hover:underline text-center"
                  data-testid="link-back-to-login"
                >
                  Back to Sign In
                </a>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
