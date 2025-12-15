import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
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
import { useToast } from "@/hooks/use-toast";
import { Boxes, Plus, Pencil, Trash2, DollarSign } from "lucide-react";
import type { Bundle, BundleItem, BundleLineItem, Service, User } from "@shared/schema";

async function getDefaultUser(): Promise<User | null> {
  const res = await fetch("/api/default-user");
  if (!res.ok) return null;
  return res.json();
}

type BundleWithItems = Bundle & {
  items?: (BundleItem & { service?: Service; lineItem?: BundleLineItem })[];
};

export default function AdminBundleConfigurator() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [addItemDialogOpen, setAddItemDialogOpen] = useState(false);
  const [editingBundle, setEditingBundle] = useState<Bundle | null>(null);
  const [selectedBundle, setSelectedBundle] = useState<Bundle | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    discountPercent: "",
    finalPrice: "",
    isActive: true,
  });
  const [newItemData, setNewItemData] = useState({
    itemType: "service" as "service" | "lineItem",
    serviceId: "",
    lineItemId: "",
    quantity: "1",
  });

  const { data: currentUser } = useQuery<User | null>({
    queryKey: ["/api/default-user"],
    queryFn: getDefaultUser,
  });

  const { data: bundles = [], isLoading } = useQuery<Bundle[]>({
    queryKey: ["/api/bundles"],
  });

  const { data: services = [] } = useQuery<Service[]>({
    queryKey: ["/api/services"],
  });

  const { data: lineItems = [] } = useQuery<BundleLineItem[]>({
    queryKey: ["/api/bundle-line-items"],
  });

  const { data: bundleItems = [] } = useQuery<BundleItem[]>({
    queryKey: ["/api/bundles", selectedBundle?.id, "items"],
    queryFn: async () => {
      if (!selectedBundle) return [];
      const res = await fetch(`/api/bundles/${selectedBundle.id}/items`);
      if (!res.ok) throw new Error("Failed to fetch bundle items");
      return res.json();
    },
    enabled: !!selectedBundle,
  });

  const createBundleMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return apiRequest("POST", "/api/bundles", {
        name: data.name,
        description: data.description || null,
        discountPercent: data.discountPercent || "0",
        finalPrice: data.finalPrice || null,
        isActive: data.isActive,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bundles"] });
      closeDialog();
      toast({ title: "Bundle created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateBundleMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<typeof formData> }) => {
      return apiRequest("PATCH", `/api/bundles/${id}`, {
        name: data.name,
        description: data.description || null,
        discountPercent: data.discountPercent || "0",
        finalPrice: data.finalPrice || null,
        isActive: data.isActive,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bundles"] });
      closeDialog();
      toast({ title: "Bundle updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const addItemMutation = useMutation({
    mutationFn: async ({ bundleId, data }: { bundleId: string; data: typeof newItemData }) => {
      return apiRequest("POST", `/api/bundles/${bundleId}/items`, {
        serviceId: data.itemType === "service" ? data.serviceId : null,
        lineItemId: data.itemType === "lineItem" ? data.lineItemId : null,
        quantity: parseInt(data.quantity) || 1,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bundles", selectedBundle?.id, "items"] });
      setAddItemDialogOpen(false);
      setNewItemData({ itemType: "service", serviceId: "", lineItemId: "", quantity: "1" });
      toast({ title: "Item added to bundle" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const removeItemMutation = useMutation({
    mutationFn: async ({ bundleId, itemId }: { bundleId: string; itemId: string }) => {
      return apiRequest("DELETE", `/api/bundles/${bundleId}/items/${itemId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bundles", selectedBundle?.id, "items"] });
      toast({ title: "Item removed from bundle" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingBundle(null);
    setFormData({ name: "", description: "", discountPercent: "", finalPrice: "", isActive: true });
  };

  const openCreateDialog = () => {
    setEditingBundle(null);
    setFormData({ name: "", description: "", discountPercent: "", finalPrice: "", isActive: true });
    setDialogOpen(true);
  };

  const openEditDialog = (bundle: Bundle) => {
    setEditingBundle(bundle);
    setFormData({
      name: bundle.name,
      description: bundle.description || "",
      discountPercent: bundle.discountPercent || "",
      finalPrice: bundle.finalPrice || "",
      isActive: bundle.isActive,
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.name) {
      toast({ title: "Please enter a bundle name", variant: "destructive" });
      return;
    }

    if (editingBundle) {
      updateBundleMutation.mutate({ id: editingBundle.id, data: formData });
    } else {
      createBundleMutation.mutate(formData);
    }
  };

  const handleAddItem = () => {
    if (!selectedBundle) return;
    if (newItemData.itemType === "service" && !newItemData.serviceId) {
      toast({ title: "Please select a service", variant: "destructive" });
      return;
    }
    if (newItemData.itemType === "lineItem" && !newItemData.lineItemId) {
      toast({ title: "Please select a line item", variant: "destructive" });
      return;
    }
    addItemMutation.mutate({ bundleId: selectedBundle.id, data: newItemData });
  };

  const calculateBundleTotal = (): { subtotal: number; discount: number; final: number } => {
    let subtotal = 0;
    
    for (const item of bundleItems) {
      if (item.serviceId) {
        const service = services.find(s => s.id === item.serviceId);
        if (service) {
          subtotal += parseFloat(service.basePrice) * item.quantity;
        }
      }
      if (item.lineItemId) {
        const lineItem = lineItems.find(li => li.id === item.lineItemId);
        if (lineItem) {
          subtotal += parseFloat(lineItem.price) * item.quantity;
        }
      }
    }

    const discountPercent = parseFloat(selectedBundle?.discountPercent || "0");
    const discount = subtotal * (discountPercent / 100);
    const finalOverride = selectedBundle?.finalPrice ? parseFloat(selectedBundle.finalPrice) : null;
    const final = finalOverride !== null ? finalOverride : subtotal - discount;

    return { subtotal, discount, final };
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

  if (currentUser?.role !== "admin") {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="p-8">
          <div className="max-w-6xl mx-auto">
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-muted-foreground">
                  Access denied. Admin role required.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  const pricing = selectedBundle ? calculateBundleTotal() : null;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="p-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <Boxes className="h-8 w-8 text-primary" />
              <h1 className="font-semibold text-foreground text-2xl">
                Bundle Configurator
              </h1>
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={openCreateDialog} data-testid="button-create-bundle">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Bundle
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>
                    {editingBundle ? "Edit Bundle" : "Create Bundle"}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label>Name<span className="text-destructive">*</span></Label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Enter bundle name"
                      data-testid="input-bundle-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Enter description (optional)"
                      data-testid="input-bundle-description"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Discount Percent</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={formData.discountPercent}
                      onChange={(e) => setFormData({ ...formData, discountPercent: e.target.value })}
                      placeholder="0"
                      data-testid="input-bundle-discount"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Final Price Override</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.finalPrice}
                      onChange={(e) => setFormData({ ...formData, finalPrice: e.target.value })}
                      placeholder="Leave empty to calculate from discount"
                      data-testid="input-bundle-final-price"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      id="bundleActive"
                      checked={formData.isActive}
                      onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                      data-testid="switch-bundle-active"
                    />
                    <Label htmlFor="bundleActive">Active</Label>
                  </div>
                  <div className="flex justify-end gap-2 pt-4">
                    <Button
                      variant="outline"
                      onClick={closeDialog}
                      data-testid="button-cancel-bundle"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleSubmit}
                      disabled={createBundleMutation.isPending || updateBundleMutation.isPending}
                      data-testid="button-save-bundle"
                    >
                      {(createBundleMutation.isPending || updateBundleMutation.isPending)
                        ? "Saving..."
                        : editingBundle ? "Update" : "Create"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Bundles ({bundles.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {bundles.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    No bundles yet. Create your first one above.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {bundles.map((bundle) => (
                      <div
                        key={bundle.id}
                        className={`flex items-center justify-between p-3 border rounded-md cursor-pointer hover-elevate ${
                          selectedBundle?.id === bundle.id ? "border-primary bg-muted/50" : ""
                        }`}
                        onClick={() => setSelectedBundle(bundle)}
                        data-testid={`row-bundle-${bundle.id}`}
                      >
                        <div className="flex items-center gap-3">
                          <div>
                            <p className="font-medium">{bundle.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {bundle.discountPercent && parseFloat(bundle.discountPercent) > 0
                                ? `${bundle.discountPercent}% off`
                                : "No discount"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={bundle.isActive ? "default" : "secondary"}>
                            {bundle.isActive ? "Active" : "Inactive"}
                          </Badge>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditDialog(bundle);
                            }}
                            data-testid={`button-edit-bundle-${bundle.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  {selectedBundle ? selectedBundle.name : "Bundle Details"}
                </CardTitle>
                {selectedBundle && (
                  <CardDescription>
                    Configure items and view pricing for this bundle
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent>
                {!selectedBundle ? (
                  <p className="text-muted-foreground text-center py-8">
                    Select a bundle from the list to configure items
                  </p>
                ) : (
                  <div className="space-y-6">
                    {pricing && (
                      <div className="p-4 bg-muted/50 rounded-md space-y-2">
                        <div className="flex items-center gap-2 mb-3">
                          <DollarSign className="h-5 w-5 text-primary" />
                          <span className="font-semibold">Savings Calculator</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>Subtotal:</span>
                          <span>${pricing.subtotal.toFixed(2)}</span>
                        </div>
                        {pricing.discount > 0 && (
                          <div className="flex justify-between text-sm text-green-600">
                            <span>Discount ({selectedBundle.discountPercent}%):</span>
                            <span>-${pricing.discount.toFixed(2)}</span>
                          </div>
                        )}
                        <div className="flex justify-between font-semibold border-t pt-2">
                          <span>Final Price:</span>
                          <span>${pricing.final.toFixed(2)}</span>
                        </div>
                        {pricing.subtotal > 0 && (
                          <div className="text-sm text-green-600">
                            Customer saves: ${(pricing.subtotal - pricing.final).toFixed(2)} 
                            ({((1 - pricing.final / pricing.subtotal) * 100).toFixed(1)}%)
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <span className="font-medium">Bundle Items</span>
                      <Dialog open={addItemDialogOpen} onOpenChange={setAddItemDialogOpen}>
                        <DialogTrigger asChild>
                          <Button size="sm" data-testid="button-add-bundle-item">
                            <Plus className="h-4 w-4 mr-1" />
                            Add Item
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-md">
                          <DialogHeader>
                            <DialogTitle>Add Item to Bundle</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4 mt-4">
                            <div className="space-y-2">
                              <Label>Item Type</Label>
                              <Select
                                value={newItemData.itemType}
                                onValueChange={(v) => setNewItemData({
                                  ...newItemData,
                                  itemType: v as "service" | "lineItem",
                                  serviceId: "",
                                  lineItemId: "",
                                })}
                              >
                                <SelectTrigger data-testid="select-item-type">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="service">Service</SelectItem>
                                  <SelectItem value="lineItem">Line Item</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            {newItemData.itemType === "service" && (
                              <div className="space-y-2">
                                <Label>Service</Label>
                                <Select
                                  value={newItemData.serviceId}
                                  onValueChange={(v) => setNewItemData({ ...newItemData, serviceId: v })}
                                >
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
                              </div>
                            )}
                            {newItemData.itemType === "lineItem" && (
                              <div className="space-y-2">
                                <Label>Line Item</Label>
                                <Select
                                  value={newItemData.lineItemId}
                                  onValueChange={(v) => setNewItemData({ ...newItemData, lineItemId: v })}
                                >
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
                              </div>
                            )}
                            <div className="space-y-2">
                              <Label>Quantity</Label>
                              <Input
                                type="number"
                                min="1"
                                value={newItemData.quantity}
                                onChange={(e) => setNewItemData({ ...newItemData, quantity: e.target.value })}
                                data-testid="input-item-quantity"
                              />
                            </div>
                            <div className="flex justify-end gap-2 pt-4">
                              <Button
                                variant="outline"
                                onClick={() => setAddItemDialogOpen(false)}
                              >
                                Cancel
                              </Button>
                              <Button
                                onClick={handleAddItem}
                                disabled={addItemMutation.isPending}
                                data-testid="button-confirm-add-item"
                              >
                                {addItemMutation.isPending ? "Adding..." : "Add Item"}
                              </Button>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>

                    {bundleItems.length === 0 ? (
                      <p className="text-muted-foreground text-center py-4 text-sm">
                        No items in this bundle yet
                      </p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Item</TableHead>
                            <TableHead className="text-center">Qty</TableHead>
                            <TableHead className="text-right">Price</TableHead>
                            <TableHead className="w-10"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {bundleItems.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-xs">
                                    {item.serviceId ? "Service" : "Line Item"}
                                  </Badge>
                                  {getItemName(item)}
                                </div>
                              </TableCell>
                              <TableCell className="text-center">{item.quantity}</TableCell>
                              <TableCell className="text-right">
                                ${(getItemPrice(item) * item.quantity).toFixed(2)}
                              </TableCell>
                              <TableCell>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => removeItemMutation.mutate({
                                    bundleId: selectedBundle.id,
                                    itemId: item.id,
                                  })}
                                  data-testid={`button-remove-item-${item.id}`}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
