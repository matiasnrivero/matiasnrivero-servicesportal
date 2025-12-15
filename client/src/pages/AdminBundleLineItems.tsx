import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Package, Plus, Pencil } from "lucide-react";
import type { BundleLineItem, User } from "@shared/schema";

async function getDefaultUser(): Promise<User | null> {
  const res = await fetch("/api/default-user");
  if (!res.ok) return null;
  return res.json();
}

export default function AdminBundleLineItems() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<BundleLineItem | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    price: "",
    isActive: true,
  });

  const { data: currentUser } = useQuery<User | null>({
    queryKey: ["/api/default-user"],
    queryFn: getDefaultUser,
  });

  const { data: lineItems = [], isLoading } = useQuery<BundleLineItem[]>({
    queryKey: ["/api/bundle-line-items"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return apiRequest("POST", "/api/bundle-line-items", {
        name: data.name,
        description: data.description || null,
        price: data.price,
        isActive: data.isActive,
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
    mutationFn: async ({ id, data }: { id: string; data: Partial<typeof formData> }) => {
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
    setFormData({ name: "", description: "", price: "", isActive: true });
  };

  const openCreateDialog = () => {
    setEditingItem(null);
    setFormData({ name: "", description: "", price: "", isActive: true });
    setDialogOpen(true);
  };

  const openEditDialog = (item: BundleLineItem) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      description: item.description || "",
      price: item.price,
      isActive: item.isActive,
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

    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
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

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="p-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <Package className="h-8 w-8 text-primary" />
              <h1 className="font-semibold text-foreground text-2xl">
                Bundle Line Items
              </h1>
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={openCreateDialog} data-testid="button-add-line-item">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Line Item
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>
                    {editingItem ? "Edit Line Item" : "Create Line Item"}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label>Name<span className="text-destructive">*</span></Label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Enter line item name"
                      data-testid="input-line-item-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Enter description (optional)"
                      data-testid="input-line-item-description"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Price<span className="text-destructive">*</span></Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      placeholder="0.00"
                      data-testid="input-line-item-price"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      id="isActive"
                      checked={formData.isActive}
                      onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                      data-testid="switch-line-item-active"
                    />
                    <Label htmlFor="isActive">Active</Label>
                  </div>
                  <div className="flex justify-end gap-2 pt-4">
                    <Button
                      variant="outline"
                      onClick={closeDialog}
                      data-testid="button-cancel-line-item"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleSubmit}
                      disabled={createMutation.isPending || updateMutation.isPending}
                      data-testid="button-save-line-item"
                    >
                      {(createMutation.isPending || updateMutation.isPending)
                        ? "Saving..."
                        : editingItem ? "Update" : "Create"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Line Items ({lineItems.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {lineItems.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No line items found. Create your first one above.
                </p>
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
                        <TableCell className="text-muted-foreground max-w-xs truncate">
                          {item.description || "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          ${parseFloat(item.price).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-2">
                            <Switch
                              checked={item.isActive}
                              onCheckedChange={(checked) =>
                                toggleActiveMutation.mutate({ id: item.id, isActive: checked })
                              }
                              data-testid={`switch-active-${item.id}`}
                            />
                            <Badge variant={item.isActive ? "default" : "secondary"}>
                              {item.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => openEditDialog(item)}
                            data-testid={`button-edit-${item.id}`}
                          >
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
        </div>
      </div>
    </div>
  );
}
