import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLocation, useParams } from "wouter";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import { ArrowLeft, Boxes, Plus, Trash2, DollarSign, Save } from "lucide-react";
import type { User, Bundle, BundleItem, BundleLineItem, Service } from "@shared/schema";
import { insertBundleSchema } from "@shared/schema";

const bundleFormSchema = insertBundleSchema.extend({
  name: z.string().min(1, "Bundle name is required"),
  description: z.string().nullable().optional(),
  discountPercent: z.string().nullable().optional(),
  finalPrice: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
});

type BundleFormValues = z.infer<typeof bundleFormSchema>;

async function getDefaultUser(): Promise<User | null> {
  const res = await fetch("/api/default-user");
  if (!res.ok) return null;
  return res.json();
}

export default function BundleEditor() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const params = useParams<{ id?: string }>();
  const isEditing = !!params.id;

  const [newItemData, setNewItemData] = useState({
    itemType: "service" as "service" | "lineItem",
    serviceId: "",
    lineItemId: "",
    quantity: "1",
  });

  const form = useForm<BundleFormValues>({
    resolver: zodResolver(bundleFormSchema),
    defaultValues: {
      name: "",
      description: "",
      discountPercent: "",
      finalPrice: "",
      isActive: true,
    },
  });

  const { data: currentUser } = useQuery<User | null>({
    queryKey: ["/api/default-user"],
    queryFn: getDefaultUser,
  });

  const { data: bundle, isLoading: bundleLoading } = useQuery<Bundle>({
    queryKey: ["/api/bundles", params.id],
    queryFn: async () => {
      const res = await fetch(`/api/bundles/${params.id}`);
      if (!res.ok) throw new Error("Bundle not found");
      return res.json();
    },
    enabled: isEditing,
  });

  const { data: bundleItems = [], refetch: refetchItems } = useQuery<BundleItem[]>({
    queryKey: ["/api/bundles", params.id, "items"],
    queryFn: async () => {
      if (!params.id) return [];
      const res = await fetch(`/api/bundles/${params.id}/items`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isEditing,
  });

  const { data: services = [] } = useQuery<Service[]>({
    queryKey: ["/api/services"],
  });

  const { data: lineItems = [] } = useQuery<BundleLineItem[]>({
    queryKey: ["/api/bundle-line-items"],
  });

  useEffect(() => {
    if (bundle) {
      form.reset({
        name: bundle.name,
        description: bundle.description || "",
        discountPercent: bundle.discountPercent || "",
        finalPrice: bundle.finalPrice || "",
        isActive: bundle.isActive,
      });
    }
  }, [bundle, form]);

  const createBundleMutation = useMutation({
    mutationFn: async (data: BundleFormValues) => {
      const res = await apiRequest("POST", "/api/bundles", {
        name: data.name,
        description: data.description || null,
        discountPercent: data.discountPercent || "0",
        finalPrice: data.finalPrice || null,
        isActive: data.isActive,
      });
      return res.json();
    },
    onSuccess: (newBundle) => {
      queryClient.invalidateQueries({ queryKey: ["/api/bundles"] });
      toast({ title: "Bundle created successfully" });
      navigate(`/settings/bundles/${newBundle.id}/edit`);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateBundleMutation = useMutation({
    mutationFn: async (data: BundleFormValues) => {
      return apiRequest("PATCH", `/api/bundles/${params.id}`, {
        name: data.name,
        description: data.description || null,
        discountPercent: data.discountPercent || "0",
        finalPrice: data.finalPrice || null,
        isActive: data.isActive,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bundles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bundles", params.id] });
      toast({ title: "Bundle updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const addItemMutation = useMutation({
    mutationFn: async (data: typeof newItemData) => {
      return apiRequest("POST", `/api/bundles/${params.id}/items`, {
        serviceId: data.itemType === "service" ? data.serviceId : null,
        lineItemId: data.itemType === "lineItem" ? data.lineItemId : null,
        quantity: parseInt(data.quantity) || 1,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bundles", params.id, "items"] });
      setNewItemData({ itemType: "service", serviceId: "", lineItemId: "", quantity: "1" });
      toast({ title: "Item added to bundle" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const removeItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      return apiRequest("DELETE", `/api/bundles/${params.id}/items/${itemId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bundles", params.id, "items"] });
      toast({ title: "Item removed from bundle" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const onSubmit = (values: BundleFormValues) => {
    if (isEditing) {
      updateBundleMutation.mutate(values);
    } else {
      createBundleMutation.mutate(values);
    }
  };

  const handleAddItem = () => {
    if (!params.id) {
      toast({ title: "Please save the bundle first", variant: "destructive" });
      return;
    }
    if (newItemData.itemType === "service" && !newItemData.serviceId) {
      toast({ title: "Please select a service", variant: "destructive" });
      return;
    }
    if (newItemData.itemType === "lineItem" && !newItemData.lineItemId) {
      toast({ title: "Please select a line item", variant: "destructive" });
      return;
    }
    addItemMutation.mutate(newItemData);
  };

  const getItemName = (item: BundleItem): string => {
    if (item.serviceId) {
      return services.find(s => s.id === item.serviceId)?.title || "Unknown Service";
    }
    if (item.lineItemId) {
      return lineItems.find(li => li.id === item.lineItemId)?.name || "Unknown Line Item";
    }
    return "Unknown";
  };

  const getItemPrice = (item: BundleItem): number => {
    if (item.serviceId) {
      const service = services.find(s => s.id === item.serviceId);
      return service ? parseFloat(service.basePrice) : 0;
    }
    if (item.lineItemId) {
      const lineItem = lineItems.find(li => li.id === item.lineItemId);
      return lineItem ? parseFloat(lineItem.price) : 0;
    }
    return 0;
  };

  const calculateTotals = () => {
    let subtotal = 0;
    for (const item of bundleItems) {
      subtotal += getItemPrice(item) * item.quantity;
    }
    const discountPercent = parseFloat(form.watch("discountPercent") || "0");
    const discount = subtotal * (discountPercent / 100);
    const finalOverride = form.watch("finalPrice") ? parseFloat(form.watch("finalPrice") || "0") : null;
    const final = finalOverride !== null && finalOverride > 0 ? finalOverride : subtotal - discount;
    return { subtotal, discount, final };
  };

  if (currentUser?.role !== "admin") {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="p-8">
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-muted-foreground">Access denied. Admin role required.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (isEditing && bundleLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  const pricing = calculateTotals();

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={() => navigate("/settings?tab=bundles")} data-testid="button-back">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <div className="flex items-center gap-3">
              <Boxes className="h-8 w-8 text-primary" />
              <h1 className="font-semibold text-foreground text-2xl">
                {isEditing ? "Edit Bundle" : "Create Bundle"}
              </h1>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Bundle Details</CardTitle>
                  <CardDescription>Configure the bundle name, description, and pricing</CardDescription>
                </CardHeader>
                <CardContent>
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Name<span className="text-destructive">*</span></FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Enter bundle name" data-testid="input-bundle-name" />
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
                              <Textarea {...field} value={field.value || ""} placeholder="Enter description (optional)" data-testid="input-bundle-description" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="discountPercent"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Discount Percent</FormLabel>
                              <FormControl>
                                <Input type="number" step="0.01" min="0" max="100" {...field} value={field.value || ""} placeholder="0" data-testid="input-bundle-discount" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="finalPrice"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Final Price Override</FormLabel>
                              <FormControl>
                                <Input type="number" step="0.01" min="0" {...field} value={field.value || ""} placeholder="Leave empty for auto-calc" data-testid="input-bundle-final-price" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <FormField
                        control={form.control}
                        name="isActive"
                        render={({ field }) => (
                          <FormItem className="flex items-center gap-2">
                            <FormControl>
                              <Switch id="bundleActive" checked={field.value} onCheckedChange={field.onChange} data-testid="switch-bundle-active" />
                            </FormControl>
                            <FormLabel htmlFor="bundleActive" className="!mt-0">Active</FormLabel>
                          </FormItem>
                        )}
                      />
                      <div className="flex justify-end pt-4">
                        <Button type="submit" disabled={createBundleMutation.isPending || updateBundleMutation.isPending} data-testid="button-save-bundle">
                          <Save className="h-4 w-4 mr-2" />
                          {(createBundleMutation.isPending || updateBundleMutation.isPending) ? "Saving..." : isEditing ? "Update Bundle" : "Create Bundle"}
                        </Button>
                      </div>
                    </form>
                  </Form>
                </CardContent>
              </Card>

              {isEditing && (
                <Card>
                  <CardHeader>
                    <CardTitle>Bundle Items</CardTitle>
                    <CardDescription>Add services and line items to this bundle</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-wrap items-end gap-3 p-4 bg-muted/50 rounded-md">
                      <div className="space-y-1 flex-1 min-w-[120px]">
                        <Label>Type</Label>
                        <Select value={newItemData.itemType} onValueChange={(v: "service" | "lineItem") => setNewItemData({ ...newItemData, itemType: v, serviceId: "", lineItemId: "" })}>
                          <SelectTrigger data-testid="select-item-type">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="service">Service</SelectItem>
                            <SelectItem value="lineItem">Line Item</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1 flex-[2] min-w-[200px]">
                        <Label>{newItemData.itemType === "service" ? "Service" : "Line Item"}</Label>
                        {newItemData.itemType === "service" ? (
                          <Select value={newItemData.serviceId} onValueChange={(v) => setNewItemData({ ...newItemData, serviceId: v })}>
                            <SelectTrigger data-testid="select-service">
                              <SelectValue placeholder="Select a service" />
                            </SelectTrigger>
                            <SelectContent>
                              {services.filter(s => s.isActive).map((service) => (
                                <SelectItem key={service.id} value={service.id}>
                                  {service.title} - ${parseFloat(service.basePrice).toFixed(2)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Select value={newItemData.lineItemId} onValueChange={(v) => setNewItemData({ ...newItemData, lineItemId: v })}>
                            <SelectTrigger data-testid="select-line-item">
                              <SelectValue placeholder="Select a line item" />
                            </SelectTrigger>
                            <SelectContent>
                              {lineItems.filter(li => li.isActive).map((item) => (
                                <SelectItem key={item.id} value={item.id}>
                                  {item.name} - ${parseFloat(item.price).toFixed(2)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                      <div className="space-y-1 w-20">
                        <Label>Qty</Label>
                        <Input
                          type="number"
                          min="1"
                          value={newItemData.quantity}
                          onChange={(e) => setNewItemData({ ...newItemData, quantity: e.target.value })}
                          data-testid="input-item-quantity"
                        />
                      </div>
                      <Button onClick={handleAddItem} disabled={addItemMutation.isPending} data-testid="button-add-item">
                        <Plus className="h-4 w-4 mr-1" />
                        Add
                      </Button>
                    </div>

                    {bundleItems.length === 0 ? (
                      <p className="text-muted-foreground text-center py-4">No items added yet</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Item</TableHead>
                            <TableHead className="text-center">Qty</TableHead>
                            <TableHead className="text-right">Unit Price</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                            <TableHead className="w-10"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {bundleItems.map((item) => {
                            const unitPrice = getItemPrice(item);
                            const totalPrice = unitPrice * item.quantity;
                            return (
                              <TableRow key={item.id}>
                                <TableCell className="font-medium">
                                  <div className="flex items-center gap-2">
                                    {getItemName(item)}
                                    <Badge variant="outline" className="text-xs">
                                      {item.serviceId ? "Service" : "Line Item"}
                                    </Badge>
                                  </div>
                                </TableCell>
                                <TableCell className="text-center">{item.quantity}</TableCell>
                                <TableCell className="text-right">${unitPrice.toFixed(2)}</TableCell>
                                <TableCell className="text-right">${totalPrice.toFixed(2)}</TableCell>
                                <TableCell>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => removeItemMutation.mutate(item.id)}
                                    data-testid={`button-remove-item-${item.id}`}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5" />
                    Price Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span>Full Price:</span>
                    <span className="font-medium">${pricing.subtotal.toFixed(2)}</span>
                  </div>
                  {pricing.discount > 0 && (
                    <div className="flex justify-between text-sm text-green-600">
                      <span>Discount ({form.watch("discountPercent") || 0}%):</span>
                      <span>-${pricing.discount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-semibold border-t pt-3">
                    <span>Bundle Price:</span>
                    <span>${pricing.final.toFixed(2)}</span>
                  </div>
                  {pricing.subtotal > 0 && pricing.subtotal !== pricing.final && (
                    <div className="text-sm text-green-600 pt-2">
                      Customer saves: ${(pricing.subtotal - pricing.final).toFixed(2)} ({((1 - pricing.final / pricing.subtotal) * 100).toFixed(1)}%)
                    </div>
                  )}
                </CardContent>
              </Card>

              {!isEditing && (
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground text-center">
                      Save the bundle first to add services and line items.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
