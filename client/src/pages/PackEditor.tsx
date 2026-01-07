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
import { ArrowLeft, CalendarRange, DollarSign, Save } from "lucide-react";
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
    enabled: isEditing && !!currentUser,
  });

  const { data: packItems = [], refetch: refetchItems } = useQuery<ServicePackItem[]>({
    queryKey: ["/api/service-packs", params.id, "items"],
    queryFn: async () => {
      if (!params.id) return [];
      const res = await fetch(`/api/service-packs/${params.id}/items`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isEditing && !!currentUser,
    staleTime: 0,
    refetchOnMount: "always",
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
      
      // For new-style packs with direct serviceId/quantity, initialize the service selector
      if (pack.serviceId && pack.quantity) {
        setNewItemData({
          serviceId: pack.serviceId,
          quantity: String(pack.quantity),
        });
      }
    }
  }, [pack, form]);

  const createPackMutation = useMutation({
    mutationFn: async (data: PackFormValues) => {
      // Validate that we have a service selected (single-service pack)
      if (localItems.length === 0) {
        throw new Error("Please select a service for this pack");
      }
      
      // Get the single service from localItems (packs are now single-service only)
      const packItem = localItems[0];
      
      // Create the pack with serviceId and quantity included
      const res = await apiRequest("POST", "/api/service-packs", {
        name: data.name,
        description: data.description || null,
        price: data.price,
        isActive: data.isActive,
        serviceId: packItem.serviceId,
        quantity: packItem.quantity,
      });
      const newPack = await res.json();
      
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

  // Get items to display - for new-style packs use pack's serviceId/quantity, otherwise use packItems/localItems
  const displayItems: (ServicePackItem | LocalPackItem)[] = (() => {
    if (isEditing) {
      // New-style pack: use pack's direct serviceId/quantity
      if (pack?.serviceId && pack?.quantity) {
        return [{
          id: 'pack-service',
          serviceId: pack.serviceId,
          quantity: pack.quantity,
        } as LocalPackItem];
      }
      // Legacy pack: use packItems
      return packItems;
    }
    // Create mode: use local items
    return localItems;
  })();

  const calculateTotals = () => {
    let fullPrice = 0;
    
    if (isEditing) {
      // For edit mode: prefer pack's direct serviceId/quantity (new style), fall back to packItems (legacy)
      if (pack?.serviceId && pack?.quantity) {
        const service = services.find(s => s.id === pack.serviceId);
        if (service) {
          fullPrice = parseFloat(service.basePrice) * pack.quantity;
        }
      } else {
        // Legacy pack: calculate from packItems
        for (const item of packItems) {
          fullPrice += getItemPrice(item) * item.quantity;
        }
      }
    } else {
      // Create mode: calculate from local items
      for (const item of localItems) {
        fullPrice += getItemPrice(item) * item.quantity;
      }
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
            <Button variant="outline" onClick={() => navigate("/settings?tab=packs")} data-testid="button-back">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
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
                      
                      {/* Pack Service - Single service per pack */}
                      <div className="space-y-3 pt-2">
                        <div className="flex items-center justify-between">
                          <FormLabel className="text-base font-medium">Pack Service</FormLabel>
                          <span className="text-sm text-muted-foreground">Select one service for this pack</span>
                        </div>
                        
                        {/* Single service selector row */}
                        <div className="flex flex-wrap items-end gap-3 p-4 bg-muted/50 rounded-md">
                          <div className="space-y-1 flex-[2] min-w-[200px]">
                            <Select 
                              value={displayItems.length > 0 ? displayItems[0].serviceId : newItemData.serviceId} 
                              onValueChange={(v) => {
                                if (isEditing && displayItems.length > 0) {
                                  // In edit mode with existing item, update the service
                                  removeItemMutation.mutate(displayItems[0].id, {
                                    onSuccess: () => {
                                      addItemMutation.mutate({ serviceId: v, quantity: newItemData.quantity });
                                    }
                                  });
                                } else if (!isEditing && localItems.length > 0) {
                                  // In create mode, replace local item
                                  setLocalItems([{ id: `local-${Date.now()}`, serviceId: v, quantity: parseInt(newItemData.quantity) || 1 }]);
                                } else {
                                  setNewItemData({ ...newItemData, serviceId: v });
                                }
                              }}
                            >
                              <SelectTrigger data-testid="select-service">
                                <SelectValue placeholder="Select a service" />
                              </SelectTrigger>
                              <SelectContent>
                                {services
                                  .filter(s => s.isActive)
                                  .map((service) => (
                                  <SelectItem key={service.id} value={service.id}>
                                    {service.title} - ${parseFloat(service.basePrice).toFixed(2)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1 w-24">
                            <Input
                              type="number"
                              min="1"
                              value={displayItems.length > 0 ? displayItems[0].quantity.toString() : newItemData.quantity}
                              onChange={(e) => {
                                const qty = e.target.value;
                                if (isEditing && displayItems.length > 0) {
                                  // In edit mode, update the quantity by recreating the item
                                  const currentServiceId = displayItems[0].serviceId;
                                  removeItemMutation.mutate(displayItems[0].id, {
                                    onSuccess: () => {
                                      addItemMutation.mutate({ serviceId: currentServiceId, quantity: qty });
                                    }
                                  });
                                } else if (!isEditing && localItems.length > 0) {
                                  // In create mode, update local item quantity
                                  setLocalItems([{ ...localItems[0], quantity: parseInt(qty) || 1 }]);
                                } else {
                                  setNewItemData({ ...newItemData, quantity: qty });
                                }
                              }}
                              placeholder="Quantity"
                              data-testid="input-item-quantity"
                            />
                          </div>
                          {/* Save button for adding/updating the service */}
                          {displayItems.length === 0 && newItemData.serviceId && (
                            <Button 
                              type="button" 
                              onClick={handleAddItem} 
                              disabled={addItemMutation.isPending}
                              data-testid="button-save-service"
                            >
                              <Save className="h-4 w-4 mr-1" />
                              Save
                            </Button>
                          )}
                        </div>
                        
                        {/* Show the selected service details */}
                        {displayItems.length > 0 && (
                          <div className="border rounded-md">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Service</TableHead>
                                  <TableHead className="text-center w-20">Qty</TableHead>
                                  <TableHead className="text-right w-24">Unit Price</TableHead>
                                  <TableHead className="text-right w-28">Total</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {displayItems.slice(0, 1).map((item) => {
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
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                        
                        {/* Full Price total line */}
                        {displayItems.length > 0 && (
                          <div className="flex justify-end pt-2 border-t">
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
