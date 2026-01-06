import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Header } from "@/components/Header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ServicesListSection } from "./sections/ServicesListSection";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Loader2, Check, Package } from "lucide-react";
import type { Bundle, BundleItem, BundleLineItem, ServicePack, ServicePackItem, Service, ClientPackSubscription, ClientPaymentMethod } from "@shared/schema";

interface BillingInfo {
  paymentConfiguration: string;
  invoiceDay?: number;
  paymentMethods: ClientPaymentMethod[];
}

interface CurrentUser {
  userId: string;
  role: string;
  username: string;
  clientProfileId?: string | null;
}

interface BundleItemWithDetails extends BundleItem {
  service: Service | null;
  lineItem: BundleLineItem | null;
}

interface BundleWithItems extends Bundle {
  items: BundleItemWithDetails[];
}

interface PackWithItems extends ServicePack {
  items: (ServicePackItem & { service: Service | null })[];
}

async function getDefaultUser(): Promise<CurrentUser> {
  const response = await fetch("/api/default-user");
  if (!response.ok) {
    throw new Error("Failed to get default user");
  }
  return response.json();
}

async function fetchBundles(): Promise<BundleWithItems[]> {
  const response = await fetch("/api/public/bundles");
  if (!response.ok) {
    throw new Error("Failed to fetch bundles");
  }
  return response.json();
}

async function fetchPacks(): Promise<PackWithItems[]> {
  const response = await fetch("/api/public/service-packs");
  if (!response.ok) {
    throw new Error("Failed to fetch service packs");
  }
  return response.json();
}

