import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { DollarSign, Save } from "lucide-react";
import type { User } from "@shared/schema";

const BASE_PRICE_SERVICES = [
  { name: "Vectorization & Color Separation" },
  { name: "Artwork Touch-Ups (DTF/DTG)" },
  { name: "Embroidery Digitization", subServices: ["Vectorization for Embroidery"] },
  { name: "Artwork Composition" },
  { name: "Dye-Sublimation Template" },
  { name: "Store Banner Design" },
  { name: "Flyer Design" },
  { name: "Blank Product - PSD" },
];

const STORE_QUANTITY_TIERS = ["1-50", "51-75", "76-100", ">101"];

async function getDefaultUser(): Promise<User | null> {
  const res = await fetch("/api/default-user");
  if (!res.ok) return null;
  return res.json();
}

export default function Settings() {
  const { toast } = useToast();

  const { data: currentUser } = useQuery<User | null>({
    queryKey: ["/api/default-user"],
    queryFn: getDefaultUser,
  });

  const { data: pricingSettings, isLoading } = useQuery<Record<string, any>>({
    queryKey: ["/api/system-settings/pricing"],
    queryFn: async () => {
      const res = await fetch("/api/system-settings/pricing");
      if (!res.ok) return {};
      return res.json();
    },
  });

  const [pricingData, setPricingData] = useState<Record<string, {
    basePrice?: number;
    complexity?: { basic?: number; standard?: number; advanced?: number; ultimate?: number };
    quantity?: Record<string, number>;
  }>>({});

  useEffect(() => {
    if (pricingSettings) {
      setPricingData(pricingSettings);
    }
  }, [pricingSettings]);

  const updatePricingMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("PUT", "/api/system-settings/pricing", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/system-settings/pricing"] });
      toast({ title: "Pricing updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handlePricingChange = (serviceType: string, field: string, value: number) => {
    setPricingData((prev) => ({
      ...prev,
      [serviceType]: {
        ...(prev[serviceType] || {}),
        [field]: value,
      },
    }));
  };

  const handleComplexityChange = (
    serviceType: string,
    level: string,
    value: number
  ) => {
    setPricingData((prev) => ({
      ...prev,
      [serviceType]: {
        ...(prev[serviceType] || {}),
        complexity: {
          ...(prev[serviceType]?.complexity || {}),
          [level]: value,
        },
      },
    }));
  };

  const handleQuantityChange = (
    serviceType: string,
    tier: string,
    value: number
  ) => {
    setPricingData((prev) => ({
      ...prev,
      [serviceType]: {
        ...(prev[serviceType] || {}),
        quantity: {
          ...(prev[serviceType]?.quantity || {}),
          [tier]: value,
        },
      },
    }));
  };

  const handleSavePricing = () => {
    updatePricingMutation.mutate(pricingData);
  };

  if (currentUser?.role !== "admin") {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="p-8">
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-dark-gray">Only administrators can access settings.</p>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="p-8">
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-dark-gray">Loading settings...</p>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="p-8">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex items-center gap-3">
            <DollarSign className="h-8 w-8 text-sky-blue-accent" />
            <h1 className="text-2xl font-semibold text-dark-blue-night">Settings</h1>
          </div>

          <Tabs defaultValue="pricing" className="space-y-6">
            <TabsList>
              <TabsTrigger value="pricing" data-testid="tab-pricing">
                $Pricing
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pricing">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2">
                  <CardTitle>Service Pricing</CardTitle>
                  <Button
                    onClick={handleSavePricing}
                    disabled={updatePricingMutation.isPending}
                    data-testid="button-save-pricing"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {updatePricingMutation.isPending ? "Saving..." : "Save Pricing"}
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="space-y-8">
                    <div className="space-y-4">
                      <h3 className="font-semibold text-dark-blue-night">Base Price Services</h3>
                      <div className="space-y-2">
                        {BASE_PRICE_SERVICES.map((service) => (
                          <div key={service.name}>
                            <div
                              className="grid grid-cols-[minmax(220px,1fr)_repeat(4,minmax(0,1fr))] items-center gap-2 p-4 border rounded-md"
                              data-testid={`pricing-row-${service.name.toLowerCase().replace(/\s+/g, "-")}`}
                            >
                              <div className="font-medium text-dark-blue-night whitespace-nowrap">
                                {service.name}
                              </div>
                              <div className="flex items-center gap-2 col-span-4 justify-end">
                                <Label className="text-sm text-dark-gray">Price:</Label>
                                <div className="flex items-center gap-1">
                                  <span className="text-dark-gray">$</span>
                                  <Input
                                    type="number"
                                    value={pricingData[service.name]?.basePrice || ""}
                                    onChange={(e) =>
                                      handlePricingChange(
                                        service.name,
                                        "basePrice",
                                        parseFloat(e.target.value) || 0
                                      )
                                    }
                                    placeholder="0.00"
                                    className="w-24"
                                    data-testid={`input-pricing-${service.name.toLowerCase().replace(/\s+/g, "-")}`}
                                  />
                                </div>
                              </div>
                            </div>
                            {service.subServices?.map((subService) => (
                              <div
                                key={subService}
                                className="grid grid-cols-[minmax(220px,1fr)_repeat(4,minmax(0,1fr))] items-center gap-2 p-4 border rounded-md mt-2"
                                data-testid={`pricing-row-${subService.toLowerCase().replace(/\s+/g, "-")}`}
                              >
                                <div className="font-medium text-dark-blue-night whitespace-nowrap">
                                  {subService}
                                </div>
                                <div className="flex items-center gap-2 col-span-4 justify-end">
                                  <Label className="text-sm text-dark-gray">Price:</Label>
                                  <div className="flex items-center gap-1">
                                    <span className="text-dark-gray">$</span>
                                    <Input
                                      type="number"
                                      value={pricingData[subService]?.basePrice || ""}
                                      onChange={(e) =>
                                        handlePricingChange(
                                          subService,
                                          "basePrice",
                                          parseFloat(e.target.value) || 0
                                        )
                                      }
                                      placeholder="0.00"
                                      className="w-24"
                                      data-testid={`input-pricing-${subService.toLowerCase().replace(/\s+/g, "-")}`}
                                    />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h3 className="font-semibold text-dark-blue-night">Creative Art (Complexity-based)</h3>
                      <div
                        className="grid grid-cols-[minmax(200px,1fr)_repeat(4,120px)] items-center gap-2 p-4 border rounded-md"
                        data-testid="pricing-row-creative-art"
                      >
                        <div className="font-medium text-dark-blue-night">
                          Creative Art
                        </div>
                        <div className="flex flex-col items-center">
                          <Label className="text-sm text-dark-gray mb-1">Basic:</Label>
                          <Input
                            type="number"
                            value={pricingData["Creative Art"]?.complexity?.basic || ""}
                            onChange={(e) =>
                              handleComplexityChange("Creative Art", "basic", parseFloat(e.target.value) || 0)
                            }
                            placeholder="0.00"
                            className="w-20"
                            data-testid="input-pricing-creative-basic"
                          />
                        </div>
                        <div className="flex flex-col items-center">
                          <Label className="text-sm text-dark-gray mb-1">Standard:</Label>
                          <Input
                            type="number"
                            value={pricingData["Creative Art"]?.complexity?.standard || ""}
                            onChange={(e) =>
                              handleComplexityChange("Creative Art", "standard", parseFloat(e.target.value) || 0)
                            }
                            placeholder="0.00"
                            className="w-20"
                            data-testid="input-pricing-creative-standard"
                          />
                        </div>
                        <div className="flex flex-col items-center">
                          <Label className="text-sm text-dark-gray mb-1">Advance:</Label>
                          <Input
                            type="number"
                            value={pricingData["Creative Art"]?.complexity?.advanced || ""}
                            onChange={(e) =>
                              handleComplexityChange("Creative Art", "advanced", parseFloat(e.target.value) || 0)
                            }
                            placeholder="0.00"
                            className="w-20"
                            data-testid="input-pricing-creative-advance"
                          />
                        </div>
                        <div className="flex flex-col items-center">
                          <Label className="text-sm text-dark-gray mb-1">Ultimate:</Label>
                          <Input
                            type="number"
                            value={pricingData["Creative Art"]?.complexity?.ultimate || ""}
                            onChange={(e) =>
                              handleComplexityChange("Creative Art", "ultimate", parseFloat(e.target.value) || 0)
                            }
                            placeholder="0.00"
                            className="w-20"
                            data-testid="input-pricing-creative-ultimate"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h3 className="font-semibold text-dark-blue-night">Store Creation (Quantity-based)</h3>
                      <div
                        className="grid grid-cols-[minmax(200px,1fr)_repeat(4,120px)] items-center gap-2 p-4 border rounded-md"
                        data-testid="pricing-row-store-creation"
                      >
                        <div className="font-medium text-dark-blue-night">
                          Store Creation
                        </div>
                        {STORE_QUANTITY_TIERS.map((tier) => (
                          <div key={tier} className="flex flex-col items-center">
                            <Label className="text-sm text-dark-gray mb-1">{tier}:</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={pricingData["Store Creation"]?.quantity?.[tier] || ""}
                              onChange={(e) =>
                                handleQuantityChange("Store Creation", tier, parseFloat(e.target.value) || 0)
                              }
                              placeholder="0.00"
                              className="w-20"
                              data-testid={`input-pricing-store-${tier.replace(/[^a-zA-Z0-9]/g, "")}`}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}
