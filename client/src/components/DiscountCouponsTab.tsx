import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { Plus, Pencil, Trash2, Eye, RefreshCw, Loader2 } from "lucide-react";
import { format } from "date-fns";
import type { DiscountCoupon, Service, Bundle, User } from "@shared/schema";

const couponFormSchema = z.object({
  code: z.string().min(1, "Coupon code is required").max(50, "Code must be 50 characters or less"),
  isActive: z.boolean().default(true),
  discountType: z.enum(["amount", "percentage"]),
  discountValue: z.string().min(1, "Discount value is required"),
  serviceOption: z.string().default("all"),
  bundleOption: z.string().default("all"),
  maxUses: z.number().min(1, "Max uses must be at least 1").default(1),
  clientId: z.string().nullable().optional(),
  validFrom: z.string().nullable().optional(),
  validTo: z.string().nullable().optional(),
}).refine((data) => {
  return data.serviceOption !== "none" || data.bundleOption !== "none";
}, {
  message: "At least one of Ad-hoc Services or Bundles must be selected",
  path: ["serviceOption"],
});

type CouponFormData = z.infer<typeof couponFormSchema>;

function generateRandomCode(length: number = 8): string {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

export function DiscountCouponsTab() {
  const { toast } = useToast();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<DiscountCoupon | null>(null);
  const [viewingCoupon, setViewingCoupon] = useState<DiscountCoupon | null>(null);
  const [deletingCouponId, setDeletingCouponId] = useState<string | null>(null);

  const { data: coupons = [], isLoading } = useQuery<DiscountCoupon[]>({
    queryKey: ["/api/discount-coupons"],
  });

  const { data: services = [] } = useQuery<Service[]>({
    queryKey: ["/api/services"],
  });

  const { data: bundles = [] } = useQuery<Bundle[]>({
    queryKey: ["/api/bundles"],
  });

  const { data: clients = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const clientUsers = clients.filter(u => u.role === "client");

  const form = useForm<CouponFormData>({
    resolver: zodResolver(couponFormSchema),
    defaultValues: {
      code: "",
      isActive: true,
      discountType: "percentage",
      discountValue: "",
      serviceOption: "all",
      bundleOption: "all",
      maxUses: 1,
      clientId: null,
      validFrom: null,
      validTo: null,
    },
  });

  const discountType = form.watch("discountType");

  const createMutation = useMutation({
    mutationFn: async (data: CouponFormData) => {
      const isServiceNone = data.serviceOption === "none";
      const isServiceAll = data.serviceOption === "all";
      const isBundleNone = data.bundleOption === "none";
      const isBundleAll = data.bundleOption === "all";
      
      const payload = {
        code: data.code,
        isActive: data.isActive,
        discountType: data.discountType,
        discountValue: data.discountValue,
        appliesToServices: !isServiceNone,
        appliesToBundles: !isBundleNone,
        serviceId: (!isServiceNone && !isServiceAll) ? data.serviceOption : null,
        bundleId: (!isBundleNone && !isBundleAll) ? data.bundleOption : null,
        maxUses: data.maxUses,
        clientId: data.clientId || null,
        validFrom: data.validFrom ? new Date(data.validFrom).toISOString() : null,
        validTo: data.validTo ? new Date(data.validTo).toISOString() : null,
      };
      return apiRequest("POST", "/api/discount-coupons", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/discount-coupons"] });
      toast({ title: "Discount coupon created successfully" });
      setIsFormOpen(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: CouponFormData & { id: string }) => {
      const { id, ...formData } = data;
      const isServiceNone = formData.serviceOption === "none";
      const isServiceAll = formData.serviceOption === "all";
      const isBundleNone = formData.bundleOption === "none";
      const isBundleAll = formData.bundleOption === "all";
      
      return apiRequest("PATCH", `/api/discount-coupons/${id}`, {
        code: formData.code,
        isActive: formData.isActive,
        discountType: formData.discountType,
        discountValue: formData.discountValue,
        appliesToServices: !isServiceNone,
        appliesToBundles: !isBundleNone,
        serviceId: (!isServiceNone && !isServiceAll) ? formData.serviceOption : null,
        bundleId: (!isBundleNone && !isBundleAll) ? formData.bundleOption : null,
        maxUses: formData.maxUses,
        clientId: formData.clientId || null,
        validFrom: formData.validFrom ? new Date(formData.validFrom).toISOString() : null,
        validTo: formData.validTo ? new Date(formData.validTo).toISOString() : null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/discount-coupons"] });
      toast({ title: "Discount coupon updated successfully" });
      setIsFormOpen(false);
      setEditingCoupon(null);
      form.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/discount-coupons/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/discount-coupons"] });
      toast({ title: "Discount coupon deleted successfully" });
      setDeletingCouponId(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      return apiRequest("PATCH", `/api/discount-coupons/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/discount-coupons"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleEdit = (coupon: DiscountCoupon) => {
    setEditingCoupon(coupon);
    
    // Determine service option: none, all, or specific serviceId
    let serviceOption = "all";
    if (coupon.appliesToServices === false) {
      serviceOption = "none";
    } else if (coupon.serviceId) {
      serviceOption = coupon.serviceId;
    }
    
    // Determine bundle option: none, all, or specific bundleId
    let bundleOption = "all";
    if (coupon.appliesToBundles === false) {
      bundleOption = "none";
    } else if (coupon.bundleId) {
      bundleOption = coupon.bundleId;
    }
    
    form.reset({
      code: coupon.code,
      isActive: coupon.isActive,
      discountType: coupon.discountType as "amount" | "percentage",
      discountValue: coupon.discountValue,
      serviceOption,
      bundleOption,
      maxUses: coupon.maxUses,
      clientId: coupon.clientId,
      validFrom: coupon.validFrom ? new Date(coupon.validFrom).toISOString().split("T")[0] : null,
      validTo: coupon.validTo ? new Date(coupon.validTo).toISOString().split("T")[0] : null,
    });
    setIsFormOpen(true);
  };

  const handleCreate = () => {
    setEditingCoupon(null);
    form.reset({
      code: "",
      isActive: true,
      discountType: "percentage",
      discountValue: "",
      serviceOption: "all",
      bundleOption: "all",
      maxUses: 1,
      clientId: null,
      validFrom: null,
      validTo: null,
    });
    setIsFormOpen(true);
  };

  const handleGenerateCode = () => {
    form.setValue("code", generateRandomCode());
  };

  const onSubmit = (data: CouponFormData) => {
    if (editingCoupon) {
      updateMutation.mutate({ ...data, id: editingCoupon.id });
    } else {
      createMutation.mutate(data);
    }
  };

  const getServiceName = (serviceId: string | null) => {
    if (!serviceId) return "All Services";
    const service = services.find(s => s.id === serviceId);
    return service?.title || "Unknown";
  };

  const getBundleName = (bundleId: string | null) => {
    if (!bundleId) return "All Bundles";
    const bundle = bundles.find(b => b.id === bundleId);
    return bundle?.name || "Unknown";
  };

  const getClientName = (clientId: string | null) => {
    if (!clientId) return "Any Client";
    const client = clientUsers.find(u => u.id === clientId);
    return client?.username || "Unknown";
  };

  const formatDiscountValue = (coupon: DiscountCoupon) => {
    if (coupon.discountType === "percentage") {
      return `${coupon.discountValue}%`;
    }
    return `$${parseFloat(coupon.discountValue).toFixed(2)}`;
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-sky-blue-accent" />
          <p className="mt-2 text-dark-gray">Loading discount coupons...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
          <div>
            <CardTitle>Discount Coupons</CardTitle>
            <CardDescription>Manage promotional discount codes for services and bundles</CardDescription>
          </div>
          <Button onClick={handleCreate} data-testid="button-create-coupon">
            <Plus className="h-4 w-4 mr-2" />
            Create Coupon
          </Button>
        </CardHeader>
        <CardContent>
          {coupons.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-dark-gray">No discount coupons created yet.</p>
              <Button variant="outline" className="mt-4" onClick={handleCreate}>
                Create your first coupon
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Applies To</TableHead>
                    <TableHead>Usage</TableHead>
                    <TableHead>Valid Dates</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {coupons.map((coupon) => (
                    <TableRow key={coupon.id} data-testid={`row-coupon-${coupon.id}`}>
                      <TableCell>
                        <Switch
                          checked={coupon.isActive}
                          onCheckedChange={(checked) => toggleStatusMutation.mutate({ id: coupon.id, isActive: checked })}
                          disabled={toggleStatusMutation.isPending}
                          data-testid={`switch-coupon-status-${coupon.id}`}
                        />
                      </TableCell>
                      <TableCell>
                        <code className="px-2 py-1 bg-muted rounded text-sm font-mono">
                          {coupon.code}
                        </code>
                      </TableCell>
                      <TableCell className="capitalize">{coupon.discountType}</TableCell>
                      <TableCell>{formatDiscountValue(coupon)}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {coupon.appliesToServices !== false && (
                            <Badge variant="outline">
                              {coupon.serviceId ? getServiceName(coupon.serviceId) : "All Services"}
                            </Badge>
                          )}
                          {coupon.appliesToBundles !== false && (
                            <Badge variant="outline">
                              {coupon.bundleId ? getBundleName(coupon.bundleId) : "All Bundles"}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={coupon.currentUses >= coupon.maxUses ? "text-red-500 font-medium" : ""}>
                          {coupon.currentUses}/{coupon.maxUses}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs">
                          {coupon.validFrom ? (
                            <span>{format(new Date(coupon.validFrom), "MMM d, yyyy")}</span>
                          ) : (
                            <span className="text-dark-gray">No start</span>
                          )}
                          {" - "}
                          {coupon.validTo ? (
                            <span>{format(new Date(coupon.validTo), "MMM d, yyyy")}</span>
                          ) : (
                            <span className="text-dark-gray">No end</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{getClientName(coupon.clientId)}</span>
                      </TableCell>
                      <TableCell className="text-xs text-dark-gray">
                        {format(new Date(coupon.createdAt), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setViewingCoupon(coupon)}
                            data-testid={`button-view-coupon-${coupon.id}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleEdit(coupon)}
                            data-testid={`button-edit-coupon-${coupon.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-red-500 hover:text-red-600"
                            onClick={() => setDeletingCouponId(coupon.id)}
                            data-testid={`button-delete-coupon-${coupon.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingCoupon ? "Edit Discount Coupon" : "Create Discount Coupon"}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Coupon Code</FormLabel>
                    <div className="flex gap-2">
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="CHRISTMAS2025"
                          className="flex-1 uppercase"
                          data-testid="input-coupon-code"
                        />
                      </FormControl>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleGenerateCode}
                        data-testid="button-generate-code"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <FormLabel>Active</FormLabel>
                      <p className="text-xs text-dark-gray">Enable or disable this coupon</p>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-coupon-active"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="discountType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Discount Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-discount-type">
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="percentage">Percentage</SelectItem>
                          <SelectItem value="amount">Fixed Amount</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="discountValue"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {discountType === "percentage" ? "Percentage (%)" : "Amount ($)"}
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          step={discountType === "percentage" ? "1" : "0.01"}
                          min="0"
                          max={discountType === "percentage" ? "100" : undefined}
                          placeholder={discountType === "percentage" ? "10" : "5.00"}
                          data-testid="input-discount-value"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="serviceOption"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ad-hoc Services</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-service-option">
                            <SelectValue placeholder="Select option" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          <SelectItem value="all">All Services</SelectItem>
                          {services.map((service) => (
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
                  name="bundleOption"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bundles</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-bundle-option">
                            <SelectValue placeholder="Select option" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          <SelectItem value="all">All Bundles</SelectItem>
                          {bundles.map((bundle) => (
                            <SelectItem key={bundle.id} value={bundle.id}>
                              {bundle.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="maxUses"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max Uses</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        min="1"
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                        data-testid="input-max-uses"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="clientId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Client Restriction (Optional)</FormLabel>
                    <Select
                      onValueChange={(value) => field.onChange(value === "any" ? null : value)}
                      value={field.value || "any"}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-client">
                          <SelectValue placeholder="Any Client" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="any">Any Client</SelectItem>
                        {clientUsers.map((client) => (
                          <SelectItem key={client.id} value={client.id}>
                            {client.username}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="validFrom"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Valid From</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          {...field}
                          value={field.value || ""}
                          onChange={(e) => field.onChange(e.target.value || null)}
                          data-testid="input-valid-from"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="validTo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Valid To</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          {...field}
                          value={field.value || ""}
                          onChange={(e) => field.onChange(e.target.value || null)}
                          data-testid="input-valid-to"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsFormOpen(false);
                    setEditingCoupon(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-save-coupon"
                >
                  {(createMutation.isPending || updateMutation.isPending) && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  {editingCoupon ? "Update" : "Create"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewingCoupon} onOpenChange={() => setViewingCoupon(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Coupon Details</DialogTitle>
          </DialogHeader>
          {viewingCoupon && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-dark-gray">Code</span>
                <code className="px-2 py-1 bg-muted rounded font-mono">{viewingCoupon.code}</code>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-dark-gray">Status</span>
                <Badge variant={viewingCoupon.isActive ? "default" : "secondary"}>
                  {viewingCoupon.isActive ? "Active" : "Inactive"}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-dark-gray">Discount</span>
                <span className="font-medium">{formatDiscountValue(viewingCoupon)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-dark-gray">Usage</span>
                <span>{viewingCoupon.currentUses}/{viewingCoupon.maxUses}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-dark-gray">Applies To</span>
                <div className="flex flex-col gap-1 items-end">
                  {viewingCoupon.appliesToServices !== false && (
                    <Badge variant="outline">
                      {viewingCoupon.serviceId ? getServiceName(viewingCoupon.serviceId) : "All Services"}
                    </Badge>
                  )}
                  {viewingCoupon.appliesToBundles !== false && (
                    <Badge variant="outline">
                      {viewingCoupon.bundleId ? getBundleName(viewingCoupon.bundleId) : "All Bundles"}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-dark-gray">Client</span>
                <span>{getClientName(viewingCoupon.clientId)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-dark-gray">Valid From</span>
                <span>
                  {viewingCoupon.validFrom
                    ? format(new Date(viewingCoupon.validFrom), "MMM d, yyyy")
                    : "No restriction"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-dark-gray">Valid To</span>
                <span>
                  {viewingCoupon.validTo
                    ? format(new Date(viewingCoupon.validTo), "MMM d, yyyy")
                    : "No restriction"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-dark-gray">Created</span>
                <span>{format(new Date(viewingCoupon.createdAt), "MMM d, yyyy")}</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingCouponId} onOpenChange={() => setDeletingCouponId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Discount Coupon?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The coupon will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 hover:bg-red-600"
              onClick={() => deletingCouponId && deleteMutation.mutate(deletingCouponId)}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
