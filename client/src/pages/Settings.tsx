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
import { Settings as SettingsIcon, DollarSign, Save, Package, Plus, Pencil, Boxes, CalendarRange, Trash2, FormInput, Loader2 } from "lucide-react";
import type { User, BundleLineItem, Bundle, BundleItem, Service, ServicePack, ServicePackItem, InputField, ServiceField, BundleFieldDefault } from "@shared/schema";
import { insertBundleLineItemSchema, inputFieldTypes, valueModes } from "@shared/schema";

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

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Service Pricing</CardTitle>
        <Button onClick={handleSavePricing} disabled={isPending} data-testid="button-save-pricing">
          <Save className="h-4 w-4 mr-2" />
          {isPending ? "Saving..." : "Save Pricing"}
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
                            handlePricingChange(service.name, "basePrice", parseFloat(e.target.value) || 0)
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
                              handlePricingChange(subService, "basePrice", parseFloat(e.target.value) || 0)
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
              <div className="font-medium text-dark-blue-night">Creative Art</div>
              <div className="flex flex-col items-center">
                <Label className="text-sm text-dark-gray mb-1">Basic:</Label>
                <Input
                  type="number"
                  value={pricingData["Creative Art"]?.complexity?.basic || ""}
                  onChange={(e) => handleComplexityChange("Creative Art", "basic", parseFloat(e.target.value) || 0)}
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
                  onChange={(e) => handleComplexityChange("Creative Art", "standard", parseFloat(e.target.value) || 0)}
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
                  onChange={(e) => handleComplexityChange("Creative Art", "advanced", parseFloat(e.target.value) || 0)}
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
                  onChange={(e) => handleComplexityChange("Creative Art", "ultimate", parseFloat(e.target.value) || 0)}
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
              <div className="font-medium text-dark-blue-night">Store Creation</div>
              {STORE_QUANTITY_TIERS.map((tier) => (
                <div key={tier} className="flex flex-col items-center">
                  <Label className="text-sm text-dark-gray mb-1">{tier}:</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={pricingData["Store Creation"]?.quantity?.[tier] || ""}
                    onChange={(e) => handleQuantityChange("Store Creation", tier, parseFloat(e.target.value) || 0)}
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
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lineItems.map((item) => (
                <TableRow key={item.id} data-testid={`row-line-item-${item.id}`}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell className="text-muted-foreground max-w-xs truncate">{item.description || "-"}</TableCell>
                  <TableCell className="text-right">${parseFloat(item.price).toFixed(2)}</TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-2">
                      <Switch
                        checked={item.isActive}
                        onCheckedChange={(checked) => toggleActiveMutation.mutate({ id: item.id, isActive: checked })}
                        data-testid={`switch-active-${item.id}`}
                      />
                      <Badge variant={item.isActive ? "default" : "secondary"}>{item.isActive ? "Active" : "Inactive"}</Badge>
                    </div>
                  </TableCell>
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
    queryKey: ["/api/services"],
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
                <TableHead>Bundle Name</TableHead>
                <TableHead className="text-center">Status</TableHead>
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
    <TableRow data-testid={`row-bundle-${bundle.id}`}>
      <TableCell className="font-medium">{bundle.name}</TableCell>
      <TableCell className="text-center">
        <div className="flex items-center justify-center gap-2">
          <Switch
            checked={bundle.isActive}
            onCheckedChange={(checked) => toggleActiveMutation.mutate({ id: bundle.id, isActive: checked })}
            data-testid={`switch-bundle-active-${bundle.id}`}
          />
          <Badge variant={bundle.isActive ? "default" : "secondary"}>
            {bundle.isActive ? "Active" : "Inactive"}
          </Badge>
        </div>
      </TableCell>
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
            onClick={() => {
              if (confirm("Are you sure you want to delete this bundle?")) {
                deleteMutation.mutate(bundle.id);
              }
            }} 
            data-testid={`button-delete-bundle-${bundle.id}`}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function PacksTabContent() {
  const [, navigate] = useLocation();

  const { data: servicePacks = [], isLoading } = useQuery<ServicePack[]>({
    queryKey: ["/api/service-packs"],
  });

  const { data: services = [] } = useQuery<Service[]>({
    queryKey: ["/api/services"],
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
                <TableHead>Pack Name</TableHead>
                <TableHead className="text-center">Status</TableHead>
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

  const fullPrice = packItems.reduce((total, item) => {
    const service = services.find(s => s.id === item.serviceId);
    if (service) return total + parseFloat(service.basePrice) * item.quantity;
    return total;
  }, 0);

  const packPrice = pack.price ? parseFloat(pack.price) : fullPrice;
  const savings = fullPrice - packPrice;
  const savingsPercent = fullPrice > 0 ? (savings / fullPrice) * 100 : 0;

  return (
    <TableRow data-testid={`row-pack-${pack.id}`}>
      <TableCell className="font-medium">{pack.name}</TableCell>
      <TableCell className="text-center">
        <div className="flex items-center justify-center gap-2">
          <Switch
            checked={pack.isActive}
            onCheckedChange={(checked) => toggleActiveMutation.mutate({ id: pack.id, isActive: checked })}
            data-testid={`switch-pack-active-${pack.id}`}
          />
          <Badge variant={pack.isActive ? "default" : "secondary"}>
            {pack.isActive ? "Active" : "Inactive"}
          </Badge>
        </div>
      </TableCell>
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

// Input Field Form Schema
const inputFieldFormSchema = z.object({
  fieldKey: z.string().min(1, "Field key is required").regex(/^[a-z_]+$/, "Must be lowercase with underscores only"),
  label: z.string().min(1, "Label is required"),
  inputType: z.enum(inputFieldTypes),
  valueMode: z.enum(valueModes),
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
    queryKey: ["/api/services"],
  });

  const createFieldMutation = useMutation({
    mutationFn: async (data: InputFieldFormData) => {
      return apiRequest("POST", "/api/input-fields", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/input-fields"] });
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
      toast({ title: "Input fields seeded successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to seed input fields", description: error.message, variant: "destructive" });
    },
  });

  const form = useForm<InputFieldFormData>({
    resolver: zodResolver(inputFieldFormSchema),
    defaultValues: {
      fieldKey: "",
      label: "",
      inputType: "text",
      valueMode: "single",
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
                <TableHead className="w-[180px]">Field Key</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inputFieldsList.map((field) => (
                <TableRow key={field.id} data-testid={`row-input-field-${field.id}`}>
                  <TableCell className="font-mono text-sm">{field.fieldKey}</TableCell>
                  <TableCell>{field.label}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{getInputTypeLabel(field.inputType)}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{field.valueMode}</Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    {field.isActive ? (
                      <Badge variant="default">Active</Badge>
                    ) : (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
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
function ServiceFieldsManager() {
  const { toast } = useToast();
  const [selectedServiceId, setSelectedServiceId] = useState<string>("");
  const [isAddFieldDialogOpen, setIsAddFieldDialogOpen] = useState(false);
  const [editingServiceField, setEditingServiceField] = useState<ServiceField | null>(null);

  const { data: allServices = [] } = useQuery<Service[]>({
    queryKey: ["/api/services"],
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
    mutationFn: async (data: { inputFieldId: string; optionsJson?: string[]; defaultValue?: string; isRequired?: boolean; sortOrder?: number }) => {
      return apiRequest("POST", `/api/services/${selectedServiceId}/fields`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/services", selectedServiceId, "fields"] });
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
    },
  });

  const editFieldForm = useForm({
    defaultValues: {
      optionsJson: "",
      defaultValue: "",
      isRequired: false,
      sortOrder: 0,
    },
  });

  useEffect(() => {
    if (editingServiceField) {
      editFieldForm.reset({
        optionsJson: editingServiceField.optionsJson ? JSON.stringify(editingServiceField.optionsJson) : "",
        defaultValue: (editingServiceField.defaultValue as string) || "",
        isRequired: editingServiceField.required ?? false,
        sortOrder: editingServiceField.sortOrder ?? 0,
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

  const handleAddField = (data: { inputFieldId: string; optionsJson: string; defaultValue: string; isRequired: boolean; sortOrder: number }) => {
    addFieldMutation.mutate({
      inputFieldId: data.inputFieldId,
      optionsJson: parseOptionsInput(data.optionsJson) || undefined,
      defaultValue: data.defaultValue || undefined,
      isRequired: data.isRequired,
      sortOrder: data.sortOrder,
    });
  };

  const handleUpdateField = (data: { optionsJson: string; defaultValue: string; isRequired: boolean; sortOrder: number }) => {
    if (!editingServiceField) return;
    updateServiceFieldMutation.mutate({
      id: editingServiceField.id,
      data: {
        optionsJson: parseOptionsInput(data.optionsJson),
        defaultValue: data.defaultValue || null,
        required: data.isRequired,
        sortOrder: data.sortOrder,
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

// Bundle Field Defaults Manager - Override default values for bundle submissions
function BundleFieldDefaultsManager() {
  const { toast } = useToast();
  const [selectedBundleId, setSelectedBundleId] = useState<string>("");
  const [selectedServiceId, setSelectedServiceId] = useState<string>("");
  const [isAddDefaultDialogOpen, setIsAddDefaultDialogOpen] = useState(false);
  const [editingDefault, setEditingDefault] = useState<BundleFieldDefault | null>(null);

  const { data: allBundles = [] } = useQuery<Bundle[]>({
    queryKey: ["/api/bundles"],
  });

  const { data: allServices = [] } = useQuery<Service[]>({
    queryKey: ["/api/services"],
  });

  const { data: inputFieldsList = [] } = useQuery<InputField[]>({
    queryKey: ["/api/input-fields"],
  });

  const { data: serviceFieldsList = [] } = useQuery<ServiceField[]>({
    queryKey: ["/api/services", selectedServiceId, "fields"],
    queryFn: async () => {
      if (!selectedServiceId) return [];
      const res = await fetch(`/api/services/${selectedServiceId}/fields`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedServiceId,
  });

  const { data: bundleDefaults = [], isLoading: loadingDefaults } = useQuery<BundleFieldDefault[]>({
    queryKey: ["/api/bundles", selectedBundleId, "field-defaults", selectedServiceId],
    queryFn: async () => {
      if (!selectedBundleId) return [];
      let url = `/api/bundles/${selectedBundleId}/field-defaults`;
      if (selectedServiceId) {
        url += `?serviceId=${selectedServiceId}`;
      }
      const res = await fetch(url);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedBundleId,
  });

  const createDefaultMutation = useMutation({
    mutationFn: async (data: { serviceId: string; inputFieldId: string; defaultValue: any }) => {
      return apiRequest("POST", `/api/bundles/${selectedBundleId}/field-defaults`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bundles", selectedBundleId, "field-defaults"] });
      setIsAddDefaultDialogOpen(false);
      toast({ title: "Bundle default created" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create default", description: error.message, variant: "destructive" });
    },
  });

  const updateDefaultMutation = useMutation({
    mutationFn: async ({ id, defaultValue }: { id: string; defaultValue: any }) => {
      return apiRequest("PATCH", `/api/bundle-field-defaults/${id}`, { defaultValue });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bundles", selectedBundleId, "field-defaults"] });
      setEditingDefault(null);
      toast({ title: "Bundle default updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update", description: error.message, variant: "destructive" });
    },
  });

  const deleteDefaultMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/bundle-field-defaults/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bundles", selectedBundleId, "field-defaults"] });
      toast({ title: "Bundle default removed" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to remove", description: error.message, variant: "destructive" });
    },
  });

  const addDefaultForm = useForm({
    defaultValues: {
      serviceId: "",
      inputFieldId: "",
      defaultValue: "",
    },
  });

  const editDefaultForm = useForm({
    defaultValues: {
      defaultValue: "",
    },
  });

  useEffect(() => {
    if (editingDefault) {
      editDefaultForm.reset({
        defaultValue: typeof editingDefault.defaultValue === 'string' 
          ? editingDefault.defaultValue 
          : JSON.stringify(editingDefault.defaultValue),
      });
    }
  }, [editingDefault, editDefaultForm]);

  const handleAddDefault = (data: { serviceId: string; inputFieldId: string; defaultValue: string }) => {
    let parsedValue: any = data.defaultValue;
    try {
      parsedValue = JSON.parse(data.defaultValue);
    } catch {
      // Keep as string if not valid JSON
    }
    createDefaultMutation.mutate({
      serviceId: data.serviceId,
      inputFieldId: data.inputFieldId,
      defaultValue: parsedValue,
    });
  };

  const handleUpdateDefault = (data: { defaultValue: string }) => {
    if (!editingDefault) return;
    let parsedValue: any = data.defaultValue;
    try {
      parsedValue = JSON.parse(data.defaultValue);
    } catch {
      // Keep as string if not valid JSON
    }
    updateDefaultMutation.mutate({
      id: editingDefault.id,
      defaultValue: parsedValue,
    });
  };

  const getInputFieldName = (inputFieldId: string) => {
    const field = inputFieldsList.find(f => f.id === inputFieldId);
    return field?.label || "Unknown Field";
  };

  const getServiceName = (serviceId: string) => {
    const service = allServices.find(s => s.id === serviceId);
    return service?.title || "Unknown Service";
  };

  // Get available fields for the selected service (only fields assigned to that service)
  const availableFieldsToAdd = selectedServiceId 
    ? serviceFieldsList.filter(sf => !bundleDefaults.some(bd => bd.inputFieldId === sf.inputFieldId && bd.serviceId === selectedServiceId))
    : [];

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Boxes className="h-5 w-5" />
          Bundle Field Defaults
        </CardTitle>
        <CardDescription>
          Pre-fill default values for bundle submissions. When a client selects a bundle, these values are automatically applied.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Label>Bundle:</Label>
            <Select value={selectedBundleId} onValueChange={setSelectedBundleId}>
              <SelectTrigger className="w-[250px]" data-testid="select-bundle-for-defaults">
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
            <div className="flex items-center gap-2">
              <Label>Filter by Service:</Label>
              <Select value={selectedServiceId || "all"} onValueChange={(val) => setSelectedServiceId(val === "all" ? "" : val)}>
                <SelectTrigger className="w-[250px]" data-testid="select-service-filter">
                  <SelectValue placeholder="All services" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Services</SelectItem>
                  {allServices.map((service) => (
                    <SelectItem key={service.id} value={service.id}>
                      {service.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {selectedBundleId && (
          <>
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">Default values for this bundle:</h4>
              <Dialog open={isAddDefaultDialogOpen} onOpenChange={setIsAddDefaultDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" disabled={!selectedServiceId || availableFieldsToAdd.length === 0} data-testid="button-add-bundle-default">
                    <Plus className="h-4 w-4 mr-1" />
                    Add Default
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Bundle Default Value</DialogTitle>
                    <DialogDescription>
                      Set a default value for a field when this bundle is selected.
                    </DialogDescription>
                  </DialogHeader>
                  <Form {...addDefaultForm}>
                    <form onSubmit={addDefaultForm.handleSubmit(handleAddDefault)} className="space-y-4">
                      <FormField
                        control={addDefaultForm.control}
                        name="serviceId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Service</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || selectedServiceId}>
                              <FormControl>
                                <SelectTrigger data-testid="select-default-service">
                                  <SelectValue placeholder="Choose service..." />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {allServices.map((s) => (
                                  <SelectItem key={s.id} value={s.id}>
                                    {s.title}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={addDefaultForm.control}
                        name="inputFieldId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Field</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-default-field">
                                  <SelectValue placeholder="Choose field..." />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {availableFieldsToAdd.map((sf) => (
                                  <SelectItem key={sf.inputFieldId} value={sf.inputFieldId}>
                                    {getInputFieldName(sf.inputFieldId)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={addDefaultForm.control}
                        name="defaultValue"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Default Value</FormLabel>
                            <FormControl>
                              <Input {...field} data-testid="input-default-value" placeholder="Enter default value" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => setIsAddDefaultDialogOpen(false)}>
                          Cancel
                        </Button>
                        <Button type="submit" disabled={createDefaultMutation.isPending} data-testid="button-submit-add-default">
                          {createDefaultMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                          Add Default
                        </Button>
                      </div>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </div>

            {loadingDefaults ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : bundleDefaults.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground border rounded-md">
                {selectedServiceId 
                  ? "No bundle defaults configured for this service. Click \"Add Default\" to create one."
                  : "No bundle defaults configured. Select a service filter and click \"Add Default\" to create one."}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Service</TableHead>
                    <TableHead>Field</TableHead>
                    <TableHead>Default Value</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bundleDefaults.map((bd) => (
                    <TableRow key={bd.id} data-testid={`row-bundle-default-${bd.id}`}>
                      <TableCell>{getServiceName(bd.serviceId)}</TableCell>
                      <TableCell className="font-medium">{getInputFieldName(bd.inputFieldId)}</TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {typeof bd.defaultValue === 'string' ? bd.defaultValue : JSON.stringify(bd.defaultValue)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setEditingDefault(bd)}
                            data-testid={`button-edit-bundle-default-${bd.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => deleteDefaultMutation.mutate(bd.id)}
                            data-testid={`button-delete-bundle-default-${bd.id}`}
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

      {/* Edit Bundle Default Dialog */}
      <Dialog open={!!editingDefault} onOpenChange={(open) => !open && setEditingDefault(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Bundle Default</DialogTitle>
            <DialogDescription>
              Update the default value for this field when this bundle is selected.
            </DialogDescription>
          </DialogHeader>
          <Form {...editDefaultForm}>
            <form onSubmit={editDefaultForm.handleSubmit(handleUpdateDefault)} className="space-y-4">
              <FormField
                control={editDefaultForm.control}
                name="defaultValue"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Default Value</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-edit-default-value" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEditingDefault(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updateDefaultMutation.isPending} data-testid="button-submit-edit-default">
                  {updateDefaultMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
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
            <SettingsIcon className="h-8 w-8 text-sky-blue-accent" />
            <h1 className="text-2xl font-semibold text-dark-blue-night">Settings</h1>
          </div>

          <Tabs defaultValue="pricing" className="space-y-6">
            <TabsList>
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
              <TabsTrigger value="input-fields" data-testid="tab-input-fields">
                <FormInput className="h-4 w-4 mr-1" />
                Input Fields
              </TabsTrigger>
            </TabsList>

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

            <TabsContent value="input-fields">
              <InputFieldsTabContent />
              <ServiceFieldsManager />
              <BundleFieldDefaultsManager />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}
