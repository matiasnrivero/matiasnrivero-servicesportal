import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, CreditCard, Plus, Trash2, Star, CheckCircle2, Pencil, Package, Calendar, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import type { ClientPaymentMethod, BillingAddress, ServicePack, ServicePackItem, ClientPackSubscription, ServicePackUsage } from "@shared/schema";
import { format } from "date-fns";

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
      queryClient.invalidateQueries({ queryKey: ["/api/billing/client-info", clientProfileId] });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/payment-methods", clientProfileId] });
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
              <Select
                value={billingAddress.country || "US"}
                onValueChange={(value) => setBillingAddress({ ...billingAddress, country: value })}
              >
                <SelectTrigger data-testid="select-billing-country">
                  <SelectValue placeholder="Select country" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="US">United States</SelectItem>
                  <SelectItem value="CA">Canada</SelectItem>
                  <SelectItem value="GB">United Kingdom</SelectItem>
                  <SelectItem value="AU">Australia</SelectItem>
                  <SelectItem value="DE">Germany</SelectItem>
                  <SelectItem value="FR">France</SelectItem>
                  <SelectItem value="MX">Mexico</SelectItem>
                </SelectContent>
              </Select>
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

interface PackWithItems extends ServicePack {
  packItems?: ServicePackItem[];
  items?: ServicePackItem[];
}

interface SubscriptionWithUsage extends ClientPackSubscription {
  pack?: ServicePack;
  packItems?: ServicePackItem[];
  totalIncluded?: number;
  totalUsed?: number;
}

