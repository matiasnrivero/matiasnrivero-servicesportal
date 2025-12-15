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
import { CalendarRange, Plus, Pencil, Trash2 } from "lucide-react";
import type { ServicePack, ServicePackItem, Service, User } from "@shared/schema";

async function getDefaultUser(): Promise<User | null> {
  const res = await fetch("/api/default-user");
  if (!res.ok) return null;
  return res.json();
}

export default function AdminServicePacks() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [addItemDialogOpen, setAddItemDialogOpen] = useState(false);
  const [editingPack, setEditingPack] = useState<ServicePack | null>(null);
  const [selectedPack, setSelectedPack] = useState<ServicePack | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    price: "",
    isActive: true,
  });
  const [newItemData, setNewItemData] = useState({
    serviceId: "",
    quantity: "1",
  });

  const { data: currentUser } = useQuery<User | null>({
    queryKey: ["/api/default-user"],
    queryFn: getDefaultUser,
  });

  const { data: servicePacks = [], isLoading } = useQuery<ServicePack[]>({
    queryKey: ["/api/service-packs"],
  });

  const { data: services = [] } = useQuery<Service[]>({
    queryKey: ["/api/services"],
  });

  const { data: packItems = [] } = useQuery<ServicePackItem[]>({
    queryKey: ["/api/service-packs", selectedPack?.id, "items"],
    queryFn: async () => {
      if (!selectedPack) return [];
      const res = await fetch(`/api/service-packs/${selectedPack.id}/items`);
      if (!res.ok) throw new Error("Failed to fetch pack items");
      return res.json();
    },
    enabled: !!selectedPack,
  });

  const createPackMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return apiRequest("POST", "/api/service-packs", {
        name: data.name,
        description: data.description || null,
        price: data.price,
        isActive: data.isActive,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-packs"] });
      closeDialog();
      toast({ title: "Service pack created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updatePackMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<typeof formData> }) => {
      return apiRequest("PATCH", `/api/service-packs/${id}`, {
        name: data.name,
        description: data.description || null,
        price: data.price,
        isActive: data.isActive,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-packs"] });
      closeDialog();
      toast({ title: "Service pack updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const addItemMutation = useMutation({
    mutationFn: async ({ packId, data }: { packId: string; data: typeof newItemData }) => {
      return apiRequest("POST", `/api/service-packs/${packId}/items`, {
        serviceId: data.serviceId,
        quantity: parseInt(data.quantity) || 1,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-packs", selectedPack?.id, "items"] });
      setAddItemDialogOpen(false);
      setNewItemData({ serviceId: "", quantity: "1" });
      toast({ title: "Service added to pack" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const removeItemMutation = useMutation({
    mutationFn: async ({ packId, itemId }: { packId: string; itemId: string }) => {
      return apiRequest("DELETE", `/api/service-packs/${packId}/items/${itemId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-packs", selectedPack?.id, "items"] });
      toast({ title: "Service removed from pack" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingPack(null);
    setFormData({ name: "", description: "", price: "", isActive: true });
  };

  const openCreateDialog = () => {
    setEditingPack(null);
    setFormData({ name: "", description: "", price: "", isActive: true });
    setDialogOpen(true);
  };

  const openEditDialog = (pack: ServicePack) => {
    setEditingPack(pack);
    setFormData({
      name: pack.name,
      description: pack.description || "",
      price: pack.price,
      isActive: pack.isActive,
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.name || !formData.price) {
      toast({ title: "Please fill in required fields", variant: "destructive" });
      return;
    }

    const priceNum = parseFloat(formData.price);
    if (isNaN(priceNum) || priceNum < 0) {
      toast({ title: "Please enter a valid price", variant: "destructive" });
      return;
    }

    if (editingPack) {
      updatePackMutation.mutate({ id: editingPack.id, data: formData });
    } else {
      createPackMutation.mutate(formData);
    }
  };

  const handleAddItem = () => {
    if (!selectedPack) return;
    if (!newItemData.serviceId) {
      toast({ title: "Please select a service", variant: "destructive" });
      return;
    }
    addItemMutation.mutate({ packId: selectedPack.id, data: newItemData });
  };

  const getServiceName = (serviceId: string): string => {
    return services.find(s => s.id === serviceId)?.title || "Unknown Service";
  };

  const calculateTotalServiceValue = (): number => {
    let total = 0;
    for (const item of packItems) {
      const service = services.find(s => s.id === item.serviceId);
      if (service) {
        total += parseFloat(service.basePrice) * item.quantity;
      }
    }
    return total;
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

  const totalServiceValue = selectedPack ? calculateTotalServiceValue() : 0;
  const packPrice = selectedPack ? parseFloat(selectedPack.price) : 0;
  const savings = totalServiceValue > 0 ? totalServiceValue - packPrice : 0;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="p-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <CalendarRange className="h-8 w-8 text-primary" />
              <h1 className="font-semibold text-foreground text-2xl">
                Monthly Service Packs
              </h1>
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={openCreateDialog} data-testid="button-create-pack">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Pack
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>
                    {editingPack ? "Edit Service Pack" : "Create Service Pack"}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label>Name<span className="text-destructive">*</span></Label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Enter pack name"
                      data-testid="input-pack-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Enter description (optional)"
                      data-testid="input-pack-description"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Monthly Price<span className="text-destructive">*</span></Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      placeholder="0.00"
                      data-testid="input-pack-price"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      id="packActive"
                      checked={formData.isActive}
                      onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                      data-testid="switch-pack-active"
                    />
                    <Label htmlFor="packActive">Active</Label>
                  </div>
                  <div className="flex justify-end gap-2 pt-4">
                    <Button
                      variant="outline"
                      onClick={closeDialog}
                      data-testid="button-cancel-pack"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleSubmit}
                      disabled={createPackMutation.isPending || updatePackMutation.isPending}
                      data-testid="button-save-pack"
                    >
                      {(createPackMutation.isPending || updatePackMutation.isPending)
                        ? "Saving..."
                        : editingPack ? "Update" : "Create"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Service Packs ({servicePacks.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {servicePacks.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    No service packs yet. Create your first one above.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {servicePacks.map((pack) => (
                      <div
                        key={pack.id}
                        className={`flex items-center justify-between p-3 border rounded-md cursor-pointer hover-elevate ${
                          selectedPack?.id === pack.id ? "border-primary bg-muted/50" : ""
                        }`}
                        onClick={() => setSelectedPack(pack)}
                        data-testid={`row-pack-${pack.id}`}
                      >
                        <div className="flex items-center gap-3">
                          <div>
                            <p className="font-medium">{pack.name}</p>
                            <p className="text-sm text-muted-foreground">
                              ${parseFloat(pack.price).toFixed(2)}/month
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={pack.isActive ? "default" : "secondary"}>
                            {pack.isActive ? "Active" : "Inactive"}
                          </Badge>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditDialog(pack);
                            }}
                            data-testid={`button-edit-pack-${pack.id}`}
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
                  {selectedPack ? selectedPack.name : "Pack Details"}
                </CardTitle>
                {selectedPack && (
                  <CardDescription>
                    Configure monthly service allocations for this pack
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent>
                {!selectedPack ? (
                  <p className="text-muted-foreground text-center py-8">
                    Select a pack from the list to configure services
                  </p>
                ) : (
                  <div className="space-y-6">
                    {packItems.length > 0 && (
                      <div className="p-4 bg-muted/50 rounded-md space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Individual Service Value:</span>
                          <span>${totalServiceValue.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between font-semibold">
                          <span>Pack Price:</span>
                          <span>${packPrice.toFixed(2)}/month</span>
                        </div>
                        {savings > 0 && (
                          <div className="text-sm text-green-600">
                            Customer saves: ${savings.toFixed(2)} 
                            ({((savings / totalServiceValue) * 100).toFixed(1)}%)
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <span className="font-medium">Included Services</span>
                      <Dialog open={addItemDialogOpen} onOpenChange={setAddItemDialogOpen}>
                        <DialogTrigger asChild>
                          <Button size="sm" data-testid="button-add-pack-item">
                            <Plus className="h-4 w-4 mr-1" />
                            Add Service
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-md">
                          <DialogHeader>
                            <DialogTitle>Add Service to Pack</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4 mt-4">
                            <div className="space-y-2">
                              <Label>Service</Label>
                              <Select
                                value={newItemData.serviceId}
                                onValueChange={(v) => setNewItemData({ ...newItemData, serviceId: v })}
                              >
                                <SelectTrigger data-testid="select-pack-service">
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
                            <div className="space-y-2">
                              <Label>Monthly Quantity</Label>
                              <Input
                                type="number"
                                min="1"
                                value={newItemData.quantity}
                                onChange={(e) => setNewItemData({ ...newItemData, quantity: e.target.value })}
                                data-testid="input-pack-item-quantity"
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
                                data-testid="button-confirm-add-pack-item"
                              >
                                {addItemMutation.isPending ? "Adding..." : "Add Service"}
                              </Button>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>

                    {packItems.length === 0 ? (
                      <p className="text-muted-foreground text-center py-4 text-sm">
                        No services in this pack yet
                      </p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Service</TableHead>
                            <TableHead className="text-center">Monthly Qty</TableHead>
                            <TableHead className="text-right">Value</TableHead>
                            <TableHead className="w-10"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {packItems.map((item) => {
                            const service = services.find(s => s.id === item.serviceId);
                            const itemValue = service ? parseFloat(service.basePrice) * item.quantity : 0;
                            return (
                              <TableRow key={item.id}>
                                <TableCell className="font-medium">
                                  {getServiceName(item.serviceId)}
                                </TableCell>
                                <TableCell className="text-center">{item.quantity}</TableCell>
                                <TableCell className="text-right">
                                  ${itemValue.toFixed(2)}
                                </TableCell>
                                <TableCell>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => removeItemMutation.mutate({
                                      packId: selectedPack.id,
                                      itemId: item.id,
                                    })}
                                    data-testid={`button-remove-pack-item-${item.id}`}
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
