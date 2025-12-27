import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
import { Plus, Pencil, Trash2, Zap, Users, Building2, Loader2 } from "lucide-react";
import type { AutomationRule, Service, User, VendorProfile } from "@shared/schema";

export function AutomationSettingsTab() {
  const { toast } = useToast();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    isActive: true,
    priority: 0,
    serviceIds: [] as string[],
    routingTarget: "vendor_only" as string,
    routingStrategy: "least_loaded" as string,
    allowedVendorIds: [] as string[],
    excludedVendorIds: [] as string[],
    fallbackAction: "leave_pending" as string,
  });

  const { data: rules = [], isLoading: rulesLoading } = useQuery<AutomationRule[]>({
    queryKey: ["/api/automation-rules"],
  });

  const { data: services = [] } = useQuery<Service[]>({
    queryKey: ["/api/services"],
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const { data: vendorProfiles = [] } = useQuery<VendorProfile[]>({
    queryKey: ["/api/vendor-profiles"],
  });

  const vendors = users.filter(u => u.role === "vendor" && u.isActive);

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return apiRequest("POST", "/api/automation-rules", {
        ...data,
        scope: "global",
        serviceIds: data.serviceIds.length > 0 ? data.serviceIds : null,
        allowedVendorIds: data.allowedVendorIds.length > 0 ? data.allowedVendorIds : null,
        excludedVendorIds: data.excludedVendorIds.length > 0 ? data.excludedVendorIds : null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/automation-rules"] });
      toast({ title: "Automation rule created" });
      setCreateDialogOpen(false);
      resetForm();
    },
    onError: () => {
      toast({ title: "Failed to create rule", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<typeof formData> }) => {
      return apiRequest("PATCH", `/api/automation-rules/${id}`, {
        ...data,
        serviceIds: data.serviceIds && data.serviceIds.length > 0 ? data.serviceIds : null,
        allowedVendorIds: data.allowedVendorIds && data.allowedVendorIds.length > 0 ? data.allowedVendorIds : null,
        excludedVendorIds: data.excludedVendorIds && data.excludedVendorIds.length > 0 ? data.excludedVendorIds : null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/automation-rules"] });
      toast({ title: "Automation rule updated" });
      setEditingRule(null);
      resetForm();
    },
    onError: () => {
      toast({ title: "Failed to update rule", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/automation-rules/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/automation-rules"] });
      toast({ title: "Automation rule deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete rule", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      isActive: true,
      priority: 0,
      serviceIds: [],
      routingTarget: "vendor_only",
      routingStrategy: "least_loaded",
      allowedVendorIds: [],
      excludedVendorIds: [],
      fallbackAction: "leave_pending",
    });
  };

  const openEditDialog = (rule: AutomationRule) => {
    setEditingRule(rule);
    setFormData({
      name: rule.name,
      isActive: rule.isActive,
      priority: rule.priority || 0,
      serviceIds: (rule.serviceIds as string[]) || [],
      routingTarget: rule.routingTarget,
      routingStrategy: rule.routingStrategy,
      allowedVendorIds: (rule.allowedVendorIds as string[]) || [],
      excludedVendorIds: (rule.excludedVendorIds as string[]) || [],
      fallbackAction: rule.fallbackAction,
    });
  };

  const handleSubmit = () => {
    if (editingRule) {
      updateMutation.mutate({ id: editingRule.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const toggleService = (serviceId: string) => {
    setFormData(prev => ({
      ...prev,
      serviceIds: prev.serviceIds.includes(serviceId)
        ? prev.serviceIds.filter(id => id !== serviceId)
        : [...prev.serviceIds, serviceId],
    }));
  };

  const toggleVendor = (vendorId: string, field: "allowedVendorIds" | "excludedVendorIds") => {
    setFormData(prev => ({
      ...prev,
      [field]: prev[field].includes(vendorId)
        ? prev[field].filter(id => id !== vendorId)
        : [...prev[field], vendorId],
    }));
  };

  const globalRules = rules.filter(r => r.scope === "global");

  const getVendorName = (vendorId: string) => {
    const vendor = vendors.find(v => v.id === vendorId);
    if (!vendor) return vendorId;
    const profile = vendorProfiles.find(p => p.userId === vendorId);
    return profile?.companyName || vendor.username;
  };

  const RuleFormContent = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Rule Name</Label>
        <Input
          value={formData.name}
          onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
          placeholder="e.g., Default Logo Assignment"
          data-testid="input-rule-name"
        />
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Switch
            checked={formData.isActive}
            onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isActive: checked }))}
            data-testid="switch-rule-active"
          />
          <Label>Active</Label>
        </div>
        <div className="flex items-center gap-2">
          <Label>Priority</Label>
          <Input
            type="number"
            value={formData.priority}
            onChange={(e) => setFormData(prev => ({ ...prev, priority: parseInt(e.target.value) || 0 }))}
            className="w-20"
            data-testid="input-rule-priority"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Applies to Services (leave empty for all)</Label>
        <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 border rounded-md">
          {services.filter(s => !s.parentServiceId).map(service => (
            <Badge
              key={service.id}
              variant={formData.serviceIds.includes(service.id) ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => toggleService(service.id)}
              data-testid={`badge-service-${service.id}`}
            >
              {service.title}
            </Badge>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Routing Target</Label>
          <Select
            value={formData.routingTarget}
            onValueChange={(value) => setFormData(prev => ({ ...prev, routingTarget: value }))}
          >
            <SelectTrigger data-testid="select-routing-target">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="vendor_only">Vendor Only</SelectItem>
              <SelectItem value="vendor_then_designer">Vendor + Designer</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Routing Strategy</Label>
          <Select
            value={formData.routingStrategy}
            onValueChange={(value) => setFormData(prev => ({ ...prev, routingStrategy: value }))}
          >
            <SelectTrigger data-testid="select-routing-strategy">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="least_loaded">Least Loaded</SelectItem>
              <SelectItem value="round_robin">Round Robin</SelectItem>
              <SelectItem value="priority_first">Priority First</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Allowed Vendors (leave empty for all)</Label>
        <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto p-2 border rounded-md">
          {vendors.map(vendor => (
            <Badge
              key={vendor.id}
              variant={formData.allowedVendorIds.includes(vendor.id) ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => toggleVendor(vendor.id, "allowedVendorIds")}
              data-testid={`badge-allowed-vendor-${vendor.id}`}
            >
              {getVendorName(vendor.id)}
            </Badge>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Excluded Vendors</Label>
        <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto p-2 border rounded-md">
          {vendors.map(vendor => (
            <Badge
              key={vendor.id}
              variant={formData.excludedVendorIds.includes(vendor.id) ? "destructive" : "outline"}
              className="cursor-pointer"
              onClick={() => toggleVendor(vendor.id, "excludedVendorIds")}
              data-testid={`badge-excluded-vendor-${vendor.id}`}
            >
              {getVendorName(vendor.id)}
            </Badge>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Fallback Action</Label>
        <Select
          value={formData.fallbackAction}
          onValueChange={(value) => setFormData(prev => ({ ...prev, fallbackAction: value }))}
        >
          <SelectTrigger data-testid="select-fallback-action">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="leave_pending">Leave Pending</SelectItem>
            <SelectItem value="notify_only">Notify Only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button
          variant="outline"
          onClick={() => {
            setEditingRule(null);
            setCreateDialogOpen(false);
            resetForm();
          }}
          data-testid="button-cancel-rule"
        >
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={!formData.name || createMutation.isPending || updateMutation.isPending}
          data-testid="button-save-rule"
        >
          {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {editingRule ? "Update Rule" : "Create Rule"}
        </Button>
      </div>
    </div>
  );

  if (rulesLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
          <p className="text-muted-foreground">Loading automation rules...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Global Automation Rules
            </CardTitle>
            <CardDescription>
              Configure automatic job routing to vendors based on capacity and routing strategies
            </CardDescription>
          </div>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-rule">
                <Plus className="h-4 w-4 mr-2" />
                Create Rule
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create Automation Rule</DialogTitle>
              </DialogHeader>
              <RuleFormContent />
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {globalRules.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Zap className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No automation rules configured yet.</p>
              <p className="text-sm">Create a rule to automatically assign incoming jobs to vendors.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Services</TableHead>
                  <TableHead>Strategy</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {globalRules.map(rule => (
                  <TableRow key={rule.id} data-testid={`row-rule-${rule.id}`}>
                    <TableCell className="font-medium">{rule.name}</TableCell>
                    <TableCell>
                      <Badge variant={rule.isActive ? "default" : "secondary"}>
                        {rule.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>{rule.priority || 0}</TableCell>
                    <TableCell>
                      {rule.serviceIds ? (
                        <span className="text-sm">
                          {(rule.serviceIds as string[]).length} service(s)
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-sm">All services</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{rule.routingStrategy.replace("_", " ")}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{rule.routingTarget.replace("_", " ")}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Dialog open={editingRule?.id === rule.id} onOpenChange={(open) => !open && setEditingRule(null)}>
                          <DialogTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => openEditDialog(rule)}
                              data-testid={`button-edit-rule-${rule.id}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle>Edit Automation Rule</DialogTitle>
                            </DialogHeader>
                            <RuleFormContent />
                          </DialogContent>
                        </Dialog>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => deleteMutation.mutate(rule.id)}
                          disabled={deleteMutation.isPending}
                          data-testid={`button-delete-rule-${rule.id}`}
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Vendor Capacities Overview
          </CardTitle>
          <CardDescription>
            View configured vendor service capacities across all vendors
          </CardDescription>
        </CardHeader>
        <CardContent>
          <VendorCapacitiesOverview />
        </CardContent>
      </Card>
    </div>
  );
}

function VendorCapacitiesOverview() {
  const { data: capacities = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/vendor-service-capacities"],
  });

  const { data: services = [] } = useQuery<Service[]>({
    queryKey: ["/api/services"],
  });

  const { data: vendorProfiles = [] } = useQuery<VendorProfile[]>({
    queryKey: ["/api/vendor-profiles"],
  });

  if (isLoading) {
    return (
      <div className="text-center py-4">
        <Loader2 className="h-4 w-4 animate-spin mx-auto" />
      </div>
    );
  }

  if (capacities.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>No vendor capacities configured yet.</p>
        <p className="text-sm">Vendors can configure their service capacities from their profile page.</p>
      </div>
    );
  }

  const getServiceName = (serviceId: string) => {
    return services.find(s => s.id === serviceId)?.title || serviceId;
  };

  const getVendorName = (profileId: string) => {
    return vendorProfiles.find(p => p.id === profileId)?.companyName || profileId;
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Vendor</TableHead>
          <TableHead>Service</TableHead>
          <TableHead>Daily Capacity</TableHead>
          <TableHead>Strategy</TableHead>
          <TableHead>Priority</TableHead>
          <TableHead>Auto-Assign</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {capacities.map(cap => (
          <TableRow key={cap.id} data-testid={`row-capacity-${cap.id}`}>
            <TableCell className="font-medium">{getVendorName(cap.vendorProfileId)}</TableCell>
            <TableCell>{getServiceName(cap.serviceId)}</TableCell>
            <TableCell>{cap.dailyCapacity}</TableCell>
            <TableCell>
              <Badge variant="outline">{cap.routingStrategy.replace("_", " ")}</Badge>
            </TableCell>
            <TableCell>{cap.priority || 0}</TableCell>
            <TableCell>
              <Badge variant={cap.autoAssignEnabled ? "default" : "secondary"}>
                {cap.autoAssignEnabled ? "Enabled" : "Disabled"}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