export default function BillingTab({ clientProfileId, isAdmin = false, isPrimaryClient = false }: BillingTabProps) {
  const { toast } = useToast();
  const [addCardOpen, setAddCardOpen] = useState(false);
  const [deletingCardId, setDeletingCardId] = useState<string | null>(null);
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [paymentConfig, setPaymentConfig] = useState("pay_as_you_go");
  const [invoiceDay, setInvoiceDay] = useState<number>(1);
  const [subscribeDialogOpen, setSubscribeDialogOpen] = useState(false);
  const [selectedPackForSubscribe, setSelectedPackForSubscribe] = useState<PackWithItems | null>(null);
  const [cancelSubscriptionId, setCancelSubscriptionId] = useState<string | null>(null);

  const { data: billingInfo, isLoading } = useQuery<BillingInfo>({
    queryKey: ["/api/billing/client-info", clientProfileId],
    queryFn: async () => {
      const res = await fetch(`/api/billing/client-info?clientProfileId=${clientProfileId}`);
      if (!res.ok) throw new Error("Failed to fetch billing info");
      return res.json();
    },
    enabled: !!clientProfileId,
  });

  // Fetch available service packs (active only)
  const { data: availablePacks = [] } = useQuery<PackWithItems[]>({
    queryKey: ["/api/public/service-packs"],
    queryFn: async () => {
      const res = await fetch("/api/public/service-packs");
      if (!res.ok) throw new Error("Failed to fetch packs");
      return res.json();
    },
  });

  // Fetch client's current subscriptions
  const { data: subscriptions = [], isLoading: subscriptionsLoading } = useQuery<SubscriptionWithUsage[]>({
    queryKey: ["/api/service-pack-subscriptions", clientProfileId],
    queryFn: async () => {
      const res = await fetch(`/api/service-pack-subscriptions?clientProfileId=${clientProfileId}`);
      if (!res.ok) throw new Error("Failed to fetch subscriptions");
      return res.json();
    },
    enabled: !!clientProfileId,
  });

  // Filter active packs (only show those not already subscribed)
  const activePacks = availablePacks.filter(pack => 
    pack.isActive && !subscriptions.some(sub => sub.packId === pack.id && sub.isActive)
  );

  // Subscribe to a pack mutation
  const subscribeMutation = useMutation({
    mutationFn: async (packId: string) => {
      const res = await apiRequest("POST", "/api/service-pack-subscriptions", {
        clientProfileId,
        packId,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-pack-subscriptions", clientProfileId] });
      toast({
        title: "Success",
        description: "Successfully subscribed to the pack",
      });
      setSubscribeDialogOpen(false);
      setSelectedPackForSubscribe(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to subscribe to pack",
        variant: "destructive",
      });
    },
  });

  // Cancel subscription mutation
  const cancelSubscriptionMutation = useMutation({
    mutationFn: async (subscriptionId: string) => {
      const res = await apiRequest("PATCH", `/api/service-pack-subscriptions/${subscriptionId}/cancel`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-pack-subscriptions", clientProfileId] });
      toast({
        title: "Success",
        description: "Subscription cancelled successfully",
      });
      setCancelSubscriptionId(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to cancel subscription",
        variant: "destructive",
      });
    },
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
      queryClient.invalidateQueries({ queryKey: ["/api/billing/payment-methods", clientProfileId] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/billing/payment-methods", clientProfileId] });
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

  const updateConfigMutation = useMutation({
    mutationFn: async (data: { paymentConfiguration: string; invoiceDay?: number }) => {
      if (data.paymentConfiguration === "monthly_payment") {
        const day = data.invoiceDay ?? 1;
        if (day < 1 || day > 28) {
          throw new Error("Invoice day must be between 1 and 28");
        }
      }
      const res = await apiRequest("PATCH", `/api/billing/client-config/${clientProfileId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/billing/client-info", clientProfileId] });
      toast({
        title: "Success",
        description: "Payment configuration updated",
      });
      setConfigDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update payment configuration",
        variant: "destructive",
      });
    },
  });

  const handleOpenConfigDialog = () => {
    if (billingInfo) {
      setPaymentConfig(billingInfo.paymentConfiguration || "pay_as_you_go");
      setInvoiceDay(billingInfo.invoiceDay || 1);
    }
    setConfigDialogOpen(true);
  };

  const handleSaveConfig = () => {
    const data: { paymentConfiguration: string; invoiceDay?: number } = {
      paymentConfiguration: paymentConfig,
    };
    if (paymentConfig === "monthly_payment") {
      data.invoiceDay = invoiceDay;
    }
    updateConfigMutation.mutate(data);
  };

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
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Payment Configuration
            </CardTitle>
            <CardDescription>
              {isAdmin ? "Manage client billing configuration" : "Your current billing configuration"}
            </CardDescription>
          </div>
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={handleOpenConfigDialog} data-testid="button-edit-payment-config">
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </Button>
          )}
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

      <Dialog open={configDialogOpen} onOpenChange={setConfigDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configure Payment Settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="paymentConfig">Payment Type</Label>
              <Select value={paymentConfig} onValueChange={setPaymentConfig}>
                <SelectTrigger data-testid="select-payment-config">
                  <SelectValue placeholder="Select payment type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pay_as_you_go">Pay as You Go</SelectItem>
                  <SelectItem value="monthly_payment">Monthly Payment</SelectItem>
                  <SelectItem value="deduct_from_royalties">Deduct from Royalties</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                {paymentConfig === "pay_as_you_go" && "Client pays immediately upon job completion."}
                {paymentConfig === "monthly_payment" && "Client is invoiced monthly for all completed jobs."}
                {paymentConfig === "deduct_from_royalties" && "Job costs are deducted from the client's Tri-POD app royalties."}
              </p>
            </div>
            {paymentConfig === "monthly_payment" && (
              <div className="space-y-2">
                <Label htmlFor="invoiceDay">Invoice Day of Month</Label>
                <Select value={String(invoiceDay)} onValueChange={(v) => setInvoiceDay(parseInt(v))}>
                  <SelectTrigger data-testid="select-invoice-day">
                    <SelectValue placeholder="Select day" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                      <SelectItem key={day} value={String(day)}>
                        {day}{day === 1 ? "st" : day === 2 ? "nd" : day === 3 ? "rd" : "th"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  Invoice will be generated on this day each month.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfigDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveConfig} disabled={updateConfigMutation.isPending} data-testid="button-save-payment-config">
              {updateConfigMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Save Configuration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Monthly Pack Subscriptions Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Monthly Pack Subscriptions
            </CardTitle>
            <CardDescription>
              Subscribe to monthly packs for discounted service rates
            </CardDescription>
          </div>
          {(isAdmin || isPrimaryClient) && activePacks.length > 0 && (
            <Dialog open={subscribeDialogOpen} onOpenChange={setSubscribeDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-subscribe-pack">
                  <Plus className="mr-2 h-4 w-4" />
                  Subscribe to Pack
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Subscribe to Monthly Pack</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <p className="text-sm text-muted-foreground">
                    Choose a monthly pack to subscribe to. You will be charged the pack price each month and receive the included service quantities.
                  </p>
                  <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                    {activePacks.map((pack) => {
                      const packItems = pack.items || pack.packItems || [];
                      const packPrice = parseFloat(pack.price) || 0;
                      // Calculate full price based on individual service basePrice * quantities (matches Monthly Packs tab)
                      const fullPrice = packItems.reduce((sum: number, item: any) => {
                        const servicePrice = parseFloat(item.service?.basePrice || "0");
                        return sum + (servicePrice * item.quantity);
                      }, 0);
                      const savings = fullPrice > 0 ? fullPrice - packPrice : 0;
                      return (
                        <div
                          key={pack.id}
                          className={`p-4 border rounded-md cursor-pointer transition-colors ${
                            selectedPackForSubscribe?.id === pack.id ? "border-primary bg-primary/5" : ""
                          }`}
                          onClick={() => setSelectedPackForSubscribe(pack)}
                          data-testid={`pack-option-${pack.id}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <p className="font-medium">{pack.name}</p>
                              {pack.description && (
                                <p className="text-sm text-muted-foreground">{pack.description}</p>
                              )}
                              <div className="mt-2 flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-sky-blue-accent">
                                  ${packPrice.toFixed(2)}/mo
                                </span>
                                {fullPrice > 0 && savings > 0 && (
                                  <Badge variant="secondary" className="text-xs line-through">
                                    ${fullPrice.toFixed(2)}/mo
                                  </Badge>
                                )}
                              </div>
                              {packItems.length > 0 && (
                                <div className="flex flex-col gap-2 mt-3">
                                  <p className="text-xs font-medium text-muted-foreground uppercase">Monthly Allowance:</p>
                                  <div className="flex flex-wrap gap-1">
                                    {packItems.map((item: any) => (
                                      <Badge 
                                        key={item.id} 
                                        variant="secondary" 
                                        className="text-xs"
                                      >
                                        {item.service?.title || "Service"} x{item.quantity}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {savings > 0 && (
                                <div className="mt-2">
                                  <Badge variant="outline" className="text-green-600 border-green-600">
                                    Save ${savings.toFixed(2)}/mo
                                  </Badge>
                                </div>
                              )}
                            </div>
                            {selectedPackForSubscribe?.id === pack.id && (
                              <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => {
                    setSubscribeDialogOpen(false);
                    setSelectedPackForSubscribe(null);
                  }}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => selectedPackForSubscribe && subscribeMutation.mutate(selectedPackForSubscribe.id)}
                    disabled={!selectedPackForSubscribe || subscribeMutation.isPending}
                    data-testid="button-confirm-subscribe"
                  >
                    {subscribeMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : null}
                    Subscribe
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>
        <CardContent>
          {subscriptionsLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : subscriptions.filter(s => s.isActive).length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <Package className="mx-auto h-12 w-12 mb-2 opacity-50" />
              <p>No active pack subscriptions</p>
              {(isAdmin || isPrimaryClient) && activePacks.length > 0 && (
                <p className="text-sm mt-1">Subscribe to a pack to get discounted rates</p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {subscriptions.filter(s => s.isActive).map((subscription) => {
                const pack = subscription.pack || availablePacks.find(p => p.id === subscription.packId);
                const packItems = subscription.packItems || (pack as PackWithItems)?.packItems || (pack as PackWithItems)?.items || [];
                const totalQty = subscription.totalIncluded || packItems.reduce((sum: number, item: { quantity: number }) => sum + item.quantity, 0) || 0;
                const perUnitRate = totalQty > 0 ? parseFloat(subscription.priceAtSubscription || pack?.price || "0") / totalQty : 0;
                
                return (
                  <div
                    key={subscription.id}
                    className="p-4 border rounded-md"
                    data-testid={`subscription-${subscription.id}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium">{pack?.name || "Unknown Pack"}</p>
                          <Badge variant="secondary">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Active
                          </Badge>
                        </div>
                        {pack?.description && (
                          <p className="text-sm text-muted-foreground mt-1">{pack.description}</p>
                        )}
                        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground">Monthly Price</p>
                            <p className="font-medium">${subscription.priceAtSubscription || pack?.price || "0"}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Per-Unit Rate</p>
                            <p className="font-medium">${perUnitRate.toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Subscribed Since</p>
                            <p className="font-medium">
                              {subscription.startDate ? format(new Date(subscription.startDate), "MMM d, yyyy") : "-"}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Included Services</p>
                            <p className="font-medium">{totalQty} per month</p>
                          </div>
                        </div>
                      </div>
                      {(isAdmin || isPrimaryClient) && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCancelSubscriptionId(subscription.id)}
                          data-testid={`button-cancel-subscription-${subscription.id}`}
                        >
                          Unsubscribe
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cancel Subscription Dialog */}
      <Dialog open={!!cancelSubscriptionId} onOpenChange={() => setCancelSubscriptionId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Subscription</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            Are you sure you want to cancel this subscription? You will lose access to the discounted pack rates at the end of the billing period.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelSubscriptionId(null)}>
              Keep Subscription
            </Button>
            <Button
              variant="destructive"
              onClick={() => cancelSubscriptionId && cancelSubscriptionMutation.mutate(cancelSubscriptionId)}
              disabled={cancelSubscriptionMutation.isPending}
              data-testid="button-confirm-cancel-subscription"
            >
              {cancelSubscriptionMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Cancel Subscription"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
