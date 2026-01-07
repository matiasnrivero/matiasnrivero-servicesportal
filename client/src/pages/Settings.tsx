import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Settings as SettingsIcon, DollarSign, Save, Package, Plus, Pencil, Boxes, CalendarRange, Trash2, FormInput, Loader2, Layers, X, List, Zap, Percent, Users } from "lucide-react";
import { format } from "date-fns";
import { AutomationSettingsTab } from "@/components/AutomationSettings";
import { DiscountCouponsTab } from "@/components/DiscountCouponsTab";
import type { User, BundleLineItem, Bundle, BundleItem, Service, ServicePack, ServicePackItem, InputField, ServiceField, BundleField, ServicePricingTier, LineItemField } from "@shared/schema";
import { insertBundleLineItemSchema, inputFieldTypes, valueModes, pricingStructures, assignToModes, inputForTypes } from "@shared/schema";

async function getDefaultUser(): Promise<User | null> {
  const res = await fetch("/api/default-user");
  if (!res.ok) return null;
  return res.json();
}

// Admin service fetching - includes all services (including son services)
async function fetchAllServices(): Promise<Service[]> {
  const res = await fetch("/api/services?excludeSons=false");
  if (!res.ok) throw new Error("Failed to fetch services");
  return res.json();
}

function PricingTabContent({ 
  pricingData, 
  setPricingData, 
  handleSavePricing, 
  isPending 
}: {
  pricingData: Record<string, any>;
  setPricingData: (fn: (prev: Record<string, any>) => Record<string, any>) => void;
  handleSavePricing: () => void;
  isPending: boolean;
}) {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  
  // Fetch all services and their tiers from the database (including son services for admin)
  const { data: services = [] } = useQuery<Service[]>({
    queryKey: ["/api/services", { excludeSons: false }],
    queryFn: fetchAllServices,
  });

  // Save pricing to both system-settings AND update service basePrices
  const handleSaveAllPricing = async () => {
    setIsSaving(true);
    try {
      // Update each service's basePrice for single-price services
      const singlePriceServices = services.filter((s) => s.pricingStructure === "single" || !s.pricingStructure);
      const updatePromises = singlePriceServices.map(async (service) => {
        const newPrice = pricingData[service.title]?.basePrice;
        if (newPrice !== undefined && newPrice !== null) {
          await apiRequest("PATCH", `/api/services/${service.id}`, {
            basePrice: String(newPrice),
          });
        }
      });
      
      await Promise.all(updatePromises);
      
      // Also save to system-settings for backward compatibility
      handleSavePricing();
      
      // Invalidate services cache to reflect updated prices
      queryClient.invalidateQueries({ queryKey: ["/api/services"] });
      
      toast({ title: "Pricing saved successfully" });
    } catch (error) {
      toast({ title: "Error saving pricing", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const [serviceTiers, setServiceTiers] = useState<Record<string, ServicePricingTier[]>>({});

  // Initialize pricingData with current service basePrices when services load
  useEffect(() => {
    if (services.length > 0) {
      setPricingData((prev) => {
        const updated = { ...prev };
        services.forEach((service) => {
          // Only initialize if not already set in pricingData
          if (!updated[service.title]?.basePrice && service.basePrice) {
            updated[service.title] = {
              ...(updated[service.title] || {}),
              basePrice: parseFloat(service.basePrice) || 0,
            };
          }
        });
        return updated;
      });
    }
  }, [services, setPricingData]);

  // Fetch tiers for each service with multi-price structure
  useEffect(() => {
    const fetchTiers = async () => {
      const tiersMap: Record<string, ServicePricingTier[]> = {};
      for (const service of services) {
        if (service.pricingStructure !== "single") {
          try {
            const res = await fetch(`/api/services/${service.id}/tiers`);
            if (res.ok) {
              tiersMap[service.id] = await res.json();
            }
          } catch {
            // ignore fetch errors
          }
        }
      }
      setServiceTiers(tiersMap);
    };
    if (services.length > 0) {
      fetchTiers();
    }
  }, [services]);

  // Group services by pricing structure
  const singlePriceServices = services.filter((s) => s.pricingStructure === "single" || !s.pricingStructure);
  const complexityServices = services.filter((s) => s.pricingStructure === "complexity");
  const quantityServices = services.filter((s) => s.pricingStructure === "quantity");

  const handlePricingChange = (serviceType: string, field: string, value: number) => {
    setPricingData((prev) => ({
      ...prev,
      [serviceType]: {
        ...(prev[serviceType] || {}),
        [field]: value,
      },
    }));
  };

  const handleComplexityChange = (serviceType: string, level: string, value: number) => {
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

  const handleQuantityChange = (serviceType: string, tier: string, value: number) => {
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

  if (services.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Service Pricing</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground border rounded-md">
            No services configured yet. Go to the Services tab to create services first.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Service Pricing</CardTitle>
        <Button onClick={handleSaveAllPricing} disabled={isPending || isSaving} data-testid="button-save-pricing">
          <Save className="h-4 w-4 mr-2" />
          {isPending || isSaving ? "Saving..." : "Save Pricing"}
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-8">
          {/* Single Price Services */}
          {singlePriceServices.length > 0 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-dark-blue-night">Base Price Services</h3>
              <div className="space-y-2">
                {singlePriceServices.map((service) => (
                  <div
                    key={service.id}
                    className="grid grid-cols-[minmax(220px,1fr)_repeat(4,minmax(0,1fr))] items-center gap-2 p-4 border rounded-md"
                    data-testid={`pricing-row-${service.title.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    <div className="font-medium text-dark-blue-night whitespace-nowrap">
                      {service.title}
                    </div>
                    <div className="flex items-center gap-2 col-span-4 justify-end">
                      <Label className="text-sm text-dark-gray">Price:</Label>
                      <div className="flex items-center gap-1">
                        <span className="text-dark-gray">$</span>
                        <Input
                          type="number"
                          value={pricingData[service.title]?.basePrice || ""}
                          onChange={(e) =>
                            handlePricingChange(service.title, "basePrice", parseFloat(e.target.value) || 0)
                          }
                          placeholder="0.00"
                          className="w-24"
                          data-testid={`input-pricing-${service.title.toLowerCase().replace(/\s+/g, "-")}`}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Complexity-based Services */}
          {complexityServices.length > 0 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-dark-blue-night">Complexity-based Services</h3>
              {complexityServices.map((service) => {
                const tiers = serviceTiers[service.id] || [];
                const gridStyle = tiers.length > 0
                  ? { gridTemplateColumns: `minmax(200px, 1fr) repeat(${tiers.length}, 120px)` }
                  : { gridTemplateColumns: "minmax(200px, 1fr) 120px" };
                
                return (
                  <div
                    key={service.id}
                    className="grid items-center gap-2 p-4 border rounded-md"
                    style={gridStyle}
                    data-testid={`pricing-row-${service.title.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    <div className="font-medium text-dark-blue-night">{service.title}</div>
                    {tiers.length > 0 ? (
                      tiers.map((tier) => (
                        <div key={tier.id} className="flex flex-col items-center">
                          <Label className="text-sm text-dark-gray mb-1">{tier.label}:</Label>
                          <Input
                            type="number"
                            value={pricingData[service.title]?.complexity?.[tier.label.toLowerCase()] || ""}
                            onChange={(e) => handleComplexityChange(service.title, tier.label.toLowerCase(), parseFloat(e.target.value) || 0)}
                            placeholder="0.00"
                            className="w-20"
                            data-testid={`input-pricing-${service.title.toLowerCase().replace(/\s+/g, "-")}-${tier.label.toLowerCase()}`}
                          />
                        </div>
                      ))
                    ) : (
                      <div className="text-muted-foreground text-sm">
                        No tiers configured
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Quantity-based Services */}
          {quantityServices.length > 0 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-dark-blue-night">Quantity-based Services</h3>
              {quantityServices.map((service) => {
                const tiers = serviceTiers[service.id] || [];
                const gridStyle = tiers.length > 0
                  ? { gridTemplateColumns: `minmax(200px, 1fr) repeat(${tiers.length}, 120px)` }
                  : { gridTemplateColumns: "minmax(200px, 1fr) 120px" };

                return (
                  <div
                    key={service.id}
                    className="grid items-center gap-2 p-4 border rounded-md"
                    style={gridStyle}
                    data-testid={`pricing-row-${service.title.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    <div className="font-medium text-dark-blue-night">{service.title}</div>
                    {tiers.length > 0 ? (
                      tiers.map((tier) => (
                        <div key={tier.id} className="flex flex-col items-center">
                          <Label className="text-sm text-dark-gray mb-1">{tier.label}:</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={pricingData[service.title]?.quantity?.[tier.label] || ""}
                            onChange={(e) => handleQuantityChange(service.title, tier.label, parseFloat(e.target.value) || 0)}
                            placeholder="0.00"
                            className="w-20"
                            data-testid={`input-pricing-${service.title.toLowerCase().replace(/\s+/g, "-")}-${tier.label.replace(/[^a-zA-Z0-9]/g, "")}`}
                          />
                        </div>
                      ))
                    ) : (
                      <div className="text-muted-foreground text-sm">
                        No tiers configured
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

const lineItemFormSchema = insertBundleLineItemSchema.extend({
  price: z.string().min(1, "Price is required").refine((val) => {
    const num = parseFloat(val);
    return !isNaN(num) && num >= 0;
  }, "Must be a valid positive number"),
});

type LineItemFormValues = z.infer<typeof lineItemFormSchema>;

function LineItemsTabContent() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<BundleLineItem | null>(null);

  const form = useForm<LineItemFormValues>({
    resolver: zodResolver(lineItemFormSchema),
    defaultValues: { name: "", description: "", price: "", isActive: true },
  });

  const { data: lineItems = [], isLoading } = useQuery<BundleLineItem[]>({
    queryKey: ["/api/bundle-line-items"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: LineItemFormValues) => {
      return apiRequest("POST", "/api/bundle-line-items", {
        name: data.name,
        description: data.description || null,
        price: data.price,
        isActive: data.isActive ?? true,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bundle-line-items"] });
      closeDialog();
      toast({ title: "Line item created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: LineItemFormValues }) => {
      return apiRequest("PATCH", `/api/bundle-line-items/${id}`, {
        name: data.name,
        description: data.description || null,
        price: data.price,
        isActive: data.isActive,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bundle-line-items"] });
      closeDialog();
      toast({ title: "Line item updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      return apiRequest("PATCH", `/api/bundle-line-items/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bundle-line-items"] });
      toast({ title: "Status updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/bundle-line-items/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bundle-line-items"] });
      toast({ title: "Line item deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingItem(null);
    form.reset({ name: "", description: "", price: "", isActive: true });
  };

  const openCreateDialog = () => {
    setEditingItem(null);
    form.reset({ name: "", description: "", price: "", isActive: true });
    setDialogOpen(true);
  };

  const openEditDialog = (item: BundleLineItem) => {
    setEditingItem(item);
    form.reset({
      name: item.name,
      description: item.description || "",
      price: item.price,
      isActive: item.isActive,
    });
    setDialogOpen(true);
  };

  const onSubmit = (data: LineItemFormValues) => {
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          <Package className="h-5 w-5" />
          Line Items ({lineItems.length})
        </CardTitle>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreateDialog} data-testid="button-add-line-item">
              <Plus className="h-4 w-4 mr-2" />
              Add Line Item
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editingItem ? "Edit Line Item" : "Create Line Item"}</DialogTitle>
              <DialogDescription>
                {editingItem ? "Update the line item details below." : "Add a new line item for bundles."}
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name<span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Enter line item name" data-testid="input-line-item-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea {...field} value={field.value || ""} placeholder="Enter description (optional)" data-testid="input-line-item-description" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Price<span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <Input {...field} type="number" step="0.01" min="0" placeholder="0.00" data-testid="input-line-item-price" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2">
                      <FormControl>
                        <Switch checked={field.value ?? true} onCheckedChange={field.onChange} data-testid="switch-line-item-active" />
                      </FormControl>
                      <FormLabel className="!mt-0">Active</FormLabel>
                    </FormItem>
                  )}
                />
                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={closeDialog} data-testid="button-cancel-line-item">Cancel</Button>
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-line-item">
                    {(createMutation.isPending || updateMutation.isPending) ? "Saving..." : editingItem ? "Update" : "Create"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {lineItems.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">No line items found. Create your first one above.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px]">Status</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lineItems.map((item) => (
                <TableRow key={item.id} data-testid={`row-line-item-${item.id}`}>
                  <TableCell>
                    <Switch
                      checked={item.isActive}
                      onCheckedChange={(checked) => toggleActiveMutation.mutate({ id: item.id, isActive: checked })}
                      data-testid={`switch-active-${item.id}`}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell className="text-muted-foreground max-w-xs truncate">{item.description || "-"}</TableCell>
                  <TableCell className="text-right">${parseFloat(item.price).toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEditDialog(item)} data-testid={`button-edit-${item.id}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        onClick={() => {
                          if (confirm("Are you sure you want to delete this line item?")) {
                            deleteMutation.mutate(item.id);
                          }
                        }} 
                        data-testid={`button-delete-${item.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function BundlesTabContent() {
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data: bundles = [], isLoading } = useQuery<Bundle[]>({
    queryKey: ["/api/bundles"],
  });

  const { data: services = [] } = useQuery<Service[]>({
    queryKey: ["/api/services", { excludeSons: false }],
    queryFn: fetchAllServices,
  });

  const { data: lineItems = [] } = useQuery<BundleLineItem[]>({
    queryKey: ["/api/bundle-line-items"],
  });

  const calculateBundleFullPrice = (bundleId: string, bundleItems: BundleItem[]): number => {
    let total = 0;
    for (const item of bundleItems) {
      if (item.serviceId) {
        const service = services.find(s => s.id === item.serviceId);
        if (service) total += parseFloat(service.basePrice) * item.quantity;
      }
      if (item.lineItemId) {
        const lineItem = lineItems.find(li => li.id === item.lineItemId);
        if (lineItem) total += parseFloat(lineItem.price) * item.quantity;
      }
    }
    return total;
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          <Boxes className="h-5 w-5" />
          Bundles ({bundles.length})
        </CardTitle>
        <Button onClick={() => navigate("/settings/bundles/new")} data-testid="button-create-bundle">
          <Plus className="h-4 w-4 mr-2" />
          Create Bundle
        </Button>
      </CardHeader>
      <CardContent>
        {bundles.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">No bundles yet. Create your first one above.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px]">Status</TableHead>
                <TableHead>Bundle Name</TableHead>
                <TableHead className="text-right">Full Price</TableHead>
                <TableHead className="text-right">Bundle Price</TableHead>
                <TableHead className="text-right">Edit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bundles.map((bundle) => (
                <BundleTableRow 
                  key={bundle.id} 
                  bundle={bundle} 
                  services={services}
                  lineItems={lineItems}
                  onEdit={() => navigate(`/settings/bundles/${bundle.id}/edit`)}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function BundleTableRow({ 
  bundle, 
  services, 
  lineItems, 
  onEdit 
}: { 
  bundle: Bundle; 
  services: Service[]; 
  lineItems: BundleLineItem[]; 
  onEdit: () => void;
}) {
  const { toast } = useToast();
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const { data: bundleItems = [] } = useQuery<BundleItem[]>({
    queryKey: ["/api/bundles", bundle.id, "items"],
    queryFn: async () => {
      const res = await fetch(`/api/bundles/${bundle.id}/items`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      return apiRequest("PATCH", `/api/bundles/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bundles"] });
      toast({ title: "Bundle updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/bundles/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bundles"] });
      toast({ title: "Bundle deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const fullPrice = bundleItems.reduce((total, item) => {
    if (item.serviceId) {
      const service = services.find(s => s.id === item.serviceId);
      if (service) return total + parseFloat(service.basePrice) * item.quantity;
    }
    if (item.lineItemId) {
      const lineItem = lineItems.find(li => li.id === item.lineItemId);
      if (lineItem) return total + parseFloat(lineItem.price) * item.quantity;
    }
    return total;
  }, 0);

  const bundlePrice = bundle.finalPrice ? parseFloat(bundle.finalPrice) : fullPrice * (1 - parseFloat(bundle.discountPercent || "0") / 100);

  return (
    <>
      <TableRow data-testid={`row-bundle-${bundle.id}`}>
        <TableCell>
          <Switch
            checked={bundle.isActive}
            onCheckedChange={(checked) => toggleActiveMutation.mutate({ id: bundle.id, isActive: checked })}
            data-testid={`switch-bundle-active-${bundle.id}`}
          />
        </TableCell>
        <TableCell className="font-medium">{bundle.name}</TableCell>
        <TableCell className="text-right">${fullPrice.toFixed(2)}</TableCell>
        <TableCell className="text-right">${bundlePrice.toFixed(2)}</TableCell>
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-1">
            <Button size="icon" variant="ghost" onClick={onEdit} data-testid={`button-edit-bundle-${bundle.id}`}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button 
              size="icon" 
              variant="ghost" 
              onClick={() => setDeleteModalOpen(true)} 
              data-testid={`button-delete-bundle-${bundle.id}`}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </TableCell>
      </TableRow>

      <AlertDialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Bundle</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{bundle.name}"? This action cannot be undone and will permanently remove this bundle and all associated items.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-bundle">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate(bundle.id)}
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete-bundle"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function PacksTabContent() {
  const [, navigate] = useLocation();

  const { data: servicePacks = [], isLoading } = useQuery<ServicePack[]>({
    queryKey: ["/api/service-packs"],
  });

  const { data: services = [] } = useQuery<Service[]>({
    queryKey: ["/api/services", { excludeSons: false }],
    queryFn: fetchAllServices,
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          <CalendarRange className="h-5 w-5" />
          Packs ({servicePacks.length})
        </CardTitle>
        <Button onClick={() => navigate("/settings/packs/new")} data-testid="button-create-pack">
          <Plus className="h-4 w-4 mr-2" />
          Create Pack
        </Button>
      </CardHeader>
      <CardContent>
        {servicePacks.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">No packs yet. Create your first one above.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px]">Status</TableHead>
                <TableHead>Pack Name</TableHead>
                <TableHead className="text-right">Full Price</TableHead>
                <TableHead className="text-right">Pack Price</TableHead>
                <TableHead className="text-right">Savings</TableHead>
                <TableHead className="text-right">Edit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {servicePacks.map((pack) => (
                <PackTableRow 
                  key={pack.id} 
                  pack={pack} 
                  services={services}
                  onEdit={() => navigate(`/settings/packs/${pack.id}/edit`)}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function PackTableRow({ 
  pack, 
  services, 
  onEdit 
}: { 
  pack: ServicePack; 
  services: Service[]; 
  onEdit: () => void;
}) {
  const { toast } = useToast();
  const { data: packItems = [] } = useQuery<ServicePackItem[]>({
    queryKey: ["/api/service-packs", pack.id, "items"],
    queryFn: async () => {
      const res = await fetch(`/api/service-packs/${pack.id}/items`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      return apiRequest("PATCH", `/api/service-packs/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-packs"] });
      toast({ title: "Pack updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/service-packs/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-packs"] });
      toast({ title: "Pack deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Calculate full price: prefer pack's direct serviceId/quantity (new style), fall back to packItems (legacy)
  let fullPrice = 0;
  if (pack.serviceId && pack.quantity) {
    // New single-service pack: calculate from pack's serviceId and quantity
    const service = services.find(s => s.id === pack.serviceId);
    if (service) {
      fullPrice = parseFloat(service.basePrice) * pack.quantity;
    }
  } else {
    // Legacy pack: calculate from packItems
    fullPrice = packItems.reduce((total, item) => {
      const service = services.find(s => s.id === item.serviceId);
      if (service) return total + parseFloat(service.basePrice) * item.quantity;
      return total;
    }, 0);
  }

  const packPrice = pack.price ? parseFloat(pack.price) : fullPrice;
  const savings = fullPrice - packPrice;
  const savingsPercent = fullPrice > 0 ? (savings / fullPrice) * 100 : 0;

  return (
    <TableRow data-testid={`row-pack-${pack.id}`}>
      <TableCell>
        <Switch
          checked={pack.isActive}
          onCheckedChange={(checked) => toggleActiveMutation.mutate({ id: pack.id, isActive: checked })}
          data-testid={`switch-pack-active-${pack.id}`}
        />
      </TableCell>
      <TableCell className="font-medium">{pack.name}</TableCell>
      <TableCell className="text-right">${fullPrice.toFixed(2)}</TableCell>
      <TableCell className="text-right">${packPrice.toFixed(2)}</TableCell>
      <TableCell className="text-right text-emerald-600 dark:text-emerald-400 font-medium">
        ${savings.toFixed(2)} ({savingsPercent.toFixed(1)}%)
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <Button size="icon" variant="ghost" onClick={onEdit} data-testid={`button-edit-pack-${pack.id}`}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button 
            size="icon" 
            variant="ghost" 
            onClick={() => {
              if (confirm("Are you sure you want to delete this pack?")) {
                deleteMutation.mutate(pack.id);
              }
            }} 
            data-testid={`button-delete-pack-${pack.id}`}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

// ==================== SUBSCRIPTIONS TAB ====================

interface EnrichedSubscription {
  id: string;
  packId: string;
  clientProfileId: string | null;
  isActive: boolean;
  startDate: string;
  endDate: string | null;
  stripeSubscriptionId: string | null;
  stripeStatus: string | null;
  gracePeriodEndsAt: string | null;
  paymentFailedAt: string | null;
  vendorAssigneeId: string | null;
  vendorAssignedAt: string | null;
  pendingPackId: string | null;
  pendingChangeType: string | null;
  pendingChangeEffectiveAt: string | null;
  unsubscribedAt: string | null;
  unsubscribeEffectiveAt: string | null;
  totalIncluded: number;
  totalUsed: number;
  clientProfile: { id: string; companyName: string } | null;
  clientUser: { id: string; username: string; email: string } | null;
  pack: { id: string; name: string; price: string } | null;
  vendorAssignee: { id: string; username: string; email: string } | null;
  pendingPack: { id: string; name: string } | null;
}

function SubscriptionsTabContent() {
  const { toast } = useToast();
  const [selectedSubscription, setSelectedSubscription] = useState<EnrichedSubscription | null>(null);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);

  const { data: subscriptions = [], isLoading } = useQuery<EnrichedSubscription[]>({
    queryKey: ["/api/admin/pack-subscriptions"],
  });

  const { data: vendors = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
    select: (data: User[]) => data.filter(u => u.role === "vendor" || u.role === "vendor_designer"),
  });

  const updateSubscriptionMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, any> }) => {
      return apiRequest("PATCH", `/api/admin/pack-subscriptions/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pack-subscriptions"] });
      toast({ title: "Subscription updated" });
      setAssignDialogOpen(false);
      setSelectedSubscription(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const getStatusBadge = (sub: EnrichedSubscription) => {
    if (!sub.isActive) {
      return <Badge variant="secondary">Inactive</Badge>;
    }
    if (sub.gracePeriodEndsAt) {
      const graceEnd = new Date(sub.gracePeriodEndsAt);
      if (graceEnd > new Date()) {
        return <Badge variant="destructive">Grace Period</Badge>;
      }
    }
    if (sub.stripeStatus === "past_due") {
      return <Badge variant="destructive">Past Due</Badge>;
    }
    if (sub.stripeStatus === "active") {
      return <Badge variant="default">Active</Badge>;
    }
    if (sub.unsubscribedAt) {
      return <Badge variant="secondary">Cancelling</Badge>;
    }
    return <Badge variant="default">Active</Badge>;
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Pack Subscriptions ({subscriptions.length})
          </CardTitle>
          <CardDescription>
            Manage client pack subscriptions, vendor assignments, and subscription status.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {subscriptions.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No pack subscriptions yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Pack</TableHead>
                  <TableHead>Usage</TableHead>
                  <TableHead>Stripe Status</TableHead>
                  <TableHead>Grace Period</TableHead>
                  <TableHead>Pending Change</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subscriptions.map((sub) => (
                  <TableRow key={sub.id} data-testid={`row-subscription-${sub.id}`}>
                    <TableCell>{getStatusBadge(sub)}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{sub.clientProfile?.companyName || "N/A"}</span>
                        <span className="text-xs text-muted-foreground">{sub.clientUser?.email || ""}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{sub.pack?.name || "Unknown Pack"}</span>
                        <span className="text-xs text-muted-foreground">${sub.pack?.price || "0"}/mo</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={sub.totalUsed >= sub.totalIncluded ? "text-destructive font-medium" : ""}>
                        {sub.totalUsed} / {sub.totalIncluded}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={sub.stripeStatus === "active" ? "default" : sub.stripeStatus === "past_due" ? "destructive" : "secondary"}>
                        {sub.stripeStatus || "N/A"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {sub.gracePeriodEndsAt ? (
                        <span className="text-destructive text-sm">
                          Ends {format(new Date(sub.gracePeriodEndsAt), "MMM d, yyyy")}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {sub.pendingPack ? (
                        <div className="flex flex-col">
                          <Badge variant="outline">{sub.pendingChangeType}</Badge>
                          <span className="text-xs text-muted-foreground">{sub.pendingPack.name}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {sub.vendorAssignee ? (
                        <span className="text-sm">{sub.vendorAssignee.username}</span>
                      ) : (
                        <span className="text-muted-foreground">Unassigned</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedSubscription(sub);
                          setAssignDialogOpen(true);
                        }}
                        data-testid={`button-edit-subscription-${sub.id}`}
                      >
                        <Pencil className="h-3 w-3 mr-1" />
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit Subscription Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Subscription</DialogTitle>
            <DialogDescription>
              Update vendor assignment and subscription details for {selectedSubscription?.clientProfile?.companyName || "this client"}.
            </DialogDescription>
          </DialogHeader>
          {selectedSubscription && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Assign Vendor</Label>
                <Select
                  value={selectedSubscription.vendorAssigneeId || ""}
                  onValueChange={(value) => {
                    updateSubscriptionMutation.mutate({
                      id: selectedSubscription.id,
                      data: { vendorAssigneeId: value || null },
                    });
                  }}
                >
                  <SelectTrigger data-testid="select-vendor-assignee">
                    <SelectValue placeholder="Select vendor..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Unassigned</SelectItem>
                    {vendors.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.username} ({v.role})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Stripe Status</Label>
                <Select
                  value={selectedSubscription.stripeStatus || ""}
                  onValueChange={(value) => {
                    updateSubscriptionMutation.mutate({
                      id: selectedSubscription.id,
                      data: { stripeStatus: value || null },
                    });
                  }}
                >
                  <SelectTrigger data-testid="select-stripe-status">
                    <SelectValue placeholder="Select status..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="past_due">Past Due</SelectItem>
                    <SelectItem value="canceled">Canceled</SelectItem>
                    <SelectItem value="trialing">Trialing</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="pt-4 border-t">
                <h4 className="font-medium mb-2">Subscription Details</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">Start Date:</span>
                  <span>{selectedSubscription.startDate ? format(new Date(selectedSubscription.startDate), "MMM d, yyyy") : "N/A"}</span>
                  <span className="text-muted-foreground">Stripe Subscription:</span>
                  <span className="font-mono text-xs">{selectedSubscription.stripeSubscriptionId || "N/A"}</span>
                  <span className="text-muted-foreground">Grace Period Ends:</span>
                  <span>{selectedSubscription.gracePeriodEndsAt ? format(new Date(selectedSubscription.gracePeriodEndsAt), "MMM d, yyyy") : "N/A"}</span>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// Input Field Form Schema
const inputFieldFormSchema = z.object({
  fieldKey: z.string().min(1, "Field key is required").regex(/^[a-z_]+$/, "Must be lowercase with underscores only"),
  label: z.string().min(1, "Label is required"),
  inputType: z.enum(inputFieldTypes),
  valueMode: z.enum(valueModes),
  assignTo: z.enum(assignToModes),
  inputFor: z.enum(inputForTypes),
  showOnBundleForm: z.boolean().default(true),
  description: z.string().optional(),
  globalDefaultValue: z.any().optional(),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

type InputFieldFormData = z.infer<typeof inputFieldFormSchema>;

function InputFieldsTabContent() {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingField, setEditingField] = useState<InputField | null>(null);
  const [seedLoading, setSeedLoading] = useState(false);

  const { data: inputFieldsList = [], isLoading } = useQuery<InputField[]>({
    queryKey: ["/api/input-fields"],
  });

  const { data: allServices = [] } = useQuery<Service[]>({
    queryKey: ["/api/services", { excludeSons: false }],
    queryFn: fetchAllServices,
  });

  const createFieldMutation = useMutation({
    mutationFn: async (data: InputFieldFormData) => {
      return apiRequest("POST", "/api/input-fields", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/input-fields"] });
      queryClient.invalidateQueries({ queryKey: ["/api/services"] });
      setIsCreateDialogOpen(false);
      toast({ title: "Input field created successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to create input field", description: error.message, variant: "destructive" });
    },
  });

  const updateFieldMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InputFieldFormData> }) => {
      return apiRequest("PATCH", `/api/input-fields/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/input-fields"] });
      queryClient.invalidateQueries({ queryKey: ["/api/services"] });
      setEditingField(null);
      toast({ title: "Input field updated successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to update input field", description: error.message, variant: "destructive" });
    },
  });

  const deleteFieldMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/input-fields/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/input-fields"] });
      queryClient.invalidateQueries({ queryKey: ["/api/services"] });
      toast({ title: "Input field deleted successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to delete input field", description: error.message, variant: "destructive" });
    },
  });

  const seedFieldsMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/admin/seed-input-fields");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/input-fields"] });
      queryClient.invalidateQueries({ queryKey: ["/api/services"] });
      toast({ title: "Input fields seeded successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to seed input fields", description: error.message, variant: "destructive" });
    },
  });

  const toggleFieldStatusMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      return apiRequest("PATCH", `/api/input-fields/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/input-fields"] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to update status", description: error.message, variant: "destructive" });
    },
  });

  const form = useForm<InputFieldFormData>({
    resolver: zodResolver(inputFieldFormSchema),
    defaultValues: {
      fieldKey: "",
      label: "",
      inputType: "text",
      valueMode: "single",
      assignTo: "service",
      inputFor: "request",
      showOnBundleForm: true,
      description: "",
      sortOrder: 0,
      isActive: true,
    },
  });

  const editForm = useForm<InputFieldFormData>({
    resolver: zodResolver(inputFieldFormSchema),
    defaultValues: {
      fieldKey: "",
      label: "",
      inputType: "text",
      valueMode: "single",
      assignTo: "service",
      inputFor: "request",
      showOnBundleForm: true,
      description: "",
      sortOrder: 0,
      isActive: true,
    },
  });

  useEffect(() => {
    if (editingField) {
      editForm.reset({
        fieldKey: editingField.fieldKey,
        label: editingField.label,
        inputType: editingField.inputType as any,
        valueMode: editingField.valueMode as any,
        assignTo: (editingField.assignTo as any) || "service",
        inputFor: (editingField.inputFor as any) || "request",
        showOnBundleForm: editingField.showOnBundleForm ?? true,
        description: editingField.description || "",
        sortOrder: editingField.sortOrder ?? 0,
        isActive: editingField.isActive ?? true,
      });
    }
  }, [editingField, editForm]);

  const onCreateSubmit = (data: InputFieldFormData) => {
    createFieldMutation.mutate(data);
  };

  const onEditSubmit = (data: InputFieldFormData) => {
    if (!editingField) return;
    updateFieldMutation.mutate({ id: editingField.id, data });
  };

  const handleSeedFields = async () => {
    if (inputFieldsList.length > 0) {
      toast({ title: "Cannot seed", description: "Input fields already exist. Clear them first.", variant: "destructive" });
      return;
    }
    seedFieldsMutation.mutate();
  };

  const getInputTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      text: "Text",
      textarea: "Text Area",
      number: "Number",
      dropdown: "Dropdown",
      checkbox: "Checkbox",
      file: "File Upload",
      chips: "Chips/Tags",
      url: "URL",
      date: "Date",
    };
    return labels[type] || type;
  };

  const getAssignToLabel = (assignTo: string) => {
    const labels: Record<string, string> = {
      service: "Service",
      line_item: "Line Item",
      bundle: "Bundle",
      all: "All",
    };
    return labels[assignTo] || assignTo;
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
          <p className="text-muted-foreground">Loading input fields...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle>Input Fields Library</CardTitle>
          <CardDescription>Manage configurable input fields that can be assigned to different services</CardDescription>
        </div>
        <div className="flex gap-2">
          {inputFieldsList.length === 0 && (
            <Button 
              variant="outline" 
              onClick={handleSeedFields} 
              disabled={seedFieldsMutation.isPending}
              data-testid="button-seed-fields"
            >
              {seedFieldsMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Seed Default Fields
            </Button>
          )}
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-input-field">
                <Plus className="h-4 w-4 mr-2" />
                Add Field
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Create Input Field</DialogTitle>
                <DialogDescription>Add a new input field to the library</DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onCreateSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="fieldKey"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Field Key</FormLabel>
                        <FormControl>
                          <Input placeholder="output_format" {...field} data-testid="input-field-key" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="label"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Display Label</FormLabel>
                        <FormControl>
                          <Input placeholder="Output Format" {...field} data-testid="input-field-label" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="inputType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Input Type</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-input-type">
                                <SelectValue placeholder="Select type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {inputFieldTypes.map((type) => (
                                <SelectItem key={type} value={type}>
                                  {getInputTypeLabel(type)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="valueMode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Value Mode</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-value-mode">
                                <SelectValue placeholder="Select mode" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="single">Single Value</SelectItem>
                              <SelectItem value="multiple">Multiple Values</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="assignTo"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Assign To</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-assign-to">
                                <SelectValue placeholder="Select assignment" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="service">Service</SelectItem>
                              <SelectItem value="line_item">Line Item</SelectItem>
                              <SelectItem value="bundle">Bundle</SelectItem>
                              <SelectItem value="all">All</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="inputFor"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Input For</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-input-for">
                                <SelectValue placeholder="Select usage" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="request">Request</SelectItem>
                              <SelectItem value="delivery">Delivery</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Input placeholder="Optional description or help text" {...field} data-testid="input-description" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="sortOrder"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Sort Order</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              {...field} 
                              onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                              data-testid="input-sort-order" 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="isActive"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                          <FormLabel>Active</FormLabel>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-is-active"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="showOnBundleForm"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <FormLabel>Request on Bundle</FormLabel>
                          <p className="text-sm text-muted-foreground">Show this field on bundle request forms</p>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-show-on-bundle-form"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={createFieldMutation.isPending} data-testid="button-submit-field">
                      {createFieldMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                      Create Field
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {inputFieldsList.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FormInput className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No input fields configured yet.</p>
            <p className="text-sm">Click "Seed Default Fields" to populate from existing service forms, or add fields manually.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead className="w-[180px]">Field Key</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Assign To</TableHead>
                <TableHead>Input For</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inputFieldsList.map((field) => (
                <TableRow key={field.id} data-testid={`row-input-field-${field.id}`}>
                  <TableCell>
                    <Switch
                      checked={field.isActive}
                      onCheckedChange={(checked) => toggleFieldStatusMutation.mutate({ id: field.id, isActive: checked })}
                      disabled={toggleFieldStatusMutation.isPending}
                      data-testid={`switch-field-status-${field.id}`}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-sm">{field.fieldKey}</TableCell>
                  <TableCell>{field.label}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{getInputTypeLabel(field.inputType)}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{field.valueMode}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" data-testid={`badge-assign-to-${field.id}`}>{getAssignToLabel(field.assignTo || "service")}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={field.inputFor === "delivery" ? "secondary" : "outline"} data-testid={`badge-input-for-${field.id}`}>
                      {field.inputFor === "delivery" ? "Delivery" : "Request"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setEditingField(field)}
                        data-testid={`button-edit-field-${field.id}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          if (confirm(`Delete input field "${field.label}"? This will remove it from all services.`)) {
                            deleteFieldMutation.mutate(field.id);
                          }
                        }}
                        data-testid={`button-delete-field-${field.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* Edit Field Dialog */}
      <Dialog open={!!editingField} onOpenChange={(open) => !open && setEditingField(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Input Field</DialogTitle>
            <DialogDescription>Update input field configuration</DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
              <FormField
                control={editForm.control}
                name="fieldKey"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Field Key</FormLabel>
                    <FormControl>
                      <Input {...field} disabled data-testid="input-edit-field-key" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="label"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Display Label</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-edit-field-label" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={editForm.control}
                  name="inputType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Input Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-edit-input-type">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {inputFieldTypes.map((type) => (
                            <SelectItem key={type} value={type}>
                              {getInputTypeLabel(type)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="valueMode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Value Mode</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-edit-value-mode">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="single">Single Value</SelectItem>
                          <SelectItem value="multiple">Multiple Values</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={editForm.control}
                  name="assignTo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Assign To</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-edit-assign-to">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="service">Service</SelectItem>
                          <SelectItem value="line_item">Line Item</SelectItem>
                          <SelectItem value="bundle">Bundle</SelectItem>
                          <SelectItem value="all">All</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="inputFor"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Input For</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-edit-input-for">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="request">Request</SelectItem>
                          <SelectItem value="delivery">Delivery</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={editForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-edit-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={editForm.control}
                  name="sortOrder"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sort Order</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          {...field} 
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                          data-testid="input-edit-sort-order" 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                      <FormLabel>Active</FormLabel>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-edit-is-active"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={editForm.control}
                name="showOnBundleForm"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel>Request on Bundle</FormLabel>
                      <p className="text-sm text-muted-foreground">Show this field on bundle request forms</p>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-edit-show-on-bundle-form"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEditingField(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updateFieldMutation.isPending} data-testid="button-update-field">
                  {updateFieldMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Update Field
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// Service Fields Manager - Configure per-service field options and defaults
interface ServiceFieldsManagerProps {
  initialServiceId?: string;
  onServiceIdConsumed?: () => void;
}

function ServiceFieldsManager({ initialServiceId, onServiceIdConsumed }: ServiceFieldsManagerProps) {
  const { toast } = useToast();
  const [selectedServiceId, setSelectedServiceId] = useState<string>("");
  
  // Handle preselected service ID from parent
  useEffect(() => {
    if (initialServiceId && initialServiceId !== selectedServiceId) {
      setSelectedServiceId(initialServiceId);
      onServiceIdConsumed?.();
    }
  }, [initialServiceId, onServiceIdConsumed]);
  const [isAddFieldDialogOpen, setIsAddFieldDialogOpen] = useState(false);
  const [editingServiceField, setEditingServiceField] = useState<ServiceField | null>(null);

  const { data: allServices = [] } = useQuery<Service[]>({
    queryKey: ["/api/services", { excludeSons: false }],
    queryFn: fetchAllServices,
  });

  const { data: inputFieldsList = [] } = useQuery<InputField[]>({
    queryKey: ["/api/input-fields"],
  });

  const { data: serviceFieldsList = [], isLoading: loadingServiceFields } = useQuery<ServiceField[]>({
    queryKey: ["/api/services", selectedServiceId, "fields"],
    queryFn: async () => {
      if (!selectedServiceId) return [];
      const res = await fetch(`/api/services/${selectedServiceId}/fields`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedServiceId,
  });

  const addFieldMutation = useMutation({
    mutationFn: async (data: { inputFieldId: string; optionsJson?: string[]; defaultValue?: string; required?: boolean; sortOrder?: number; uiGroup?: string }) => {
      return apiRequest("POST", `/api/services/${selectedServiceId}/fields`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/services", selectedServiceId, "fields"] });
      queryClient.invalidateQueries({ queryKey: ["/api/services", selectedServiceId, "form-fields"] });
      setIsAddFieldDialogOpen(false);
      toast({ title: "Field added to service" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add field", description: error.message, variant: "destructive" });
    },
  });

  const updateServiceFieldMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ServiceField> }) => {
      return apiRequest("PATCH", `/api/service-fields/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/services", selectedServiceId, "fields"] });
      queryClient.invalidateQueries({ queryKey: ["/api/services", selectedServiceId, "form-fields"] });
      setEditingServiceField(null);
      toast({ title: "Service field updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update", description: error.message, variant: "destructive" });
    },
  });

  const deleteServiceFieldMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/service-fields/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/services", selectedServiceId, "fields"] });
      queryClient.invalidateQueries({ queryKey: ["/api/services", selectedServiceId, "form-fields"] });
      toast({ title: "Field removed from service" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to remove", description: error.message, variant: "destructive" });
    },
  });

  const addFieldForm = useForm({
    defaultValues: {
      inputFieldId: "",
      optionsJson: "",
      defaultValue: "",
      isRequired: false,
      sortOrder: 0,
      uiGroup: "general_info",
    },
  });

  const editFieldForm = useForm({
    defaultValues: {
      optionsJson: "",
      defaultValue: "",
      isRequired: false,
      sortOrder: 0,
      uiGroup: "general_info",
    },
  });

  useEffect(() => {
    if (editingServiceField) {
      editFieldForm.reset({
        optionsJson: editingServiceField.optionsJson ? JSON.stringify(editingServiceField.optionsJson) : "",
        defaultValue: (editingServiceField.defaultValue as string) || "",
        isRequired: editingServiceField.required ?? false,
        sortOrder: editingServiceField.sortOrder ?? 0,
        uiGroup: editingServiceField.uiGroup || "general_info",
      });
    }
  }, [editingServiceField, editFieldForm]);

  // Helper to parse options - accepts JSON array or comma-separated values
  const parseOptionsInput = (input: string): string[] | null => {
    if (!input || !input.trim()) return null;
    const trimmed = input.trim();
    // Try parsing as JSON first
    if (trimmed.startsWith('[')) {
      try {
        return JSON.parse(trimmed);
      } catch {
        // Fall through to comma parsing
      }
    }
    // Parse as comma-separated values
    return trimmed.split(',').map(s => s.trim()).filter(s => s.length > 0);
  };

  const handleAddField = (data: { inputFieldId: string; optionsJson: string; defaultValue: string; isRequired: boolean; sortOrder: number; uiGroup: string }) => {
    addFieldMutation.mutate({
      inputFieldId: data.inputFieldId,
      optionsJson: parseOptionsInput(data.optionsJson) || undefined,
      defaultValue: data.defaultValue || undefined,
      required: data.isRequired,  // Map isRequired to 'required' for backend schema
      sortOrder: data.sortOrder,
      uiGroup: data.uiGroup,
    });
  };

  const handleUpdateField = (data: { optionsJson: string; defaultValue: string; isRequired: boolean; sortOrder: number; uiGroup: string }) => {
    if (!editingServiceField) return;
    updateServiceFieldMutation.mutate({
      id: editingServiceField.id,
      data: {
        optionsJson: parseOptionsInput(data.optionsJson),
        defaultValue: data.defaultValue || null,
        required: data.isRequired,
        sortOrder: data.sortOrder,
        uiGroup: data.uiGroup,
      },
    });
  };

  const getInputFieldName = (inputFieldId: string) => {
    const field = inputFieldsList.find(f => f.id === inputFieldId);
    return field?.label || "Unknown Field";
  };

  const getInputFieldType = (inputFieldId: string) => {
    const field = inputFieldsList.find(f => f.id === inputFieldId);
    return field?.inputType || "text";
  };

  const availableFieldsToAdd = inputFieldsList.filter(
    f => !serviceFieldsList.some(sf => sf.inputFieldId === f.id)
  );

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="h-5 w-5" />
          Service Field Assignments
        </CardTitle>
        <CardDescription>
          Configure which input fields appear on each service, with per-service dropdown options and default values.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <Label>Select Service:</Label>
          <Select value={selectedServiceId} onValueChange={setSelectedServiceId}>
            <SelectTrigger className="w-[300px]" data-testid="select-service-for-fields">
              <SelectValue placeholder="Choose a service..." />
            </SelectTrigger>
            <SelectContent>
              {allServices.map((service) => (
                <SelectItem key={service.id} value={service.id}>
                  {service.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedServiceId && (
          <>
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">Fields assigned to this service:</h4>
              <Dialog open={isAddFieldDialogOpen} onOpenChange={setIsAddFieldDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" disabled={availableFieldsToAdd.length === 0} data-testid="button-add-field-to-service">
                    <Plus className="h-4 w-4 mr-1" />
                    Add Field
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Field to Service</DialogTitle>
                    <DialogDescription>
                      Select an input field and configure its options for this service.
                    </DialogDescription>
                  </DialogHeader>
                  <Form {...addFieldForm}>
                    <form onSubmit={addFieldForm.handleSubmit(handleAddField)} className="space-y-4">
                      <FormField
                        control={addFieldForm.control}
                        name="inputFieldId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Input Field</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-add-input-field">
                                  <SelectValue placeholder="Choose a field..." />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {availableFieldsToAdd.map((f) => (
                                  <SelectItem key={f.id} value={f.id}>
                                    {f.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={addFieldForm.control}
                        name="optionsJson"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Service-Specific Options (comma-separated)</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="PDF, AI, EPS, PSD"
                                {...field}
                                data-testid="input-add-service-options"
                                className="font-mono text-sm"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={addFieldForm.control}
                        name="defaultValue"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Service Default Value</FormLabel>
                            <FormControl>
                              <Input {...field} data-testid="input-add-service-default" placeholder="Leave empty to use global default" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={addFieldForm.control}
                        name="uiGroup"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Section</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-add-service-section">
                                  <SelectValue placeholder="Choose section..." />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="general_info">General Info</SelectItem>
                                <SelectItem value="info_details">Info Details</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={addFieldForm.control}
                          name="sortOrder"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Sort Order</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  {...field}
                                  onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                  data-testid="input-add-service-sort"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={addFieldForm.control}
                          name="isRequired"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                              <FormLabel>Required</FormLabel>
                              <FormControl>
                                <Switch
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                  data-testid="switch-add-service-required"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => setIsAddFieldDialogOpen(false)}>
                          Cancel
                        </Button>
                        <Button type="submit" disabled={addFieldMutation.isPending} data-testid="button-submit-add-field">
                          {addFieldMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                          Add Field
                        </Button>
                      </div>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </div>

            {loadingServiceFields ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : serviceFieldsList.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground border rounded-md">
                No fields assigned to this service yet. Click "Add Field" to get started.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Field Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Section</TableHead>
                    <TableHead>Service Options</TableHead>
                    <TableHead>Default Value</TableHead>
                    <TableHead>Required</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {serviceFieldsList.map((sf) => (
                    <TableRow key={sf.id} data-testid={`row-service-field-${sf.id}`}>
                      <TableCell className="font-medium">{getInputFieldName(sf.inputFieldId)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{getInputFieldType(sf.inputFieldId)}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {sf.uiGroup === "info_details" ? "Info Details" : "General Info"}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {sf.optionsJson ? JSON.stringify(sf.optionsJson) : "-"}
                      </TableCell>
                      <TableCell>{(sf.defaultValue as string) || "-"}</TableCell>
                      <TableCell>{sf.required ? "Yes" : "No"}</TableCell>
                      <TableCell>{sf.sortOrder}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setEditingServiceField(sf)}
                            data-testid={`button-edit-service-field-${sf.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => deleteServiceFieldMutation.mutate(sf.id)}
                            data-testid={`button-delete-service-field-${sf.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </>
        )}
      </CardContent>

      {/* Edit Service Field Dialog */}
      <Dialog open={!!editingServiceField} onOpenChange={(open) => !open && setEditingServiceField(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Service Field</DialogTitle>
            <DialogDescription>
              Update the service-specific options and default value for this field.
            </DialogDescription>
          </DialogHeader>
          <Form {...editFieldForm}>
            <form onSubmit={editFieldForm.handleSubmit(handleUpdateField)} className="space-y-4">
              <FormField
                control={editFieldForm.control}
                name="optionsJson"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Service-Specific Options (comma-separated)</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        data-testid="input-edit-service-options"
                        className="font-mono text-sm"
                        placeholder="PDF, AI, EPS, PSD"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editFieldForm.control}
                name="defaultValue"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Service Default Value</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-edit-service-default" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editFieldForm.control}
                name="uiGroup"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Section</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-edit-service-section">
                          <SelectValue placeholder="Choose section..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="general_info">General Info</SelectItem>
                        <SelectItem value="info_details">Info Details</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={editFieldForm.control}
                  name="sortOrder"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sort Order</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                          data-testid="input-edit-service-sort"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editFieldForm.control}
                  name="isRequired"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                      <FormLabel>Required</FormLabel>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-edit-service-required"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEditingServiceField(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updateServiceFieldMutation.isPending} data-testid="button-submit-edit-service-field">
                  {updateServiceFieldMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Update
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// Line Item Fields Manager - Configure per-line-item field options and defaults
function LineItemFieldsManager() {
  const { toast } = useToast();
  const [selectedLineItemId, setSelectedLineItemId] = useState<string>("");
  const [isAddFieldDialogOpen, setIsAddFieldDialogOpen] = useState(false);
  const [editingLineItemField, setEditingLineItemField] = useState<LineItemField | null>(null);

  const { data: lineItems = [] } = useQuery<BundleLineItem[]>({
    queryKey: ["/api/bundle-line-items"],
  });

  const { data: inputFieldsList = [] } = useQuery<InputField[]>({
    queryKey: ["/api/input-fields"],
  });

  const { data: lineItemFieldsList = [], isLoading: loadingLineItemFields } = useQuery<LineItemField[]>({
    queryKey: ["/api/line-items", selectedLineItemId, "fields"],
    queryFn: async () => {
      if (!selectedLineItemId) return [];
      const res = await fetch(`/api/line-items/${selectedLineItemId}/fields`);
      if (!res.ok) {
        throw new Error("Failed to load line item fields");
      }
      return res.json();
    },
    enabled: !!selectedLineItemId,
  });

  const addFieldMutation = useMutation({
    mutationFn: async (data: { inputFieldId: string; optionsJson?: string[]; defaultValue?: string; required?: boolean; sortOrder?: number; uiGroup?: string }) => {
      return apiRequest("POST", `/api/line-items/${selectedLineItemId}/fields`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/line-items", selectedLineItemId, "fields"] });
      setIsAddFieldDialogOpen(false);
      toast({ title: "Field added to line item" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add field", description: error.message, variant: "destructive" });
    },
  });

  const updateLineItemFieldMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<LineItemField> }) => {
      return apiRequest("PATCH", `/api/line-item-fields/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/line-items", selectedLineItemId, "fields"] });
      setEditingLineItemField(null);
      toast({ title: "Line item field updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update", description: error.message, variant: "destructive" });
    },
  });

  const deleteLineItemFieldMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/line-item-fields/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/line-items", selectedLineItemId, "fields"] });
      toast({ title: "Field removed from line item" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to remove", description: error.message, variant: "destructive" });
    },
  });

  const addFieldForm = useForm({
    defaultValues: {
      inputFieldId: "",
      optionsJson: "",
      defaultValue: "",
      isRequired: false,
      sortOrder: 0,
      uiGroup: "general_info",
    },
  });

  const editFieldForm = useForm({
    defaultValues: {
      optionsJson: "",
      defaultValue: "",
      isRequired: false,
      sortOrder: 0,
      uiGroup: "general_info",
    },
  });

  useEffect(() => {
    if (editingLineItemField) {
      editFieldForm.reset({
        optionsJson: editingLineItemField.optionsJson ? JSON.stringify(editingLineItemField.optionsJson) : "",
        defaultValue: (editingLineItemField.defaultValue as string) || "",
        isRequired: editingLineItemField.required ?? false,
        sortOrder: editingLineItemField.sortOrder ?? 0,
        uiGroup: editingLineItemField.uiGroup || "general_info",
      });
    }
  }, [editingLineItemField, editFieldForm]);

  const parseOptionsInput = (input: string): string[] | null => {
    if (!input || !input.trim()) return null;
    const trimmed = input.trim();
    if (trimmed.startsWith('[')) {
      try {
        return JSON.parse(trimmed);
      } catch {
        // Fall through to comma parsing
      }
    }
    return trimmed.split(',').map(s => s.trim()).filter(s => s.length > 0);
  };

  const handleAddField = (data: { inputFieldId: string; optionsJson: string; defaultValue: string; isRequired: boolean; sortOrder: number; uiGroup: string }) => {
    addFieldMutation.mutate({
      inputFieldId: data.inputFieldId,
      optionsJson: parseOptionsInput(data.optionsJson) || undefined,
      defaultValue: data.defaultValue || undefined,
      required: data.isRequired,
      sortOrder: data.sortOrder,
      uiGroup: data.uiGroup,
    });
  };

  const handleUpdateField = (data: { optionsJson: string; defaultValue: string; isRequired: boolean; sortOrder: number; uiGroup: string }) => {
    if (!editingLineItemField) return;
    updateLineItemFieldMutation.mutate({
      id: editingLineItemField.id,
      data: {
        optionsJson: parseOptionsInput(data.optionsJson),
        defaultValue: data.defaultValue || null,
        required: data.isRequired,
        sortOrder: data.sortOrder,
        uiGroup: data.uiGroup,
      },
    });
  };

  const getInputFieldName = (inputFieldId: string) => {
    const field = inputFieldsList.find(f => f.id === inputFieldId);
    return field?.label || "Unknown Field";
  };

  const getInputFieldType = (inputFieldId: string) => {
    const field = inputFieldsList.find(f => f.id === inputFieldId);
    return field?.inputType || "text";
  };

  const availableFieldsToAdd = inputFieldsList.filter(
    f => (f.assignTo === "line_item" || f.assignTo === "all") && !lineItemFieldsList.some(lf => lf.inputFieldId === f.id)
  );

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <List className="h-5 w-5" />
          Line Item Field Assignments
        </CardTitle>
        <CardDescription>
          Configure which input fields appear on each line item, with per-line-item dropdown options and default values.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <Label>Select Line Item:</Label>
          <Select value={selectedLineItemId} onValueChange={setSelectedLineItemId}>
            <SelectTrigger className="w-[300px]" data-testid="select-line-item-for-fields">
              <SelectValue placeholder="Choose a line item..." />
            </SelectTrigger>
            <SelectContent>
              {lineItems.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedLineItemId && (
          <>
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">Fields assigned to this line item:</h4>
              <Dialog open={isAddFieldDialogOpen} onOpenChange={setIsAddFieldDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" disabled={availableFieldsToAdd.length === 0} data-testid="button-add-field-to-line-item">
                    <Plus className="h-4 w-4 mr-1" />
                    Add Field
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Field to Line Item</DialogTitle>
                    <DialogDescription>
                      Select an input field and configure its options for this line item.
                    </DialogDescription>
                  </DialogHeader>
                  <Form {...addFieldForm}>
                    <form onSubmit={addFieldForm.handleSubmit(handleAddField)} className="space-y-4">
                      <FormField
                        control={addFieldForm.control}
                        name="inputFieldId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Input Field</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-add-line-item-input-field">
                                  <SelectValue placeholder="Choose a field..." />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {availableFieldsToAdd.map((f) => (
                                  <SelectItem key={f.id} value={f.id}>
                                    {f.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={addFieldForm.control}
                        name="optionsJson"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Line Item-Specific Options (comma-separated)</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="Option 1, Option 2, Option 3"
                                {...field}
                                data-testid="input-add-line-item-options"
                                className="font-mono text-sm"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={addFieldForm.control}
                        name="defaultValue"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Line Item Default Value</FormLabel>
                            <FormControl>
                              <Input {...field} data-testid="input-add-line-item-default" placeholder="Leave empty to use global default" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={addFieldForm.control}
                        name="uiGroup"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Section</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-add-line-item-section">
                                  <SelectValue placeholder="Choose section..." />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="general_info">General Info</SelectItem>
                                <SelectItem value="info_details">Info Details</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={addFieldForm.control}
                          name="sortOrder"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Sort Order</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  {...field}
                                  onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                  data-testid="input-add-line-item-sort"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={addFieldForm.control}
                          name="isRequired"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                              <FormLabel>Required</FormLabel>
                              <FormControl>
                                <Switch
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                  data-testid="switch-add-line-item-required"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => setIsAddFieldDialogOpen(false)}>
                          Cancel
                        </Button>
                        <Button type="submit" disabled={addFieldMutation.isPending} data-testid="button-submit-add-line-item-field">
                          {addFieldMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                          Add Field
                        </Button>
                      </div>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </div>

            {loadingLineItemFields ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : lineItemFieldsList.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground border rounded-md">
                No fields assigned to this line item yet. Click "Add Field" to get started.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Field Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Section</TableHead>
                    <TableHead>Line Item Options</TableHead>
                    <TableHead>Default Value</TableHead>
                    <TableHead>Required</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lineItemFieldsList.map((lf) => (
                    <TableRow key={lf.id} data-testid={`row-line-item-field-${lf.id}`}>
                      <TableCell className="font-medium">{getInputFieldName(lf.inputFieldId)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{getInputFieldType(lf.inputFieldId)}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {lf.uiGroup === "info_details" ? "Info Details" : "General Info"}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {lf.optionsJson ? JSON.stringify(lf.optionsJson) : "-"}
                      </TableCell>
                      <TableCell>{(lf.defaultValue as string) || "-"}</TableCell>
                      <TableCell>{lf.required ? "Yes" : "No"}</TableCell>
                      <TableCell>{lf.sortOrder}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setEditingLineItemField(lf)}
                            data-testid={`button-edit-line-item-field-${lf.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => deleteLineItemFieldMutation.mutate(lf.id)}
                            data-testid={`button-delete-line-item-field-${lf.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </>
        )}
      </CardContent>

      {/* Edit Line Item Field Dialog */}
      <Dialog open={!!editingLineItemField} onOpenChange={(open) => !open && setEditingLineItemField(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Line Item Field</DialogTitle>
            <DialogDescription>
              Update the line item-specific options and default value for this field.
            </DialogDescription>
          </DialogHeader>
          <Form {...editFieldForm}>
            <form onSubmit={editFieldForm.handleSubmit(handleUpdateField)} className="space-y-4">
              <FormField
                control={editFieldForm.control}
                name="optionsJson"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Line Item-Specific Options (comma-separated)</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        data-testid="input-edit-line-item-options"
                        className="font-mono text-sm"
                        placeholder="Option 1, Option 2, Option 3"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editFieldForm.control}
                name="defaultValue"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Line Item Default Value</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-edit-line-item-default" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editFieldForm.control}
                name="uiGroup"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Section</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-edit-line-item-section">
                          <SelectValue placeholder="Choose section..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="general_info">General Info</SelectItem>
                        <SelectItem value="info_details">Info Details</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={editFieldForm.control}
                  name="sortOrder"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sort Order</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                          data-testid="input-edit-line-item-sort"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editFieldForm.control}
                  name="isRequired"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                      <FormLabel>Required</FormLabel>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-edit-line-item-required"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEditingLineItemField(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updateLineItemFieldMutation.isPending} data-testid="button-submit-edit-line-item-field">
                  {updateLineItemFieldMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Update
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// Service Management Tab Content - Create and manage service types with pricing structures
interface ServiceManagementTabContentProps {
  onNavigateToServiceFields?: (serviceId: string) => void;
}

function ServiceManagementTabContent({ onNavigateToServiceFields }: ServiceManagementTabContentProps) {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [pricingTiers, setPricingTiers] = useState<{ label: string; price: string }[]>([]);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [serviceToDelete, setServiceToDelete] = useState<Service | null>(null);

  const { data: allServices = [], isLoading } = useQuery<Service[]>({
    queryKey: ["/api/services", { excludeSons: false }],
    queryFn: fetchAllServices,
  });

  const createForm = useForm({
    defaultValues: {
      title: "",
      description: "",
      category: "artwork",
      pricingStructure: "single" as "single" | "complexity" | "quantity",
      basePrice: "0",
      displayOrder: "999",
      serviceHierarchy: "father" as "father" | "son",
      parentServiceId: "" as string,
    },
  });

  const editForm = useForm({
    defaultValues: {
      title: "",
      description: "",
      category: "artwork",
      pricingStructure: "single" as "single" | "complexity" | "quantity",
      basePrice: "0",
      displayOrder: "999",
      serviceHierarchy: "father" as "father" | "son",
      parentServiceId: "" as string,
    },
  });

  const selectedPricingStructure = createForm.watch("pricingStructure");
  const editPricingStructure = editForm.watch("pricingStructure");
  const selectedHierarchy = createForm.watch("serviceHierarchy");
  const editHierarchy = editForm.watch("serviceHierarchy");

  // Filter to get only father services (for parent selection dropdown)
  const fatherServices = (allServices || []).filter(s => s.serviceHierarchy === "father");

  useEffect(() => {
    if (editingService) {
      editForm.reset({
        title: editingService.title,
        description: editingService.description,
        category: editingService.category,
        pricingStructure: (editingService.pricingStructure as "single" | "complexity" | "quantity") || "single",
        basePrice: editingService.basePrice || "0",
        displayOrder: String(editingService.displayOrder || 999),
        serviceHierarchy: (editingService.serviceHierarchy as "father" | "son") || "father",
        parentServiceId: editingService.parentServiceId || "",
      });
      // Load existing tiers
      fetch(`/api/services/${editingService.id}/tiers`)
        .then(res => res.json())
        .then((tiers: ServicePricingTier[]) => {
          setPricingTiers(tiers.map(t => ({ label: t.label, price: t.price || "" })));
        })
        .catch(() => setPricingTiers([]));
    }
  }, [editingService, editForm]);

  const createServiceMutation = useMutation({
    mutationFn: async (data: { title: string; description: string; category: string; pricingStructure: string; basePrice: string; displayOrder: string; serviceHierarchy: string; parentServiceId: string }) => {
      const service = await apiRequest("POST", "/api/services", {
        ...data,
        displayOrder: parseInt(data.displayOrder, 10) || 999,
        serviceHierarchy: data.serviceHierarchy,
        parentServiceId: data.serviceHierarchy === "son" ? data.parentServiceId : null,
      });
      const serviceData = await service.json();
      // Create pricing tiers if multi-price
      if (data.pricingStructure !== "single" && pricingTiers.length > 0) {
        await apiRequest("PUT", `/api/services/${serviceData.id}/tiers`, {
          tiers: pricingTiers.map(t => ({ label: t.label, price: t.price || null })),
        });
      }
      return serviceData;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/services"] });
      setIsCreateDialogOpen(false);
      createForm.reset();
      setPricingTiers([]);
      toast({ title: "Service created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateServiceMutation = useMutation({
    mutationFn: async (data: { id: string; title: string; description: string; category: string; pricingStructure: string; basePrice: string; displayOrder: string; serviceHierarchy: string; parentServiceId: string }) => {
      const { id, ...updateData } = data;
      await apiRequest("PATCH", `/api/services/${id}`, {
        ...updateData,
        displayOrder: parseInt(updateData.displayOrder, 10) || 999,
        serviceHierarchy: updateData.serviceHierarchy,
        parentServiceId: updateData.serviceHierarchy === "son" ? updateData.parentServiceId : null,
      });
      // Update pricing tiers
      if (data.pricingStructure !== "single") {
        await apiRequest("PUT", `/api/services/${id}/tiers`, {
          tiers: pricingTiers.map(t => ({ label: t.label, price: t.price || null })),
        });
      } else {
        // Clear tiers for single price
        await apiRequest("PUT", `/api/services/${id}/tiers`, { tiers: [] });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/services"] });
      setEditingService(null);
      setPricingTiers([]);
      toast({ title: "Service updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: number }) => {
      return apiRequest("PATCH", `/api/services/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/services"] });
      toast({ title: "Service status updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteServiceMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/services/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/services"] });
      toast({ title: "Service deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const addTier = () => {
    setPricingTiers([...pricingTiers, { label: "", price: "" }]);
  };

  const removeTier = (index: number) => {
    setPricingTiers(pricingTiers.filter((_, i) => i !== index));
  };

  const updateTier = (index: number, field: "label" | "price", value: string) => {
    const newTiers = [...pricingTiers];
    newTiers[index][field] = value;
    setPricingTiers(newTiers);
  };

  const handleCreateService = (data: { title: string; description: string; category: string; pricingStructure: string; basePrice: string; displayOrder: string; serviceHierarchy: string; parentServiceId: string }) => {
    createServiceMutation.mutate(data);
  };

  const handleUpdateService = (data: { title: string; description: string; category: string; pricingStructure: string; basePrice: string; displayOrder: string; serviceHierarchy: string; parentServiceId: string }) => {
    if (!editingService) return;
    updateServiceMutation.mutate({ id: editingService.id, ...data });
  };

  const getPricingStructureLabel = (structure: string) => {
    switch (structure) {
      case "single": return "Single Price";
      case "complexity": return "Complexity-based";
      case "quantity": return "Quantity-based";
      default: return structure;
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            Service Management
          </CardTitle>
          <CardDescription>
            Create and configure service types with their pricing structures.
          </CardDescription>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={(open) => {
          setIsCreateDialogOpen(open);
          if (!open) {
            createForm.reset();
            setPricingTiers([]);
          }
        }}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-service">
              <Plus className="h-4 w-4 mr-2" />
              Create Service
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Service</DialogTitle>
              <DialogDescription>
                Define a new service type with its pricing structure.
              </DialogDescription>
            </DialogHeader>
            <Form {...createForm}>
              <form onSubmit={createForm.handleSubmit(handleCreateService)} className="space-y-4">
                <FormField
                  control={createForm.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Service Name</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-service-title" placeholder="e.g., Creative Art" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea {...field} data-testid="input-service-description" placeholder="Description shown to clients on service cards" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createForm.control}
                  name="serviceHierarchy"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Service Type</FormLabel>
                      <Select onValueChange={(value) => {
                        field.onChange(value);
                        if (value === "father") {
                          createForm.setValue("parentServiceId", "");
                        }
                      }} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-service-hierarchy">
                            <SelectValue placeholder="Select service type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="father">Main Service (shown to clients)</SelectItem>
                          <SelectItem value="son">Add-on Service (linked to parent)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {selectedHierarchy === "son" && (
                  <FormField
                    control={createForm.control}
                    name="parentServiceId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Parent Service</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-parent-service">
                              <SelectValue placeholder="Select parent service" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {fatherServices.map(s => (
                              <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                <FormField
                  control={createForm.control}
                  name="pricingStructure"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Pricing Structure</FormLabel>
                      <Select onValueChange={(value) => {
                        field.onChange(value);
                        if (value === "single") {
                          setPricingTiers([]);
                        }
                      }} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-pricing-structure">
                            <SelectValue placeholder="Select pricing type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="single">Single Price</SelectItem>
                          <SelectItem value="complexity">Multiple Prices (Complexity-based)</SelectItem>
                          <SelectItem value="quantity">Multiple Prices (Quantity-based)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {selectedPricingStructure === "single" && (
                  <FormField
                    control={createForm.control}
                    name="basePrice"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Base Price ($)</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" {...field} data-testid="input-base-price" placeholder="0.00" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                {(selectedPricingStructure === "complexity" || selectedPricingStructure === "quantity") && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Pricing Tiers</Label>
                      <Button type="button" variant="outline" size="sm" onClick={addTier} data-testid="button-add-tier">
                        <Plus className="h-3 w-3 mr-1" />
                        Add Tier
                      </Button>
                    </div>
                    {pricingTiers.length === 0 && (
                      <p className="text-sm text-muted-foreground">No tiers added. Click "Add Tier" to define pricing levels.</p>
                    )}
                    {pricingTiers.map((tier, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <Input
                          value={tier.label}
                          onChange={(e) => updateTier(index, "label", e.target.value)}
                          placeholder={selectedPricingStructure === "complexity" ? "e.g., Basic" : "e.g., 1-50"}
                          className="flex-1"
                          data-testid={`input-tier-label-${index}`}
                        />
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeTier(index)} data-testid={`button-remove-tier-${index}`}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                <FormField
                  control={createForm.control}
                  name="displayOrder"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Display Order</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} data-testid="input-display-order" placeholder="1" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createServiceMutation.isPending} data-testid="button-submit-create-service">
                    {createServiceMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    Create Service
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {allServices.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground border rounded-md">
            No services configured yet. Click "Create Service" to add your first service type.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px]">Status</TableHead>
                <TableHead>Service Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Pricing Structure</TableHead>
                <TableHead className="text-center">Order</TableHead>
                <TableHead className="text-center">Fields</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...allServices].sort((a, b) => (a.displayOrder || 999) - (b.displayOrder || 999)).map((service) => (
                <TableRow key={service.id} data-testid={`row-service-${service.id}`}>
                  <TableCell>
                    <Switch
                      checked={service.isActive === 1}
                      onCheckedChange={(checked) => toggleActiveMutation.mutate({ id: service.id, isActive: checked ? 1 : 0 })}
                      data-testid={`switch-service-active-${service.id}`}
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    {service.title}
                    {service.parentServiceId && (
                      <span className="text-xs text-muted-foreground ml-1">
                        (child of {allServices.find(s => s.id === service.parentServiceId)?.title})
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[150px] truncate">{service.description}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Badge variant={service.serviceHierarchy === "son" ? "secondary" : "outline"}>
                      {service.serviceHierarchy === "son" ? "Add-on" : "Main"}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Badge variant="outline">
                      {getPricingStructureLabel(service.pricingStructure || "single")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    {service.displayOrder || 999}
                  </TableCell>
                  <TableCell className="text-center">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => onNavigateToServiceFields?.(service.id)}
                      data-testid={`button-fields-service-${service.id}`}
                      title="Manage field assignments"
                    >
                      <List className="h-4 w-4" />
                    </Button>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setEditingService(service)}
                        data-testid={`button-edit-service-${service.id}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          setServiceToDelete(service);
                          setDeleteModalOpen(true);
                        }}
                        data-testid={`button-delete-service-${service.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* Edit Service Dialog */}
      <Dialog open={!!editingService} onOpenChange={(open) => {
        if (!open) {
          setEditingService(null);
          setPricingTiers([]);
        }
      }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Service</DialogTitle>
            <DialogDescription>
              Update service details and pricing structure.
            </DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(handleUpdateService)} className="space-y-4">
              <FormField
                control={editForm.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Service Name</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-edit-service-title" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea {...field} data-testid="input-edit-service-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="serviceHierarchy"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Service Type</FormLabel>
                    <Select onValueChange={(value) => {
                      field.onChange(value);
                      if (value === "father") {
                        editForm.setValue("parentServiceId", "");
                      }
                    }} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-edit-service-hierarchy">
                          <SelectValue placeholder="Select service type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="father">Main Service (shown to clients)</SelectItem>
                        <SelectItem value="son">Add-on Service (linked to parent)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {editHierarchy === "son" && (
                <FormField
                  control={editForm.control}
                  name="parentServiceId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Parent Service</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-edit-parent-service">
                            <SelectValue placeholder="Select parent service" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {fatherServices.filter(s => s.id !== editingService?.id).map(s => (
                            <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <FormField
                control={editForm.control}
                name="pricingStructure"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Pricing Structure</FormLabel>
                    <Select onValueChange={(value) => {
                      field.onChange(value);
                      if (value === "single") {
                        setPricingTiers([]);
                      }
                    }} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-edit-pricing-structure">
                          <SelectValue placeholder="Select pricing type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="single">Single Price</SelectItem>
                        <SelectItem value="complexity">Multiple Prices (Complexity-based)</SelectItem>
                        <SelectItem value="quantity">Multiple Prices (Quantity-based)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {editPricingStructure === "single" && (
                <FormField
                  control={editForm.control}
                  name="basePrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Base Price ($)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field} data-testid="input-edit-base-price" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              {(editPricingStructure === "complexity" || editPricingStructure === "quantity") && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Pricing Tiers</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addTier} data-testid="button-edit-add-tier">
                      <Plus className="h-3 w-3 mr-1" />
                      Add Tier
                    </Button>
                  </div>
                  {pricingTiers.length === 0 && (
                    <p className="text-sm text-muted-foreground">No tiers added. Click "Add Tier" to define pricing levels.</p>
                  )}
                  {pricingTiers.map((tier, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        value={tier.label}
                        onChange={(e) => updateTier(index, "label", e.target.value)}
                        placeholder={editPricingStructure === "complexity" ? "e.g., Basic" : "e.g., 1-50"}
                        className="flex-1"
                        data-testid={`input-edit-tier-label-${index}`}
                      />
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeTier(index)} data-testid={`button-edit-remove-tier-${index}`}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <FormField
                control={editForm.control}
                name="displayOrder"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Display Order</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} data-testid="input-edit-display-order" placeholder="1" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setEditingService(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updateServiceMutation.isPending} data-testid="button-submit-edit-service">
                  {updateServiceMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Update Service
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Service Confirmation Modal */}
      <AlertDialog open={deleteModalOpen} onOpenChange={(open) => {
        setDeleteModalOpen(open);
        if (!open) setServiceToDelete(null);
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Service</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{serviceToDelete?.title}"? This action cannot be undone and will also delete all associated field assignments.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-service">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (serviceToDelete) {
                  deleteServiceMutation.mutate(serviceToDelete.id);
                  setDeleteModalOpen(false);
                  setServiceToDelete(null);
                }
              }}
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={deleteServiceMutation.isPending}
              data-testid="button-confirm-delete-service"
            >
              {deleteServiceMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// Bundle Fields Assignments Manager - Assign input fields to bundles with per-bundle configuration
function BundleFieldsAssignmentsManager() {
  const { toast } = useToast();
  const [selectedBundleId, setSelectedBundleId] = useState<string>("");
  const [isAddFieldDialogOpen, setIsAddFieldDialogOpen] = useState(false);
  const [editingBundleField, setEditingBundleField] = useState<BundleField | null>(null);

  const { data: allBundles = [] } = useQuery<Bundle[]>({
    queryKey: ["/api/bundles"],
  });

  const { data: inputFieldsList = [] } = useQuery<InputField[]>({
    queryKey: ["/api/input-fields"],
  });

  const { data: bundleFieldsList = [], isLoading: loadingBundleFields } = useQuery<BundleField[]>({
    queryKey: ["/api/bundles", selectedBundleId, "fields"],
    queryFn: async () => {
      if (!selectedBundleId) return [];
      const res = await fetch(`/api/bundles/${selectedBundleId}/fields`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedBundleId,
  });

  const addBundleFieldMutation = useMutation({
    mutationFn: async (data: { inputFieldId: string; optionsJson?: string[]; defaultValue?: unknown; required: boolean; sortOrder: number; uiGroup?: string }) => {
      return apiRequest("POST", `/api/bundles/${selectedBundleId}/fields`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bundles", selectedBundleId, "fields"] });
      setIsAddFieldDialogOpen(false);
      addFieldForm.reset();
      toast({ title: "Field added to bundle" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add field", description: error.message, variant: "destructive" });
    },
  });

  const updateBundleFieldMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { optionsJson?: string[] | null; defaultValue?: unknown; required?: boolean; sortOrder?: number; uiGroup?: string } }) => {
      return apiRequest("PATCH", `/api/bundle-fields/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bundles", selectedBundleId, "fields"] });
      setEditingBundleField(null);
      toast({ title: "Bundle field updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update", description: error.message, variant: "destructive" });
    },
  });

  const deleteBundleFieldMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/bundle-fields/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bundles", selectedBundleId, "fields"] });
      toast({ title: "Field removed from bundle" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to remove", description: error.message, variant: "destructive" });
    },
  });

  const addFieldForm = useForm({
    defaultValues: {
      inputFieldId: "",
      optionsJson: "",
      defaultValue: "",
      isRequired: false,
      sortOrder: 0,
      uiGroup: "general_info",
    },
  });

  const editFieldForm = useForm({
    defaultValues: {
      optionsJson: "",
      defaultValue: "",
      isRequired: false,
      sortOrder: 0,
      uiGroup: "general_info",
    },
  });

  useEffect(() => {
    if (editingBundleField) {
      editFieldForm.reset({
        optionsJson: editingBundleField.optionsJson ? JSON.stringify(editingBundleField.optionsJson) : "",
        defaultValue: typeof editingBundleField.defaultValue === 'string' 
          ? editingBundleField.defaultValue 
          : (editingBundleField.defaultValue ? JSON.stringify(editingBundleField.defaultValue) : ""),
        isRequired: editingBundleField.required,
        sortOrder: editingBundleField.sortOrder,
        uiGroup: editingBundleField.uiGroup || "general_info",
      });
    }
  }, [editingBundleField, editFieldForm]);

  const parseOptionsInput = (input: string): string[] | null => {
    if (!input || !input.trim()) return null;
    const trimmed = input.trim();
    if (trimmed.startsWith('[')) {
      try {
        return JSON.parse(trimmed);
      } catch {
        // Fall through to comma parsing
      }
    }
    return trimmed.split(',').map(s => s.trim()).filter(s => s.length > 0);
  };

  const parseDefaultValue = (input: string): unknown => {
    if (!input || !input.trim()) return undefined;
    const trimmed = input.trim();
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        return JSON.parse(trimmed);
      } catch {
        // Not valid JSON, return as string
      }
    }
    return trimmed;
  };

  const handleAddField = (data: { inputFieldId: string; optionsJson: string; defaultValue: string; isRequired: boolean; sortOrder: number; uiGroup: string }) => {
    addBundleFieldMutation.mutate({
      inputFieldId: data.inputFieldId,
      optionsJson: parseOptionsInput(data.optionsJson) || undefined,
      defaultValue: parseDefaultValue(data.defaultValue),
      required: data.isRequired,
      sortOrder: data.sortOrder,
      uiGroup: data.uiGroup,
    });
  };

  const handleUpdateField = (data: { optionsJson: string; defaultValue: string; isRequired: boolean; sortOrder: number; uiGroup: string }) => {
    if (!editingBundleField) return;
    updateBundleFieldMutation.mutate({
      id: editingBundleField.id,
      data: {
        optionsJson: parseOptionsInput(data.optionsJson),
        defaultValue: parseDefaultValue(data.defaultValue) ?? null,
        required: data.isRequired,
        sortOrder: data.sortOrder,
        uiGroup: data.uiGroup,
      },
    });
  };

  const getInputFieldName = (inputFieldId: string) => {
    const field = inputFieldsList.find(f => f.id === inputFieldId);
    return field?.label || "Unknown Field";
  };

  const getInputFieldType = (inputFieldId: string) => {
    const field = inputFieldsList.find(f => f.id === inputFieldId);
    return field?.inputType || "text";
  };

  // Get available fields to add (bundle or all assignTo types, not already assigned)
  const availableFieldsToAdd = inputFieldsList.filter(
    f => (f.assignTo === "bundle" || f.assignTo === "all") && !bundleFieldsList.some(bf => bf.inputFieldId === f.id)
  );

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Boxes className="h-5 w-5" />
          Bundle Field Assignments
        </CardTitle>
        <CardDescription>
          Configure which input fields appear on each bundle, with per-bundle dropdown options and default values.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <Label>Select Bundle:</Label>
          <Select value={selectedBundleId} onValueChange={setSelectedBundleId}>
            <SelectTrigger className="w-[300px]" data-testid="select-bundle-for-fields">
              <SelectValue placeholder="Choose a bundle..." />
            </SelectTrigger>
            <SelectContent>
              {allBundles.map((bundle) => (
                <SelectItem key={bundle.id} value={bundle.id}>
                  {bundle.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedBundleId && (
          <>
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">Fields assigned to this bundle:</h4>
              <Dialog open={isAddFieldDialogOpen} onOpenChange={setIsAddFieldDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" disabled={availableFieldsToAdd.length === 0} data-testid="button-add-field-to-bundle">
                    <Plus className="h-4 w-4 mr-1" />
                    Add Field
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Field to Bundle</DialogTitle>
                    <DialogDescription>
                      Select an input field and configure its options for this bundle.
                    </DialogDescription>
                  </DialogHeader>
                  <Form {...addFieldForm}>
                    <form onSubmit={addFieldForm.handleSubmit(handleAddField)} className="space-y-4">
                      <FormField
                        control={addFieldForm.control}
                        name="inputFieldId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Input Field</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-add-bundle-input-field">
                                  <SelectValue placeholder="Choose a field..." />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {availableFieldsToAdd.map((f) => (
                                  <SelectItem key={f.id} value={f.id}>
                                    {f.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={addFieldForm.control}
                        name="optionsJson"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Bundle-Specific Options (comma-separated)</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="Option 1, Option 2, Option 3"
                                {...field}
                                data-testid="input-add-bundle-options"
                                className="font-mono text-sm"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={addFieldForm.control}
                        name="defaultValue"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Bundle Default Value</FormLabel>
                            <FormControl>
                              <Input {...field} data-testid="input-add-bundle-default" placeholder="Leave empty to use global default" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={addFieldForm.control}
                        name="uiGroup"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Section</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-add-bundle-section">
                                  <SelectValue placeholder="Choose section..." />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="general_info">General Info</SelectItem>
                                <SelectItem value="info_details">Info Details</SelectItem>
                                <SelectItem value="additional_info">Additional Info</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={addFieldForm.control}
                          name="sortOrder"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Sort Order</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  {...field}
                                  onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                  data-testid="input-add-bundle-sort"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={addFieldForm.control}
                          name="isRequired"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                              <FormLabel>Required</FormLabel>
                              <FormControl>
                                <Switch
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                  data-testid="switch-add-bundle-required"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => setIsAddFieldDialogOpen(false)}>
                          Cancel
                        </Button>
                        <Button type="submit" disabled={addBundleFieldMutation.isPending} data-testid="button-submit-add-bundle-field">
                          {addBundleFieldMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                          Add Field
                        </Button>
                      </div>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </div>

            {loadingBundleFields ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : bundleFieldsList.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground border rounded-md">
                No fields assigned to this bundle yet. Click "Add Field" to get started.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Field Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Section</TableHead>
                    <TableHead>Bundle Options</TableHead>
                    <TableHead>Default Value</TableHead>
                    <TableHead>Required</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bundleFieldsList.map((bf) => (
                    <TableRow key={bf.id} data-testid={`row-bundle-field-${bf.id}`}>
                      <TableCell className="font-medium">{getInputFieldName(bf.inputFieldId)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{getInputFieldType(bf.inputFieldId)}</Badge>
                      </TableCell>
                      <TableCell>
                        {bf.uiGroup === "additional_info" ? "Additional Info" : bf.uiGroup === "info_details" ? "Info Details" : "General Info"}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {bf.optionsJson ? JSON.stringify(bf.optionsJson) : "-"}
                      </TableCell>
                      <TableCell>{(bf.defaultValue as string) || "-"}</TableCell>
                      <TableCell>{bf.required ? "Yes" : "No"}</TableCell>
                      <TableCell>{bf.sortOrder}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setEditingBundleField(bf)}
                            data-testid={`button-edit-bundle-field-${bf.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => deleteBundleFieldMutation.mutate(bf.id)}
                            data-testid={`button-delete-bundle-field-${bf.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </>
        )}
      </CardContent>

      {/* Edit Bundle Field Dialog */}
      <Dialog open={!!editingBundleField} onOpenChange={(open) => !open && setEditingBundleField(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Bundle Field</DialogTitle>
            <DialogDescription>
              Update the bundle-specific options and default value for this field.
            </DialogDescription>
          </DialogHeader>
          <Form {...editFieldForm}>
            <form onSubmit={editFieldForm.handleSubmit(handleUpdateField)} className="space-y-4">
              <FormField
                control={editFieldForm.control}
                name="optionsJson"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bundle-Specific Options (comma-separated)</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        data-testid="input-edit-bundle-options"
                        className="font-mono text-sm"
                        placeholder="Option 1, Option 2, Option 3"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editFieldForm.control}
                name="defaultValue"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bundle Default Value</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-edit-bundle-default" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editFieldForm.control}
                name="uiGroup"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Section</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-edit-bundle-section">
                          <SelectValue placeholder="Choose section..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="general_info">General Info</SelectItem>
                        <SelectItem value="info_details">Info Details</SelectItem>
                        <SelectItem value="additional_info">Additional Info</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={editFieldForm.control}
                  name="sortOrder"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sort Order</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                          data-testid="input-edit-bundle-sort"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editFieldForm.control}
                  name="isRequired"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                      <FormLabel>Required</FormLabel>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-edit-bundle-required"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEditingBundleField(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updateBundleFieldMutation.isPending} data-testid="button-submit-edit-bundle-field">
                  {updateBundleFieldMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Update
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default function Settings() {
  const { toast } = useToast();
  const [location] = useLocation();
  
  // Read tab from URL query params
  const getInitialTab = () => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    return tab || "pricing";
  };
  
  const [activeTab, setActiveTab] = useState(getInitialTab);
  const [preselectedServiceId, setPreselectedServiceId] = useState<string>("");

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

  const [pricingData, setPricingData] = useState<Record<string, any>>({});
  
  const handleNavigateToServiceFields = (serviceId: string) => {
    setPreselectedServiceId(serviceId);
    setActiveTab("input-fields");
  };

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

  const handleSavePricing = () => {
    updatePricingMutation.mutate(pricingData);
  };

  const isAdmin = currentUser?.role === "admin";
  const isInternalDesigner = currentUser?.role === "internal_designer";
  const canAccessSettings = isAdmin || isInternalDesigner;

  if (!canAccessSettings) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="p-8">
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-dark-gray">Only administrators and internal designers can access settings.</p>
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
            <SettingsIcon className="h-8 w-8 text-sky-blue-accent" />
            <h1 className="text-2xl font-semibold text-dark-blue-night">Settings</h1>
          </div>

          <Tabs value={isInternalDesigner ? "input-fields" : activeTab} onValueChange={(tab) => {
            // Internal designers can only access input-fields tab
            if (isInternalDesigner && tab !== "input-fields") return;
            setActiveTab(tab);
          }} className="space-y-6">
            <TabsList>
              {isAdmin && (
                <>
                  <TabsTrigger value="services" data-testid="tab-services">
                    <Layers className="h-4 w-4 mr-1" />
                    Services
                  </TabsTrigger>
                  <TabsTrigger value="pricing" data-testid="tab-pricing">
                    <DollarSign className="h-4 w-4 mr-1" />
                    Pricing
                  </TabsTrigger>
                  <TabsTrigger value="line-items" data-testid="tab-line-items">
                    <Package className="h-4 w-4 mr-1" />
                    Line Items
                  </TabsTrigger>
                  <TabsTrigger value="bundles" data-testid="tab-bundles">
                    <Boxes className="h-4 w-4 mr-1" />
                    Bundles
                  </TabsTrigger>
                  <TabsTrigger value="packs" data-testid="tab-packs">
                    <CalendarRange className="h-4 w-4 mr-1" />
                    Packs
                  </TabsTrigger>
                  <TabsTrigger value="subscriptions" data-testid="tab-subscriptions">
                    <Users className="h-4 w-4 mr-1" />
                    Subscriptions
                  </TabsTrigger>
                  <TabsTrigger value="automation" data-testid="tab-automation">
                    <Zap className="h-4 w-4 mr-1" />
                    Automation
                  </TabsTrigger>
                  <TabsTrigger value="discount-coupons" data-testid="tab-discount-coupons">
                    <Percent className="h-4 w-4 mr-1" />
                    Discounts
                  </TabsTrigger>
                </>
              )}
              <TabsTrigger value="input-fields" data-testid="tab-input-fields">
                <FormInput className="h-4 w-4 mr-1" />
                Input Fields
              </TabsTrigger>
            </TabsList>

            {isAdmin && (
              <>
                <TabsContent value="services">
                  <ServiceManagementTabContent onNavigateToServiceFields={handleNavigateToServiceFields} />
                </TabsContent>

                <TabsContent value="pricing">
                  <PricingTabContent
                    pricingData={pricingData}
                    setPricingData={setPricingData}
                    handleSavePricing={handleSavePricing}
                    isPending={updatePricingMutation.isPending}
                  />
                </TabsContent>

                <TabsContent value="line-items">
                  <LineItemsTabContent />
                </TabsContent>

                <TabsContent value="bundles">
                  <BundlesTabContent />
                </TabsContent>

                <TabsContent value="packs">
                  <PacksTabContent />
                </TabsContent>

                <TabsContent value="subscriptions">
                  <SubscriptionsTabContent />
                </TabsContent>

                <TabsContent value="automation">
                  <AutomationSettingsTab />
                </TabsContent>

                <TabsContent value="discount-coupons">
                  <DiscountCouponsTab />
                </TabsContent>
              </>
            )}

            <TabsContent value="input-fields">
              <InputFieldsTabContent />
              <ServiceFieldsManager initialServiceId={preselectedServiceId} onServiceIdConsumed={() => setPreselectedServiceId("")} />
              <LineItemFieldsManager />
              <BundleFieldsAssignmentsManager />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}