function BundlesTab(): JSX.Element {
  const { data: bundles = [], isLoading } = useQuery({
    queryKey: ["/api/public/bundles"],
    queryFn: fetchBundles,
  });

  const { data: currentUser } = useQuery({
    queryKey: ["/api/default-user"],
    queryFn: getDefaultUser,
  });

  const showPricing = currentUser && (currentUser.role === "client" || currentUser.role === "admin");
  const activeBundles = bundles;

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <p className="text-dark-gray">Loading bundles...</p>
      </div>
    );
  }

  if (activeBundles.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-dark-gray">No bundles available</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {activeBundles.map((bundle) => {
        const fullPrice = bundle.items.reduce((sum, item) => {
          let price = 0;
          if (item.service) {
            price = parseFloat(item.service.basePrice || "0");
          } else if (item.lineItem) {
            price = parseFloat(item.lineItem.price || "0");
          }
          return sum + (price * item.quantity);
        }, 0);
        const bundlePrice = parseFloat(bundle.finalPrice || "0");
        const savings = fullPrice - bundlePrice;

        return (
          <Link key={bundle.id} href={`/bundle-request/${bundle.id}`}>
            <Card 
              className="border border-[#f0f0f5] rounded-2xl overflow-hidden bg-white h-full cursor-pointer hover-elevate"
              data-testid={`card-bundle-${bundle.id}`}
            >
              <CardContent className="p-6">
              <div className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-4">
                  <h3 className="flex-1 font-semibold text-dark-blue-night">
                    {bundle.name}
                  </h3>
                  {showPricing && bundlePrice > 0 && (
                    <div className="flex flex-col items-end">
                      <span className="font-semibold text-sky-blue-accent whitespace-nowrap">
                        ${bundlePrice.toFixed(2)}
                      </span>
                      {savings > 0 && (
                        <span className="text-xs text-muted-foreground line-through">
                          ${fullPrice.toFixed(2)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                
                {bundle.description && (
                  <p className="text-sm text-dark-gray">
                    {bundle.description}
                  </p>
                )}

                <div className="flex flex-col gap-2 mt-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase">Includes:</p>
                  <div className="flex flex-wrap gap-1">
                    {bundle.items.map((item) => (
                      <Badge 
                        key={item.id} 
                        variant="secondary" 
                        className="text-xs"
                      >
                        {item.service?.title || item.lineItem?.name || "Item"} x{item.quantity}
                      </Badge>
                    ))}
                  </div>
                </div>

                {showPricing && savings > 0 && (
                  <div className="mt-2">
                    <Badge variant="outline" className="text-green-600 border-green-600">
                      Save ${savings.toFixed(2)}
                    </Badge>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
          </Link>
        );
      })}
    </div>
  );
}

function PacksTab(): JSX.Element {
  const { toast } = useToast();
  const [subscribingPackId, setSubscribingPackId] = useState<string | null>(null);
  const [confirmingPack, setConfirmingPack] = useState<PackWithItems | null>(null);
  const [showPaymentRequired, setShowPaymentRequired] = useState(false);
  
  const { data: packs = [], isLoading } = useQuery({
    queryKey: ["/api/public/service-packs"],
    queryFn: fetchPacks,
  });

  const { data: currentUser } = useQuery({
    queryKey: ["/api/default-user"],
    queryFn: getDefaultUser,
  });

  const clientProfileId = currentUser?.clientProfileId;
  const isClientAdmin = currentUser?.role === "client" && clientProfileId;
  
  // Fetch billing info for payment validation
  const { data: billingInfo, isLoading: billingLoading } = useQuery<BillingInfo>({
    queryKey: ["/api/billing/client-info", clientProfileId],
    queryFn: async () => {
      const res = await fetch(`/api/billing/client-info?clientProfileId=${clientProfileId}`);
      if (!res.ok) throw new Error("Failed to fetch billing info");
      return res.json();
    },
    enabled: !!clientProfileId,
  });
  
  const { data: existingSubscriptions = [], isError: subscriptionsError } = useQuery<ClientPackSubscription[]>({
    queryKey: ["/api/service-pack-subscriptions", clientProfileId],
    queryFn: async () => {
      if (!clientProfileId) return [];
      const res = await fetch(`/api/service-pack-subscriptions?clientProfileId=${clientProfileId}`);
      if (!res.ok) {
        throw new Error("Failed to load subscriptions");
      }
      return res.json();
    },
    enabled: !!clientProfileId,
  });

  const subscribeMutation = useMutation({
    mutationFn: async (packId: string) => {
      setSubscribingPackId(packId);
      return apiRequest("POST", "/api/service-pack-subscriptions", {
        clientProfileId,
        packId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-pack-subscriptions", clientProfileId] });
      toast({ title: "Successfully subscribed to pack!" });
      setSubscribingPackId(null);
      setConfirmingPack(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setSubscribingPackId(null);
    },
  });
  
  const handleSubscribeClick = (pack: PackWithItems) => {
    setConfirmingPack(pack);
  };
  
  const handleConfirmSubscribe = () => {
    if (!confirmingPack) return;
    
    // Only validate payment if billing info is loaded
    if (billingInfo) {
      // Check if payment method is required (not deduct_from_royalties)
      const requiresPaymentMethod = billingInfo.paymentConfiguration !== "deduct_from_royalties";
      const hasPaymentMethod = billingInfo.paymentMethods && billingInfo.paymentMethods.length > 0;
      
      if (requiresPaymentMethod && !hasPaymentMethod) {
        setConfirmingPack(null);
        setShowPaymentRequired(true);
        return;
      }
    }
    
    subscribeMutation.mutate(confirmingPack.id);
  };
  
  // Disable subscribe button while billing info is loading
  const isSubscribeDisabled = subscribeMutation.isPending || (!!isClientAdmin && billingLoading);

  const isSubscribed = (packId: string) => {
    return existingSubscriptions.some(sub => sub.packId === packId && sub.isActive);
  };
  
  const isSubscribing = (packId: string) => {
    return subscribingPackId === packId && subscribeMutation.isPending;
  };

  const showPricing = currentUser && (currentUser.role === "client" || currentUser.role === "admin");
  const activePacks = packs;

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <p className="text-dark-gray">Loading monthly packs...</p>
      </div>
    );
  }

  if (activePacks.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-dark-gray">No monthly packs available</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {activePacks.map((pack) => {
        const fullPrice = pack.items.reduce((sum, item) => {
          const price = parseFloat(item.service?.basePrice || "0");
          return sum + (price * item.quantity);
        }, 0);
        const packPrice = parseFloat(pack.price || "0");
        const savings = fullPrice - packPrice;
        const alreadySubscribed = isSubscribed(pack.id);

        return (
          <Card 
            key={pack.id} 
            className="border border-[#f0f0f5] rounded-2xl overflow-hidden bg-white h-full flex flex-col min-h-[320px]"
            data-testid={`card-pack-${pack.id}`}
          >
            <CardContent className="p-6 flex flex-col flex-1">
              <div className="flex flex-col gap-3 flex-1">
                <div className="flex items-start justify-between gap-4">
                  <h3 className="flex-1 font-semibold text-dark-blue-night">
                    {pack.name}
                  </h3>
                  {showPricing && packPrice > 0 && (
                    <div className="flex flex-col items-end">
                      <span className="font-semibold text-sky-blue-accent whitespace-nowrap">
                        ${packPrice.toFixed(2)}/mo
                      </span>
                      {savings > 0 && (
                        <span className="text-xs text-muted-foreground line-through">
                          ${fullPrice.toFixed(2)}/mo
                        </span>
                      )}
                    </div>
                  )}
                </div>
                
                {pack.description && (
                  <p className="text-sm text-dark-gray">
                    {pack.description}
                  </p>
                )}

                <div className="flex flex-col gap-2 mt-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase">Monthly Allowance:</p>
                  <div className="flex flex-wrap gap-1">
                    {pack.items.map((item) => (
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

                {showPricing && savings > 0 && (
                  <div className="mt-2 mb-4">
                    <Badge variant="outline" className="text-green-600 border-green-600">
                      Save ${savings.toFixed(2)}/mo
                    </Badge>
                  </div>
                )}
              </div>

              {isClientAdmin && (
                <div className="mt-auto pt-4 border-t border-border">
                  {alreadySubscribed ? (
                    <Button
                      variant="outline"
                      className="w-full"
                      disabled
                      data-testid={`button-subscribed-pack-${pack.id}`}
                    >
                      <Check className="h-4 w-4 mr-2" />
                      Subscribed
                    </Button>
                  ) : (
                    <Button
                      className="w-full"
                      onClick={() => handleSubscribeClick(pack)}
                      data-testid={`button-subscribe-pack-${pack.id}`}
                    >
                      Subscribe
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      <Dialog open={!!confirmingPack} onOpenChange={(open) => !open && setConfirmingPack(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Confirm Subscription
            </DialogTitle>
            <DialogDescription>
              You are about to subscribe to a monthly pack. This will be a recurring charge each month.
            </DialogDescription>
          </DialogHeader>
          
          {confirmingPack && (
            <div className="space-y-4 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-lg">{confirmingPack.name}</h3>
                  {confirmingPack.description && (
                    <p className="text-sm text-muted-foreground mt-1">{confirmingPack.description}</p>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-xl font-bold text-primary">
                    ${parseFloat(confirmingPack.price || "0").toFixed(2)}
                  </span>
                  <span className="text-muted-foreground">/mo</span>
                </div>
              </div>
              
              <div className="border-t pt-4">
                <p className="text-sm font-medium text-muted-foreground uppercase mb-2">
                  Included Services:
                </p>
                <div className="flex flex-wrap gap-1">
                  {confirmingPack.items.map((item) => (
                    <Badge key={item.id} variant="secondary" className="text-xs">
                      {item.service?.title || "Service"} x{item.quantity}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}
          
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmingPack(null)}
              disabled={isSubscribeDisabled}
              data-testid="button-cancel-subscription"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmSubscribe}
              disabled={isSubscribeDisabled}
              data-testid="button-confirm-subscription"
            >
              {isSubscribeDisabled ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Subscribe
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Payment Method Required Dialog */}
      <Dialog open={showPaymentRequired} onOpenChange={setShowPaymentRequired}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Payment Method Required</DialogTitle>
            <DialogDescription>
              A credit card is required to subscribe to a monthly pack. Please add a payment method first.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setShowPaymentRequired(false)}
              data-testid="button-cancel-payment-required"
            >
              Cancel
            </Button>
            <Link href="/payments">
              <Button data-testid="button-go-to-payments">
                Go to Payments
              </Button>
            </Link>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const ServicesRequestAd = (): JSX.Element => {
  return (
    <main className="flex flex-col w-full min-h-screen bg-light-grey">
      <Header />
      <div className="flex flex-col items-center w-full flex-1 px-8 py-6">
        <section className="flex items-center justify-between w-full max-w-6xl mb-8">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold text-dark-blue-night">
              Available Services
            </h1>
            <p className="text-dark-gray">
              Choose from our range of artwork services for promotional products
            </p>
          </div>
        </section>

        <Tabs defaultValue="adhoc" className="w-full max-w-6xl">
          <TabsList className="mb-6 bg-transparent border-b border-border rounded-none h-auto p-0 gap-6" data-testid="tabs-services">
            <TabsTrigger 
              value="adhoc" 
              data-testid="tab-adhoc"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-dark-blue-night data-[state=active]:bg-transparent data-[state=active]:shadow-none pb-3 px-1 text-base font-medium text-muted-foreground data-[state=active]:text-dark-blue-night"
            >
              Ad-hoc Services
            </TabsTrigger>
            <TabsTrigger 
              value="bundles" 
              data-testid="tab-bundles"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-dark-blue-night data-[state=active]:bg-transparent data-[state=active]:shadow-none pb-3 px-1 text-base font-medium text-muted-foreground data-[state=active]:text-dark-blue-night"
            >
              Bundle Services
            </TabsTrigger>
            <TabsTrigger 
              value="packs" 
              data-testid="tab-packs"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-dark-blue-night data-[state=active]:bg-transparent data-[state=active]:shadow-none pb-3 px-1 text-base font-medium text-muted-foreground data-[state=active]:text-dark-blue-night"
            >
              Monthly Packs
            </TabsTrigger>
          </TabsList>

          <TabsContent value="adhoc">
            <ServicesListSectionContent />
          </TabsContent>

          <TabsContent value="bundles">
            <BundlesTab />
          </TabsContent>

          <TabsContent value="packs">
            <PacksTab />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
};

function ServicesListSectionContent(): JSX.Element {
  return <ServicesListSection showHeader={false} />;
}
