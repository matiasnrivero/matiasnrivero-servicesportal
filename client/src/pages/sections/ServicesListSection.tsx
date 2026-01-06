import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Service, ServicePricingTier, ClientPaymentMethod } from "@shared/schema";

interface CurrentUser {
  userId: string;
  role: string;
  username: string;
  clientProfileId?: string | null;
}

interface BillingInfo {
  paymentConfiguration: string;
  invoiceDay?: number;
  paymentMethods: ClientPaymentMethod[];
  tripodDiscountTier?: string;
}

// Helper to calculate discounted price (rounds up to nearest cent)
function applyTripodDiscount(price: number, discountTier: string): number {
  const discountPercentages: Record<string, number> = {
    none: 0,
    power_level: 10,
    oms_subscription: 15,
    enterprise: 20,
  };
  const discountPercent = discountPercentages[discountTier] || 0;
  if (discountPercent === 0) return price;
  const discountedPrice = price * (1 - discountPercent / 100);
  return Math.ceil(discountedPrice * 100) / 100;
}

interface PricingSettings {
  [serviceName: string]: {
    basePrice?: number;
    complexity?: Record<string, number>;
    quantity?: Record<string, number>;
  };
}

async function getDefaultUser(): Promise<CurrentUser> {
  const response = await fetch("/api/default-user");
  if (!response.ok) {
    throw new Error("Failed to get default user");
  }
  return response.json();
}

async function fetchPricingSettings(): Promise<PricingSettings> {
  const response = await fetch("/api/system-settings/pricing");
  if (!response.ok) return {};
  return response.json();
}

async function fetchServices(): Promise<Service[]> {
  // Default behavior now excludes son services (add-ons)
  const response = await fetch("/api/services");
  if (!response.ok) {
    throw new Error("Failed to fetch services");
  }
  return response.json();
}

async function fetchServiceTiers(serviceId: string): Promise<ServicePricingTier[]> {
  const response = await fetch(`/api/services/${serviceId}/tiers`);
  if (!response.ok) return [];
  return response.json();
}

interface ServicesListSectionProps {
  showHeader?: boolean;
}

