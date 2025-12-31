import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, CreditCard, Plus, Trash2, Star, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import type { ClientPaymentMethod, BillingAddress } from "@shared/schema";

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || "");

interface BillingInfo {
  paymentConfiguration: string;
  invoiceDay: number | null;
  billingAddress: BillingAddress | null;
  stripeCustomerId: string | null;
  paymentMethods: ClientPaymentMethod[];
}

interface AddPaymentMethodFormProps {
  clientProfileId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

function AddPaymentMethodForm({ clientProfileId, onSuccess, onCancel }: AddPaymentMethodFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [billingAddress, setBillingAddress] = useState<BillingAddress>({
    line1: "",
    line2: "",
    city: "",
    state: "",
    postalCode: "",
    country: "US",
  });

  const setupIntentMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/billing/create-setup-intent", {
        clientProfileId,
      });
      return res.json();
    },
  });

  const savePaymentMethodMutation = useMutation({
    mutationFn: async ({ paymentMethodId }: { paymentMethodId: string }) => {
      const res = await apiRequest("POST", "/api/billing/save-payment-method", {
        paymentMethodId,
        billingAddress,
        setAsDefault: true,
        clientProfileId,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/billing/client-info"] });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/payment-methods"] });
      toast({
        title: "Success",
        description: "Payment method added successfully",
      });
      onSuccess();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save payment method",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);

    try {
      const { clientSecret } = await setupIntentMutation.mutateAsync();

      const cardElement = elements.getElement(CardElement);
      if (!cardElement) {
        throw new Error("Card element not found");
      }

      const { error, setupIntent } = await stripe.confirmCardSetup(clientSecret, {
        payment_method: {
          card: cardElement,
          billing_details: {
            address: {
              line1: billingAddress.line1 || undefined,
              line2: billingAddress.line2 || undefined,
              city: billingAddress.city || undefined,
              state: billingAddress.state || undefined,
              postal_code: billingAddress.postalCode || undefined,
              country: billingAddress.country || "US",
            },
          },
        },
      });

      if (error) {
        throw new Error(error.message);
      }

      if (setupIntent?.payment_method) {
        await savePaymentMethodMutation.mutateAsync({
          paymentMethodId: setupIntent.payment_method as string,
        });
      }
    } catch (error: unknown) {
      const err = error as Error;
      toast({
        title: "Error",
        description: err.message || "Failed to add payment method",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const cardElementOptions = {
    style: {
      base: {
        fontSize: "16px",
        color: "#424770",
        "::placeholder": {
          color: "#aab7c4",
        },
      },
      invalid: {
        color: "#9e2146",
      },
    },
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Card Information</Label>
        <div className="p-3 border rounded-md bg-background">
          <CardElement options={cardElementOptions} />
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="font-medium text-sm">Billing Address</h4>
        <div className="grid grid-cols-1 gap-3">
          <div>
            <Label htmlFor="line1">Address Line 1</Label>
            <Input
              id="line1"
              value={billingAddress.line1 || ""}
              onChange={(e) => setBillingAddress({ ...billingAddress, line1: e.target.value })}
              placeholder="123 Main St"
              data-testid="input-billing-line1"
            />
          </div>
          <div>
            <Label htmlFor="line2">Address Line 2 (Optional)</Label>
            <Input
              id="line2"
              value={billingAddress.line2 || ""}
              onChange={(e) => setBillingAddress({ ...billingAddress, line2: e.target.value })}
              placeholder="Apt, Suite, etc."
              data-testid="input-billing-line2"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={billingAddress.city || ""}
                onChange={(e) => setBillingAddress({ ...billingAddress, city: e.target.value })}
                placeholder="City"
                data-testid="input-billing-city"
              />
            </div>
            <div>
              <Label htmlFor="state">State</Label>
              <Input
                id="state"
                value={billingAddress.state || ""}
                onChange={(e) => setBillingAddress({ ...billingAddress, state: e.target.value })}
                placeholder="State"
                data-testid="input-billing-state"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="postalCode">Postal Code</Label>
              <Input
                id="postalCode"
                value={billingAddress.postalCode || ""}
                onChange={(e) => setBillingAddress({ ...billingAddress, postalCode: e.target.value })}
                placeholder="12345"
                data-testid="input-billing-postal"
              />
            </div>
            <div>
              <Label htmlFor="country">Country</Label>
              <Input
                id="country"
                value={billingAddress.country || "US"}
                onChange={(e) => setBillingAddress({ ...billingAddress, country: e.target.value })}
                placeholder="US"
                data-testid="input-billing-country"
              />
            </div>
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} data-testid="button-cancel-add-card">
          Cancel
        </Button>
        <Button type="submit" disabled={!stripe || isProcessing} data-testid="button-save-card">
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Plus className="mr-2 h-4 w-4" />
              Add Card
            </>
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}

interface BillingTabProps {
  clientProfileId: string;
  isAdmin?: boolean;
  isPrimaryClient?: boolean;
}

export default function BillingTab({ clientProfileId, isAdmin = false, isPrimaryClient = false }: BillingTabProps) {
  const { toast } = useToast();
  const [addCardOpen, setAddCardOpen] = useState(false);
  const [deletingCardId, setDeletingCardId] = useState<string | null>(null);

  const { data: billingInfo, isLoading } = useQuery<BillingInfo>({
    queryKey: ["/api/billing/client-info", clientProfileId],
    queryFn: async () => {
      const res = await fetch(`/api/billing/client-info?clientProfileId=${clientProfileId}`);
      if (!res.ok) throw new Error("Failed to fetch billing info");
      return res.json();
    },
    enabled: !!clientProfileId,
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (paymentMethodId: string) => {
      const res = await apiRequest("POST", "/api/billing/set-default-payment-method", {
        paymentMethodId,
        clientProfileId,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/billing/client-info", clientProfileId] });
      toast({
        title: "Success",
        description: "Default payment method updated",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update default payment method",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/billing/payment-methods/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/billing/client-info", clientProfileId] });
      toast({
        title: "Success",
        description: "Payment method removed",
      });
      setDeletingCardId(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove payment method",
        variant: "destructive",
      });
    },
  });

  const getPaymentConfigLabel = (config: string) => {
    switch (config) {
      case "pay_as_you_go":
        return "Pay as You Go";
      case "monthly_payment":
        return "Monthly Payment";
      case "deduct_from_royalties":
        return "Deduct from Royalties";
      default:
        return config;
    }
  };

  const getCardBrandIcon = (brand: string) => {
    return <CreditCard className="h-5 w-5" />;
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  const canManageCards = isAdmin || isPrimaryClient;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Payment Configuration
          </CardTitle>
          <CardDescription>
            Your current billing configuration
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Payment Type</p>
              <p className="font-medium" data-testid="text-payment-config">
                {getPaymentConfigLabel(billingInfo?.paymentConfiguration || "pay_as_you_go")}
              </p>
            </div>
            {billingInfo?.paymentConfiguration === "monthly_payment" && billingInfo?.invoiceDay && (
              <div>
                <p className="text-sm text-muted-foreground">Invoice Day</p>
                <p className="font-medium" data-testid="text-invoice-day">
                  {billingInfo.invoiceDay}{billingInfo.invoiceDay === 1 ? "st" : billingInfo.invoiceDay === 2 ? "nd" : billingInfo.invoiceDay === 3 ? "rd" : "th"} of each month
                </p>
              </div>
            )}
            {billingInfo?.billingAddress && (
              <div>
                <p className="text-sm text-muted-foreground">Billing Address</p>
                <p className="font-medium text-sm" data-testid="text-billing-address">
                  {[
                    billingInfo.billingAddress.line1,
                    billingInfo.billingAddress.city,
                    billingInfo.billingAddress.state,
                    billingInfo.billingAddress.postalCode,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Saved Payment Methods
            </CardTitle>
            <CardDescription>
              Manage your saved cards for payments
            </CardDescription>
          </div>
          {canManageCards && (
            <Dialog open={addCardOpen} onOpenChange={setAddCardOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-payment-method">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Card
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Add Payment Method</DialogTitle>
                </DialogHeader>
                <Elements stripe={stripePromise}>
                  <AddPaymentMethodForm
                    clientProfileId={clientProfileId}
                    onSuccess={() => setAddCardOpen(false)}
                    onCancel={() => setAddCardOpen(false)}
                  />
                </Elements>
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>
        <CardContent>
          {(!billingInfo?.paymentMethods || billingInfo.paymentMethods.length === 0) ? (
            <div className="text-center py-6 text-muted-foreground">
              <CreditCard className="mx-auto h-12 w-12 mb-2 opacity-50" />
              <p>No payment methods saved</p>
              {canManageCards && (
                <p className="text-sm mt-1">Add a card to enable payments</p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {billingInfo.paymentMethods.map((method) => (
                <div
                  key={method.id}
                  className="flex items-center justify-between p-4 border rounded-md"
                  data-testid={`card-payment-method-${method.id}`}
                >
                  <div className="flex items-center gap-3">
                    {getCardBrandIcon(method.brand)}
                    <div>
                      <p className="font-medium capitalize">
                        {method.brand} ending in {method.last4}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Expires {method.expMonth}/{method.expYear}
                      </p>
                    </div>
                    {method.isDefault && (
                      <Badge variant="secondary" className="ml-2">
                        <Star className="h-3 w-3 mr-1" />
                        Default
                      </Badge>
                    )}
                  </div>
                  {canManageCards && (
                    <div className="flex items-center gap-2">
                      {!method.isDefault && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDefaultMutation.mutate(method.id)}
                          disabled={setDefaultMutation.isPending}
                          data-testid={`button-set-default-${method.id}`}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          Set Default
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeletingCardId(method.id)}
                        data-testid={`button-delete-card-${method.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!deletingCardId} onOpenChange={() => setDeletingCardId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Payment Method</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            Are you sure you want to remove this payment method? This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingCardId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deletingCardId && deleteMutation.mutate(deletingCardId)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete-card"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Remove"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
