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
import { Settings as SettingsIcon, DollarSign, Save, Package, Plus, Pencil, Boxes, CalendarRange, Trash2 } from "lucide-react";
import type { User, BundleLineItem, Bundle, BundleItem, Service, ServicePack, ServicePackItem } from "@shared/schema";
import { insertBundleLineItemSchema } from "@shared/schema";

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
                    <Button size="icon" variant="ghost" onClick={() => openEditDialog(item)} data-testid={`button-edit-${item.id}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
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
  const { data: bundleItems = [] } = useQuery<BundleItem[]>({
    queryKey: ["/api/bundles", bundle.id, "items"],
    queryFn: async () => {
      const res = await fetch(`/api/bundles/${bundle.id}/items`);
      if (!res.ok) return [];
      return res.json();
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
        <Badge variant={bundle.isActive ? "default" : "secondary"}>
          {bundle.isActive ? "Active" : "Inactive"}
        </Badge>
      </TableCell>
      <TableCell className="text-right">${fullPrice.toFixed(2)}</TableCell>
      <TableCell className="text-right">${bundlePrice.toFixed(2)}</TableCell>
      <TableCell className="text-right">
        <Button size="icon" variant="ghost" onClick={onEdit} data-testid={`button-edit-bundle-${bundle.id}`}>
          <Pencil className="h-4 w-4" />
        </Button>
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
  const { data: packItems = [] } = useQuery<ServicePackItem[]>({
    queryKey: ["/api/service-packs", pack.id, "items"],
    queryFn: async () => {
      const res = await fetch(`/api/service-packs/${pack.id}/items`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const fullPrice = packItems.reduce((total, item) => {
    const service = services.find(s => s.id === item.serviceId);
    if (service) return total + parseFloat(service.basePrice) * item.quantity;
    return total;
  }, 0);

  const packPrice = pack.price ? parseFloat(pack.price) : fullPrice;

  return (
    <TableRow data-testid={`row-pack-${pack.id}`}>
      <TableCell className="font-medium">{pack.name}</TableCell>
      <TableCell className="text-center">
        <Badge variant={pack.isActive ? "default" : "secondary"}>
          {pack.isActive ? "Active" : "Inactive"}
        </Badge>
      </TableCell>
      <TableCell className="text-right">${fullPrice.toFixed(2)}</TableCell>
      <TableCell className="text-right">${packPrice.toFixed(2)}</TableCell>
      <TableCell className="text-right">
        <Button size="icon" variant="ghost" onClick={onEdit} data-testid={`button-edit-pack-${pack.id}`}>
          <Pencil className="h-4 w-4" />
        </Button>
      </TableCell>
    </TableRow>
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
          </Tabs>
        </div>
      </main>
    </div>
  );
}
