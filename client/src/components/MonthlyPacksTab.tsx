import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
  FormDescription,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Package, Loader2, X } from "lucide-react";
import type { Service } from "@shared/schema";

interface MonthlyPackService {
  id: string;
  packId: string;
  serviceId: string;
  includedQuantity: number;
}

interface MonthlyPack {
  id: string;
  name: string;
  description: string | null;
  price: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  services?: MonthlyPackService[];
}

const packServiceSchema = z.object({
  serviceId: z.string().min(1, "Service is required"),
  includedQuantity: z.number().min(1, "Quantity must be at least 1"),
});

const monthlyPackFormSchema = z.object({
  name: z.string().min(1, "Pack name is required").max(100, "Name must be 100 characters or less"),
  description: z.string().nullable().optional(),
  price: z.string().min(1, "Price is required"),
  isActive: z.boolean().default(true),
  services: z.array(packServiceSchema).min(1, "At least one service is required"),
});

type MonthlyPackFormData = z.infer<typeof monthlyPackFormSchema>;

export function MonthlyPacksTab() {
  const { toast } = useToast();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPack, setEditingPack] = useState<MonthlyPack | null>(null);
  const [deletingPackId, setDeletingPackId] = useState<string | null>(null);

  const { data: packs = [], isLoading } = useQuery<MonthlyPack[]>({
    queryKey: ["/api/monthly-packs"],
  });

  const { data: services = [] } = useQuery<Service[]>({
    queryKey: ["/api/services"],
  });

  const fatherServices = services.filter(s => !s.parentServiceId && s.isActive);

  const form = useForm<MonthlyPackFormData>({
    resolver: zodResolver(monthlyPackFormSchema),
    defaultValues: {
      name: "",
      description: "",
      price: "",
      isActive: true,
      services: [{ serviceId: "", includedQuantity: 1 }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "services",
  });

  const createMutation = useMutation({
    mutationFn: async (data: MonthlyPackFormData) => {
      return apiRequest("POST", "/api/monthly-packs", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/monthly-packs"] });
      toast({ title: "Monthly pack created successfully" });
      handleCloseForm();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: MonthlyPackFormData }) => {
      return apiRequest("PATCH", `/api/monthly-packs/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/monthly-packs"] });
      toast({ title: "Monthly pack updated successfully" });
      handleCloseForm();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/monthly-packs/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/monthly-packs"] });
      toast({ title: "Monthly pack deleted successfully" });
      setDeletingPackId(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      return apiRequest("PATCH", `/api/monthly-packs/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/monthly-packs"] });
      toast({ title: "Pack status updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleOpenForm = (pack?: MonthlyPack) => {
    if (pack) {
      setEditingPack(pack);
      form.reset({
        name: pack.name,
        description: pack.description || "",
        price: pack.price,
        isActive: pack.isActive,
        services: pack.services?.map(s => ({
          serviceId: s.serviceId,
          includedQuantity: s.includedQuantity,
        })) || [{ serviceId: "", includedQuantity: 1 }],
      });
    } else {
      setEditingPack(null);
      form.reset({
        name: "",
        description: "",
        price: "",
        isActive: true,
        services: [{ serviceId: "", includedQuantity: 1 }],
      });
    }
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingPack(null);
    form.reset();
  };

  const onSubmit = (data: MonthlyPackFormData) => {
    if (editingPack) {
      updateMutation.mutate({ id: editingPack.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const getServiceName = (serviceId: string) => {
    const service = services.find(s => s.id === serviceId);
    return service?.title || "Unknown Service";
  };

  const calculatePerUnitPrice = (pack: MonthlyPack) => {
    if (!pack.services || pack.services.length === 0) return 0;
    const totalQuantity = pack.services.reduce((sum, s) => sum + s.includedQuantity, 0);
    if (totalQuantity === 0) return 0;
    return parseFloat(pack.price) / totalQuantity;
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
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Monthly Packs ({packs.length})
            </CardTitle>
            <CardDescription>
              Create subscription packs with included service quantities per month
            </CardDescription>
          </div>
          <Button onClick={() => handleOpenForm()} data-testid="button-create-monthly-pack">
            <Plus className="h-4 w-4 mr-2" />
            Create Monthly Pack
          </Button>
        </CardHeader>
        <CardContent>
          {packs.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No monthly packs yet. Create your first one above.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">Status</TableHead>
                  <TableHead>Pack Name</TableHead>
                  <TableHead>Included Services</TableHead>
                  <TableHead className="text-right">Monthly Price</TableHead>
                  <TableHead className="text-right">Per-Unit Price</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {packs.map((pack) => (
                  <TableRow key={pack.id} data-testid={`row-monthly-pack-${pack.id}`}>
                    <TableCell>
                      <Switch
                        checked={pack.isActive}
                        onCheckedChange={(checked) =>
                          toggleActiveMutation.mutate({ id: pack.id, isActive: checked })
                        }
                        disabled={toggleActiveMutation.isPending}
                        data-testid={`switch-monthly-pack-status-${pack.id}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{pack.name}</div>
                      {pack.description && (
                        <div className="text-sm text-muted-foreground truncate max-w-[250px]">
                          {pack.description}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {pack.services?.slice(0, 3).map((s) => (
                          <Badge key={s.id} variant="secondary" className="text-xs">
                            {getServiceName(s.serviceId)} x{s.includedQuantity}
                          </Badge>
                        ))}
                        {(pack.services?.length ?? 0) > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{(pack.services?.length ?? 0) - 3} more
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      ${parseFloat(pack.price).toFixed(2)}/mo
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      ${calculatePerUnitPrice(pack).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleOpenForm(pack)}
                          data-testid={`button-edit-monthly-pack-${pack.id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setDeletingPackId(pack.id)}
                          data-testid={`button-delete-monthly-pack-${pack.id}`}
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
        </CardContent>
      </Card>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingPack ? "Edit Monthly Pack" : "Create Monthly Pack"}
            </DialogTitle>
            <DialogDescription>
              Define a subscription pack with included service quantities per month.
              Unused quantities don't roll over.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Pack Name</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="e.g., Basic Monthly Pack"
                        data-testid="input-monthly-pack-name"
                      />
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
                    <FormLabel>Description (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        value={field.value || ""}
                        placeholder="Describe what's included in this pack..."
                        data-testid="input-monthly-pack-description"
                      />
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
                    <FormLabel>Monthly Price ($)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="e.g., 500.00"
                        data-testid="input-monthly-pack-price"
                      />
                    </FormControl>
                    <FormDescription>
                      Overage jobs will be charged at: Pack Price / Total Included Quantity
                    </FormDescription>
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
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-monthly-pack-active"
                      />
                    </FormControl>
                    <FormLabel className="!mt-0">Active</FormLabel>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <FormLabel>Included Services</FormLabel>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => append({ serviceId: "", includedQuantity: 1 })}
                    data-testid="button-add-pack-service"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Service
                  </Button>
                </div>

                {fields.map((field, index) => (
                  <div key={field.id} className="flex gap-2 items-start">
                    <FormField
                      control={form.control}
                      name={`services.${index}.serviceId`}
                      render={({ field: selectField }) => (
                        <FormItem className="flex-1">
                          <Select
                            value={selectField.value}
                            onValueChange={selectField.onChange}
                          >
                            <FormControl>
                              <SelectTrigger data-testid={`select-pack-service-${index}`}>
                                <SelectValue placeholder="Select a service" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {fatherServices.map((service) => (
                                <SelectItem key={service.id} value={service.id}>
                                  {service.title}
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
                      name={`services.${index}.includedQuantity`}
                      render={({ field: qtyField }) => (
                        <FormItem className="w-24">
                          <FormControl>
                            <Input
                              {...qtyField}
                              type="number"
                              min="1"
                              onChange={(e) => qtyField.onChange(parseInt(e.target.value) || 1)}
                              placeholder="Qty"
                              data-testid={`input-pack-service-qty-${index}`}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {fields.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => remove(index)}
                        data-testid={`button-remove-pack-service-${index}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
                {form.formState.errors.services?.message && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.services.message}
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCloseForm}
                  data-testid="button-cancel-monthly-pack"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-save-monthly-pack"
                >
                  {(createMutation.isPending || updateMutation.isPending) && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  {editingPack ? "Update Pack" : "Create Pack"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingPackId} onOpenChange={() => setDeletingPackId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Monthly Pack</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this monthly pack? This action cannot be undone.
              Existing subscriptions using this pack will continue until cancelled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-monthly-pack">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingPackId && deleteMutation.mutate(deletingPackId)}
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete-monthly-pack"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