export const ServicesListSection = ({ showHeader = true }: ServicesListSectionProps): JSX.Element => {
  const [pricingModalOpen, setPricingModalOpen] = useState(false);
  
  const { data: services = [], isLoading } = useQuery({
    queryKey: ["/api/services"],
    queryFn: fetchServices,
  });

  const { data: currentUser } = useQuery({
    queryKey: ["/api/default-user"],
    queryFn: getDefaultUser,
  });

  const clientProfileId = currentUser?.clientProfileId;

  // Fetch billing info to get discount tier
  const { data: billingInfo } = useQuery<BillingInfo>({
    queryKey: ["/api/billing/client-info", clientProfileId],
    queryFn: async () => {
      const res = await fetch(`/api/billing/client-info?clientProfileId=${clientProfileId}`);
      if (!res.ok) throw new Error("Failed to fetch billing info");
      return res.json();
    },
    enabled: !!clientProfileId,
  });

  const discountTier = billingInfo?.tripodDiscountTier || "none";
  const hasDiscount = discountTier !== "none";

  const { data: pricingSettings = {} } = useQuery({
    queryKey: ["/api/system-settings/pricing"],
    queryFn: fetchPricingSettings,
  });

  const activeServices = useMemo(() => {
    return services
      .filter((s) => s.isActive === 1)
      .sort((a, b) => (a.displayOrder || 999) - (b.displayOrder || 999));
  }, [services]);

  const { data: allTiers = {} } = useQuery({
    queryKey: ["/api/all-service-tiers", activeServices.map(s => s.id)],
    queryFn: async () => {
      const tierMap: Record<string, ServicePricingTier[]> = {};
      const tieredServices = activeServices.filter(
        s => s.pricingStructure === "complexity" || s.pricingStructure === "quantity"
      );
      await Promise.all(
        tieredServices.map(async (service) => {
          tierMap[service.id] = await fetchServiceTiers(service.id);
        })
      );
      return tierMap;
    },
    enabled: activeServices.length > 0,
  });

  const showPricing = currentUser && (currentUser.role === "client" || currentUser.role === "admin");

  // Returns {original, discounted} price info
  const getDisplayPriceInfo = (service: Service): { originalPrice: string; discountedPrice: string } => {
    const serviceName = service.title;
    const pricing = pricingSettings[serviceName];
    const tiers = allTiers[service.id] || [];

    let originalPrice = "";
    let discountedPrice = "";

    if (serviceName === "Store Creation") {
      return { originalPrice: "", discountedPrice: "" };
    }

    if (service.pricingStructure === "single") {
      const basePrice = pricing?.basePrice || parseFloat(service.basePrice || "0");
      if (basePrice > 0) {
        originalPrice = `$${basePrice}`;
        const discounted = applyTripodDiscount(basePrice, discountTier);
        discountedPrice = hasDiscount ? `$${discounted.toFixed(2)}` : `$${basePrice}`;
      }
      return { originalPrice: hasDiscount ? originalPrice : "", discountedPrice };
    }

    if (service.pricingStructure === "complexity" && tiers.length > 0) {
      const complexityPrices = pricing?.complexity || {};
      const prices: number[] = [];
      
      for (const tier of tiers) {
        const tierKey = tier.label.toLowerCase();
        const price = complexityPrices[tierKey];
        if (price !== undefined && price > 0) {
          prices.push(price);
        }
      }
      
      if (prices.length > 0) {
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        if (minPrice === maxPrice) {
          originalPrice = `$${minPrice}`;
          const discounted = applyTripodDiscount(minPrice, discountTier);
          discountedPrice = hasDiscount ? `$${discounted.toFixed(2)}` : `$${minPrice}`;
        } else {
          originalPrice = `$${minPrice} - $${maxPrice}`;
          const discountedMin = applyTripodDiscount(minPrice, discountTier);
          const discountedMax = applyTripodDiscount(maxPrice, discountTier);
          discountedPrice = hasDiscount ? `$${discountedMin.toFixed(2)} - $${discountedMax.toFixed(2)}` : `$${minPrice} - $${maxPrice}`;
        }
        return { originalPrice: hasDiscount ? originalPrice : "", discountedPrice };
      }
      
      return { originalPrice: "", discountedPrice: service.priceRange || "" };
    }

    if (service.pricingStructure === "quantity" && tiers.length > 0) {
      const quantityPrices = pricing?.quantity || {};
      const prices: number[] = [];
      
      for (const tier of tiers) {
        const price = quantityPrices[tier.label];
        if (price !== undefined && price > 0) {
          prices.push(price);
        }
      }
      
      if (prices.length > 0) {
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        if (minPrice === maxPrice) {
          originalPrice = `$${minPrice}`;
          const discounted = applyTripodDiscount(minPrice, discountTier);
          discountedPrice = hasDiscount ? `$${discounted.toFixed(2)}` : `$${minPrice}`;
        } else {
          originalPrice = `$${minPrice} - $${maxPrice}`;
          const discountedMin = applyTripodDiscount(minPrice, discountTier);
          const discountedMax = applyTripodDiscount(maxPrice, discountTier);
          discountedPrice = hasDiscount ? `$${discountedMin.toFixed(2)} - $${discountedMax.toFixed(2)}` : `$${minPrice} - $${maxPrice}`;
        }
        return { originalPrice: hasDiscount ? originalPrice : "", discountedPrice };
      }
      
      return { originalPrice: "", discountedPrice: service.priceRange || "" };
    }

    const basePrice = pricing?.basePrice;
    if (basePrice) {
      originalPrice = `$${basePrice}`;
      const discounted = applyTripodDiscount(basePrice, discountTier);
      discountedPrice = hasDiscount ? `$${discounted.toFixed(2)}` : `$${basePrice}`;
      return { originalPrice: hasDiscount ? originalPrice : "", discountedPrice };
    }

    return { originalPrice: "", discountedPrice: service.priceRange || "" };
  };

  const getStorePricingTiers = () => {
    const storeService = activeServices.find(s => s.title === "Store Creation");
    const storeQuantity = pricingSettings["Store Creation"]?.quantity || {};
    
    if (storeService) {
      const tiers = allTiers[storeService.id] || [];
      if (tiers.length > 0) {
        return tiers.map(tier => ({
          range: tier.label,
          price: storeQuantity[tier.label] || 2.00,
        }));
      }
    }
    
    return [
      { range: "1-50", price: storeQuantity["1-50"] || 2.00 },
      { range: "51-75", price: storeQuantity["51-75"] || 1.80 },
      { range: "76-100", price: storeQuantity["76-100"] || 1.50 },
      { range: "> 101", price: storeQuantity[">101"] || 1.30 },
    ];
  };

  const handlePricingClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPricingModalOpen(true);
  };

  return (
    <div className={showHeader ? "flex flex-col items-center w-full flex-1 px-8 py-6" : ""}>
      {showHeader && (
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
      )}

      <section className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 ${showHeader ? "w-full max-w-6xl" : ""}`}>
        {isLoading ? (
          <div className="col-span-3 text-center py-8">
            <p className="text-dark-gray">Loading services...</p>
          </div>
        ) : activeServices.length === 0 ? (
          <div className="col-span-3 text-center py-8">
            <p className="text-dark-gray">No services available</p>
          </div>
        ) : (
          activeServices.map((service) => (
            <Link key={service.id} href={`/service-requests/new?serviceId=${service.id}`}>
              <Card 
                className="border border-[#f0f0f5] rounded-2xl overflow-hidden bg-white cursor-pointer hover:shadow-lg transition-shadow h-full"
                data-testid={`card-service-${service.id}`}
              >
                <CardContent className="p-6">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-4">
                      <h3 className="flex-1 font-semibold text-dark-blue-night">
                        {service.title}
                      </h3>
                      {showPricing && (() => {
                        if (service.title === "Store Creation") {
                          return (
                            <button
                              onClick={handlePricingClick}
                              className="text-sm text-sky-blue-accent whitespace-nowrap underline hover:text-sky-blue-accent/80"
                              data-testid="link-store-pricing"
                            >
                              Pricing Breakdown
                            </button>
                          );
                        }
                        const { originalPrice, discountedPrice } = getDisplayPriceInfo(service);
                        return (
                          <div className="flex flex-col items-end">
                            <span className="font-semibold text-sky-blue-accent whitespace-nowrap">
                              {discountedPrice}
                            </span>
                            {originalPrice && (
                              <span className="text-xs text-muted-foreground line-through whitespace-nowrap">
                                {originalPrice}
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                    <p className="text-sm text-dark-blue-night">
                      {service.description}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))
        )}
      </section>

      <Dialog open={pricingModalOpen} onOpenChange={setPricingModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-dark-blue-night">
              Pricing table
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-dark-blue-night mb-6">
              Depending on the amount of products entered by the user the final pricing will vary as follows:
            </p>
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 text-dark-gray font-normal">Quantity of products</th>
                  <th className="text-left py-3 text-dark-gray font-normal">$ per item</th>
                </tr>
              </thead>
              <tbody>
                {getStorePricingTiers().map((tier, index, arr) => (
                  <tr key={tier.range} className={index < arr.length - 1 ? "border-b" : ""}>
                    <td className="py-4 text-dark-blue-night">{tier.range}</td>
                    <td className="py-4 text-dark-blue-night">$ {tier.price.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end">
            <Button 
              onClick={() => setPricingModalOpen(false)}
              className="bg-sky-blue-accent hover:bg-sky-blue-accent/90 text-white"
              data-testid="button-got-it"
            >
              Got It
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
