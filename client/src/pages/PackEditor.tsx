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
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { ArrowLeft, CalendarRange, Plus, Trash2, DollarSign, Save } from "lucide-react";
import type { User, Service, ServicePack, ServicePackItem } from "@shared/schema";
import { insertServicePackSchema } from "@shared/schema";

interface LocalPackItem {
  id: string;
  serviceId: string;
  quantity: number;
}

const packFormSchema = insertServicePackSchema.extend({
  name: z.string().min(1, "Pack name is required"),
  description: z.string().nullable().optional(),
  price: z.string().min(1, "Pack price is required").refine(
    (val) => !isNaN(parseFloat(val)) && parseFloat(val) >= 0,
    "Please enter a valid price"
  ),
  isActive: z.boolean().default(true),
});

type PackFormValues = z.infer<typeof packFormSchema>;

async function getDefaultUser(): Promise<User | null> {
  const res = await fetch("/api/default-user");
  if (!res.ok) return null;
  return res.json();
}

export default function PackEditor() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const params = useParams<{ id?: string }>();
  const isEditing = !!params.id;

  const [newItemData, setNewItemData] = useState({
    serviceId: "",
    quantity: "1",
  });
  
  // Local items for Create mode (before pack is saved)
  const [localItems, setLocalItems] = useState<LocalPackItem[]>([]);

  const form = useForm<PackFormValues>({
    resolver: zodResolver(packFormSchema),
    defaultValues: {
      name: "",
      description: "",
      price: "",
      isActive: true,
    },
  });

  const { data: currentUser } = useQuery<User | null>({
    queryKey: ["/api/default-user"],
    queryFn: getDefaultUser,
  });

  const { data: pack, isLoading: packLoading } = useQuery<ServicePack>({
    queryKey: ["/api/service-packs", params.id],
    queryFn: async () => {
      const res = await fetch(`/api/service-packs/${params.id}`);
      if (!res.ok) throw new Error("Pack not found");
      return res.json();
    },
    enabled: isEditing,
  });

  const { data: packItems = [], refetch: refetchItems } = useQuery<ServicePackItem[]>({
    queryKey: ["/api/service-packs", params.id, "items"],
    queryFn: async () => {
      if (!params.id) return [];
      const res = await fetch(`/api/service-packs/${params.id}/items`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isEditing,
  });

  const { data: services = [] } = useQuery<Service[]>({
    queryKey: ["/api/services"],
  });

  useEffect(() => {
    if (pack) {
      form.reset({
        name: pack.name,
        description: pack.description || "",
        price: pack.price || "",
        isActive: pack.isActive,
      });
    }
  }, [pack, form]);

  const createPackMutation = useMutation({
    mutationFn: async (data: PackFormValues) => {
      // Create the pack first
      const res = await apiRequest("POST", "/api/service-packs", {
        name: data.name,
        description: data.description || null,
        price: data.price,
        isActive: data.isActive,
      });
      const newPack = await res.json();
      
      // If no local items, just return the pack
      if (localItems.length === 0) {
        return { pack: newPack, allSucceeded: true };
      }
      
      // Add all local items to the pack - must all succeed
      const itemPromises = localItems.map(item => 
        apiRequest("POST", `/api/service-packs/${newPack.id}/items`, {
          serviceId: item.serviceId,
          quantity: item.quantity,
        })
      );
      
      // Use Promise.all so any failure rejects immediately
      await Promise.all(itemPromises);
      
      return { pack: newPack, allSucceeded: true };
    },
    onSuccess: ({ pack }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-packs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/service-packs", pack.id, "items"] });
      setLocalItems([]); // Clear local items after successful creation
      toast({ title: "Pack created successfully" });
      navigate(`/settings/packs/${pack.id}/edit`);
    },
    onError: (error: Error) => {
      // Keep local items intact so user can retry
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updatePackMutation = useMutation({
    mutationFn: async (data: PackFormValues) => {
      return apiRequest("PATCH", `/api/service-packs/${params.id}`, {
        name: data.name,
        description: data.description || null,
        price: data.price,
        isActive: data.isActive,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-packs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/service-packs", params.id] });
      toast({ title: "Pack updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const addItemMutation = useMutation({
    mutationFn: async (data: typeof newItemData) => {
      return apiRequest("POST", `/api/service-packs/${params.id}/items`, {
        serviceId: data.serviceId,
        quantity: parseInt(data.quantity) || 1,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-packs", params.id, "items"] });
      setNewItemData({ serviceId: "", quantity: "1" });
      toast({ title: "Service added to pack" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const removeItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      return apiRequest("DELETE", `/api/service-packs/${params.id}/items/${itemId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-packs", params.id, "items"] });
      toast({ title: "Service removed from pack" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const onSubmit = (values: PackFormValues) => {
    if (isEditing) {
      updatePackMutation.mutate(values);
    } else {
      createPackMutation.mutate(values);
    }
  };

  const handleAddItem = () => {
    if (!newItemData.serviceId) {
      toast({ title: "Please select a service", variant: "destructive" });
      return;
    }
    
    if (isEditing) {
      // Edit mode: save to backend
      addItemMutation.mutate(newItemData);
    } else {
      // Create mode: add to local state
      const newLocalItem: LocalPackItem = {
        id: `local-${Date.now()}`,
        serviceId: newItemData.serviceId,
        quantity: parseInt(newItemData.quantity) || 1,
      };
      setLocalItems([...localItems, newLocalItem]);
      setNewItemData({ serviceId: "", quantity: "1" });
      toast({ title: "Service added to pack" });
    }
  };
  
  const handleRemoveLocalItem = (itemId: string) => {
    setLocalItems(localItems.filter(item => item.id !== itemId));
    toast({ title: "Service removed from pack" });
  };

  const getItemName = (item: ServicePackItem | LocalPackItem): string => {
    return services.find(s => s.id === item.serviceId)?.title || "Unknown Service";
  };

  const getItemPrice = (item: ServicePackItem | LocalPackItem): number => {
    const service = services.find(s => s.id === item.serviceId);
    return service ? parseFloat(service.basePrice) : 0;
  };

  // Get items to display - either from server (edit mode) or local state (create mode)
  const displayItems = isEditing ? packItems : localItems;

  const calculateTotals = () => {
    let fullPrice = 0;
    const items = isEditing ? packItems : localItems;
    for (const item of items) {
      fullPrice += getItemPrice(item) * item.quantity;
    }
    const packPriceStr = form.watch("price");
    // Only treat as valid pack price if it's a non-empty string that parses to a positive number
    const isValidPackPrice = packPriceStr && packPriceStr.trim() !== "" && !isNaN(parseFloat(packPriceStr)) && parseFloat(packPriceStr) > 0;
    const packPrice = isValidPackPrice ? parseFloat(packPriceStr) : null;
    
    // Only calculate savings if we have a valid pack price
    const savings = packPrice !== null ? Math.max(0, fullPrice - packPrice) : null;
    const savingsPercent = (savings !== null && fullPrice > 0) ? (savings / fullPrice) * 100 : null;
    const isOverpriced = packPrice !== null && fullPrice > 0 && packPrice > fullPrice;
    
    return { fullPrice, packPrice, savings, savingsPercent, isValidPackPrice, isOverpriced };
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

  if (isEditing && packLoading) {
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
            <Button variant="ghost" size="icon" onClick={() => navigate("/settings")} data-testid="button-back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-3">
              <CalendarRange className="h-8 w-8 text-primary" />
              <h1 className="font-semibold text-foreground text-2xl">
                {isEditing ? "Edit Pack" : "Create Pack"}
              </h1>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Pack Details</CardTitle>
                  <CardDescription>Configure the pack name, description, and pricing</CardDescription>
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
                              <Input {...field} placeholder="Enter pack name" data-testid="input-pack-name" />
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
                              <Textarea {...field} value={field.value || ""} placeholder="Enter description (optional)" data-testid="input-pack-description" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      {/* Pack Items Section - inline service selector */}
                      <div className="space-y-3 pt-2">
                        <div className="flex items-center justify-between">
                          <FormLabel className="text-base font-medium">Pack Items</FormLabel>
                          <span className="text-sm text-muted-foreground">Add services to this pack</span>
                        </div>
                        
                        {/* Service selector row */}
                        <div className="flex flex-wrap items-end gap-3 p-4 bg-muted/50 rounded-md">
                          <div className="space-y-1 flex-[2] min-w-[200px]">
                            <Select value={newItemData.serviceId} onValueChange={(v) => setNewItemData({ ...newItemData, serviceId: v })}>
                              <SelectTrigger data-testid="select-service">
                                <SelectValue placeholder="Select a service" />
                              </SelectTrigger>
                              <SelectContent>
                                {services
                                  .filter(s => s.isActive)
                                  .filter(s => {
                                    // Filter out services already added to this pack
                                    const addedServiceIds = displayItems.map(item => 
                                      'serviceId' in item ? item.serviceId : (item as any).service_id
                                    );
                                    return !addedServiceIds.includes(s.id);
                                  })
                                  .map((service) => (
                                  <SelectItem key={service.id} value={service.id}>
                                    {service.title} - ${parseFloat(service.basePrice).toFixed(2)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1 w-20">
                            <Input
                              type="number"
                              min="1"
                              value={newItemData.quantity}
                              onChange={(e) => setNewItemData({ ...newItemData, quantity: e.target.value })}
                              placeholder="Qty"
                              data-testid="input-item-quantity"
                            />
                          </div>
                          <Button type="button" onClick={handleAddItem} disabled={addItemMutation.isPending} data-testid="button-add-item">
                            <Plus className="h-4 w-4 mr-1" />
                            Add
                          </Button>
                        </div>
                        
                        {/* Services table */}
                        {displayItems.length === 0 ? (
                          <p className="text-muted-foreground text-center py-4">No services added yet</p>
                        ) : (
                          <ScrollArea className="max-h-[400px]">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Service</TableHead>
                                  <TableHead className="text-center w-20">Qty</TableHead>
                                  <TableHead className="text-right w-24">Unit Price</TableHead>
                                  <TableHead className="text-right w-28">Total</TableHead>
                                  <TableHead className="w-10"></TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {displayItems.map((item) => {
                                  const unitPrice = getItemPrice(item);
                                  const totalPrice = unitPrice * item.quantity;
                                  return (
                                    <TableRow key={item.id}>
                                      <TableCell className="font-medium">
                                        {getItemName(item)}
                                      </TableCell>
                                      <TableCell className="text-center">{item.quantity}</TableCell>
                                      <TableCell className="text-right">${unitPrice.toFixed(2)}</TableCell>
                                      <TableCell className="text-right font-medium">${totalPrice.toFixed(2)}</TableCell>
                                      <TableCell>
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          type="button"
                                          onClick={() => isEditing ? removeItemMutation.mutate(item.id) : handleRemoveLocalItem(item.id)}
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
                          </ScrollArea>
                        )}
                        
                        {/* Full Price total line */}
                        {displayItems.length > 0 && (
                          <div className="flex justify-end pt-2 pr-12 border-t">
                            <div className="flex items-center gap-4">
                              <span className="text-sm font-medium">Full Price (Total):</span>
                              <span className="text-lg font-semibold">${pricing.fullPrice.toFixed(2)}</span>
                            </div>
                          </div>
                        )}
                      </div>
                      
                      <FormField
                        control={form.control}
                        name="price"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Pack Price<span className="text-destructive">*</span></FormLabel>
                            <FormControl>
                              <Input type="number" step="0.01" min="0" {...field} value={field.value || ""} placeholder="0.00" data-testid="input-pack-price" />
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
                              <Switch id="packActive" checked={field.value} onCheckedChange={field.onChange} data-testid="switch-pack-active" />
                            </FormControl>
                            <FormLabel htmlFor="packActive" className="!mt-0">Active</FormLabel>
                          </FormItem>
                        )}
                      />
                      <div className="flex justify-end pt-4">
                        <Button type="submit" disabled={createPackMutation.isPending || updatePackMutation.isPending} data-testid="button-save-pack">
                          <Save className="h-4 w-4 mr-2" />
                          {(createPackMutation.isPending || updatePackMutation.isPending) ? "Saving..." : isEditing ? "Update Pack" : "Create Pack"}
                        </Button>
                      </div>
                    </form>
                  </Form>
                </CardContent>
              </Card>

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
                    <span className="font-medium">${pricing.fullPrice.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-semibold border-t pt-3">
                    <span>Pack Price:</span>
                    <span>{pricing.packPrice !== null ? `$${pricing.packPrice.toFixed(2)}` : "$0.00"}</span>
                  </div>
                  {pricing.isValidPackPrice && pricing.fullPrice > 0 && pricing.savings !== null && pricing.savings > 0 && pricing.savingsPercent !== null && (
                    <div className="pt-3 border-t space-y-2">
                      <div className="flex justify-between text-sm text-green-600 dark:text-green-400">
                        <span>Savings (Amount):</span>
                        <span className="font-medium">${pricing.savings.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm text-green-600 dark:text-green-400">
                        <span>Savings (%):</span>
                        <span className="font-medium">{pricing.savingsPercent.toFixed(1)}%</span>
                      </div>
                    </div>
                  )}
                  {pricing.isOverpriced && (
                    <div className="pt-3 border-t">
                      <p className="text-sm text-amber-600 dark:text-amber-400">
                        Pack price is higher than full price
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
