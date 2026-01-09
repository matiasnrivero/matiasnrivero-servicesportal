import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { Building2, Plus, Search, Users, Edit, Trash2 } from "lucide-react";
import type { User, ClientCompany, VendorProfile } from "@shared/schema";

interface EnrichedCompany extends ClientCompany {
  memberCount: number;
  primaryContact: { id: string; username: string; email: string | null } | null;
  defaultVendor: { id: string; username: string } | null;
}

async function getDefaultUser(): Promise<User | null> {
  const res = await fetch("/api/default-user");
  if (!res.ok) return null;
  return res.json();
}

export default function OrgCompanies() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<EnrichedCompany | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [companyToDelete, setCompanyToDelete] = useState<EnrichedCompany | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    industry: "",
    website: "",
    email: "",
    phone: "",
    address: "",
    paymentConfiguration: "pay_as_you_go",
    defaultVendorId: "",
    notes: "",
  });

  const { data: currentUser } = useQuery<User | null>({
    queryKey: ["/api/default-user"],
    queryFn: getDefaultUser,
  });

  const { data: companies = [], isLoading } = useQuery<EnrichedCompany[]>({
    queryKey: ["/api/org-companies"],
    enabled: currentUser?.role === "admin",
  });

  const { data: vendors = [] } = useQuery<VendorProfile[]>({
    queryKey: ["/api/vendor-profiles"],
    enabled: currentUser?.role === "admin",
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await apiRequest("POST", "/api/org-companies", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/org-companies"] });
      toast({ title: "Company created", description: "The client company has been created successfully." });
      setCreateModalOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const res = await apiRequest("PATCH", `/api/org-companies/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/org-companies"] });
      toast({ title: "Company updated", description: "The client company has been updated successfully." });
      setEditModalOpen(false);
      setSelectedCompany(null);
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/org-companies/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/org-companies"] });
      toast({ title: "Company deleted", description: "The client company has been deleted." });
      setDeleteConfirmOpen(false);
      setCompanyToDelete(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      industry: "",
      website: "",
      email: "",
      phone: "",
      address: "",
      paymentConfiguration: "pay_as_you_go",
      defaultVendorId: "",
      notes: "",
    });
  };

  const openEditModal = (company: EnrichedCompany) => {
    setSelectedCompany(company);
    setFormData({
      name: company.name,
      industry: company.industry || "",
      website: company.website || "",
      email: company.email || "",
      phone: company.phone || "",
      address: company.address || "",
      paymentConfiguration: company.paymentConfiguration || "pay_as_you_go",
      defaultVendorId: company.defaultVendorId || "",
      notes: company.notes || "",
    });
    setEditModalOpen(true);
  };

  const filteredCompanies = companies.filter((company) => {
    const query = searchQuery.toLowerCase();
    return (
      company.name.toLowerCase().includes(query) ||
      company.email?.toLowerCase().includes(query) ||
      company.primaryContact?.username.toLowerCase().includes(query) ||
      company.industry?.toLowerCase().includes(query)
    );
  });

  const getPaymentBadgeVariant = (config: string) => {
    switch (config) {
      case "pay_as_you_go": return "secondary";
      case "monthly_payment": return "default";
      case "deduct_from_royalties": return "outline";
      default: return "secondary";
    }
  };

  const formatPaymentConfig = (config: string) => {
    switch (config) {
      case "pay_as_you_go": return "Pay as you go";
      case "monthly_payment": return "Monthly Payment";
      case "deduct_from_royalties": return "Deduct from Royalties";
      default: return config;
    }
  };

  if (!currentUser || currentUser.role !== "admin") {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto p-6">
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">You don't have permission to access this page.</p>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto p-6">
        <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Building2 className="h-6 w-6" />
              Clients
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Manage clients for pack subscriptions and vendor assignments
            </p>
          </div>
          <Button onClick={() => setCreateModalOpen(true)} data-testid="button-create-company">
            <Plus className="h-4 w-4 mr-2" />
            Add Company
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-4">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, email, contact, or industry..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-companies"
                />
              </div>
              <Badge variant="outline" className="no-default-active-elevate">
                {filteredCompanies.length} compan{filteredCompanies.length !== 1 ? "ies" : "y"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="py-12 text-center text-muted-foreground">Loading clients...</div>
            ) : filteredCompanies.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                {searchQuery ? "No clients match your search." : "No clients yet. Create one to get started."}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Primary Contact</TableHead>
                    <TableHead>Members</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Default Vendor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCompanies.map((company) => (
                    <TableRow key={company.id} data-testid={`row-company-${company.id}`}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{company.name}</div>
                          {company.industry && (
                            <div className="text-sm text-muted-foreground">{company.industry}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {company.primaryContact ? (
                          <div>
                            <div className="text-sm">{company.primaryContact.username}</div>
                            {company.primaryContact.email && (
                              <div className="text-xs text-muted-foreground">{company.primaryContact.email}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">Not assigned</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          <span>{company.memberCount ?? 0}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getPaymentBadgeVariant(company.paymentConfiguration)}>
                          {formatPaymentConfig(company.paymentConfiguration)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {company.defaultVendor ? (
                          <span className="text-sm">{company.defaultVendor.username}</span>
                        ) : (
                          <span className="text-muted-foreground text-sm">None</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={company.isActive ? "default" : "secondary"}>
                          {company.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => openEditModal(company)}
                            data-testid={`button-edit-${company.id}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              setCompanyToDelete(company);
                              setDeleteConfirmOpen(true);
                            }}
                            data-testid={`button-delete-${company.id}`}
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
      </main>

      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Client Company</DialogTitle>
            <DialogDescription>
              Add a new client company for pack subscriptions and vendor assignments.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Company Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Acme Corporation"
                data-testid="input-company-name"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="industry">Industry</Label>
                <Input
                  id="industry"
                  value={formData.industry}
                  onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                  placeholder="Technology"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="website">Website</Label>
                <Input
                  id="website"
                  value={formData.website}
                  onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                  placeholder="https://example.com"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="contact@example.com"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+1 555 123 4567"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="123 Main St, City, State"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="payment">Payment Configuration</Label>
                <Select
                  value={formData.paymentConfiguration}
                  onValueChange={(value) => setFormData({ ...formData, paymentConfiguration: value })}
                >
                  <SelectTrigger data-testid="select-payment-config">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pay_as_you_go">Pay as you go</SelectItem>
                    <SelectItem value="monthly_payment">Monthly Payment</SelectItem>
                    <SelectItem value="deduct_from_royalties">Deduct from Royalties</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="vendor">Default Vendor</Label>
                <Select
                  value={formData.defaultVendorId}
                  onValueChange={(value) => setFormData({ ...formData, defaultVendorId: value })}
                >
                  <SelectTrigger data-testid="select-default-vendor">
                    <SelectValue placeholder="Select vendor..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {vendors.map((vendor) => (
                      <SelectItem key={vendor.id} value={vendor.userId}>
                        {vendor.companyName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Internal notes about this company..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate(formData)}
              disabled={!formData.name || createMutation.isPending}
              data-testid="button-submit-create"
            >
              {createMutation.isPending ? "Creating..." : "Create Company"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Client Company</DialogTitle>
            <DialogDescription>
              Update company details.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">Company Name *</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                data-testid="input-edit-name"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-industry">Industry</Label>
                <Input
                  id="edit-industry"
                  value={formData.industry}
                  onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-website">Website</Label>
                <Input
                  id="edit-website"
                  value={formData.website}
                  onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-email">Email</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-phone">Phone</Label>
                <Input
                  id="edit-phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-address">Address</Label>
              <Input
                id="edit-address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-payment">Payment Configuration</Label>
                <Select
                  value={formData.paymentConfiguration}
                  onValueChange={(value) => setFormData({ ...formData, paymentConfiguration: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pay_as_you_go">Pay as you go</SelectItem>
                    <SelectItem value="monthly_payment">Monthly Payment</SelectItem>
                    <SelectItem value="deduct_from_royalties">Deduct from Royalties</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-vendor">Default Vendor</Label>
                <Select
                  value={formData.defaultVendorId}
                  onValueChange={(value) => setFormData({ ...formData, defaultVendorId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select vendor..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {vendors.map((vendor) => (
                      <SelectItem key={vendor.id} value={vendor.userId}>
                        {vendor.companyName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-notes">Notes</Label>
              <Textarea
                id="edit-notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => selectedCompany && updateMutation.mutate({ id: selectedCompany.id, data: formData })}
              disabled={!formData.name || updateMutation.isPending}
              data-testid="button-submit-edit"
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Company</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{companyToDelete?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => companyToDelete && deleteMutation.mutate(companyToDelete.id)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
