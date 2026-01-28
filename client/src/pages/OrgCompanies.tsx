import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { Building2, Plus, Search, Users, Pencil, Trash2, Eye, LogIn, Store, Filter, CalendarIcon, X } from "lucide-react";
import type { User } from "@shared/schema";
import { format } from "date-fns";

interface EnrichedCompany {
  id: string;
  name: string;
  industry: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  paymentConfiguration: string;
  tripodDiscountTier?: string;
  stripeCustomerId?: string | null;
  isActive: number;
  createdAt: Date | string;
  updatedAt: Date | string;
  memberCount: number;
  primaryContact: { id: string; username: string; email: string | null } | null;
  defaultVendor: { id: string; username: string } | null;
  members?: User[];
}

async function getDefaultUser(): Promise<User | null> {
  const res = await fetch("/api/default-user");
  if (!res.ok) return null;
  return res.json();
}

export default function OrgCompanies() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [companyToDelete, setCompanyToDelete] = useState<EnrichedCompany | null>(null);
  
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

  const [formData, setFormData] = useState({
    name: "",
    industry: "",
    website: "",
    email: "",
    phone: "",
    address: "",
    paymentConfiguration: "pay_as_you_go",
  });

  const { data: currentUser } = useQuery<User | null>({
    queryKey: ["/api/default-user"],
    queryFn: getDefaultUser,
  });

  const { data: companies = [], isLoading } = useQuery<EnrichedCompany[]>({
    queryKey: ["/api/org-companies"],
    enabled: currentUser?.role === "admin",
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await apiRequest("POST", "/api/org-companies", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/org-companies"] });
      toast({ title: "Client created", description: "The client has been created successfully." });
      setCreateModalOpen(false);
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
      toast({ title: "Client deleted", description: "The client has been deleted." });
      setDeleteConfirmOpen(false);
      setCompanyToDelete(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      return apiRequest("PATCH", `/api/org-companies/${id}`, { isActive: isActive ? 1 : 0 });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/org-companies"] });
      toast({ title: "Status updated" });
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
    });
  };

  const handleLoginAs = async (company: EnrichedCompany) => {
    if (!company.primaryContact?.id) {
      toast({ title: "Error", description: "No primary contact found for this client", variant: "destructive" });
      return;
    }
    try {
      await apiRequest("POST", `/api/users/${company.primaryContact.id}/impersonate`);
      window.location.href = "/";
    } catch (error) {
      toast({ title: "Error", description: "Failed to login as client", variant: "destructive" });
    }
  };

  const filteredCompanies = companies.filter((company) => {
    const query = searchQuery.toLowerCase();
    const matchesSearch = 
      company.name.toLowerCase().includes(query) ||
      company.email?.toLowerCase().includes(query) ||
      company.primaryContact?.username.toLowerCase().includes(query) ||
      company.industry?.toLowerCase().includes(query);
    
    const matchesStatus = statusFilter === "all" || 
      (statusFilter === "active" && company.isActive === 1) || 
      (statusFilter === "inactive" && company.isActive === 0);
    
    const matchesPayment = paymentFilter === "all" || company.paymentConfiguration === paymentFilter;
    
    let matchesDateRange = true;
    if (company.createdAt) {
      const companyDate = new Date(company.createdAt);
      if (dateFrom) {
        const fromStart = new Date(dateFrom);
        fromStart.setHours(0, 0, 0, 0);
        matchesDateRange = matchesDateRange && companyDate >= fromStart;
      }
      if (dateTo) {
        const toEnd = new Date(dateTo);
        toEnd.setHours(23, 59, 59, 999);
        matchesDateRange = matchesDateRange && companyDate <= toEnd;
      }
    }
    
    return matchesSearch && matchesStatus && matchesPayment && matchesDateRange;
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

  const formatDate = (date: Date | string) => {
    if (!date) return "-";
    return format(new Date(date), "MMM d, yyyy");
  };

  const clearFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setPaymentFilter("all");
    setDateFrom(undefined);
    setDateTo(undefined);
  };

  const hasActiveFilters = searchQuery || statusFilter !== "all" || paymentFilter !== "all" || dateFrom || dateTo;

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
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-3">
              <Building2 className="h-8 w-8 text-sky-blue-accent" />
              <h1 className="font-title-semibold text-dark-blue-night text-2xl">
                Clients
              </h1>
            </div>
            <Button onClick={() => setCreateModalOpen(true)} data-testid="button-create-company">
              <Plus className="h-4 w-4 mr-2" />
              Add Company
            </Button>
          </div>

          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="flex flex-wrap items-center gap-4">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, email, contact, or industry..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                    data-testid="input-search-companies"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[130px]" data-testid="filter-status">
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                  <SelectTrigger className="w-[180px]" data-testid="filter-payment">
                    <SelectValue placeholder="All Payment Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Payment Types</SelectItem>
                    <SelectItem value="pay_as_you_go">Pay as you go</SelectItem>
                    <SelectItem value="monthly_payment">Monthly Payment</SelectItem>
                    <SelectItem value="deduct_from_royalties">Deduct from Royalties</SelectItem>
                  </SelectContent>
                </Select>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-[130px] justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateFrom ? format(dateFrom, "MMM d") : "From"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dateFrom}
                      onSelect={setDateFrom}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-[130px] justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateTo ? format(dateTo, "MMM d") : "To"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dateTo}
                      onSelect={setDateTo}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    <X className="h-4 w-4 mr-1" />
                    Clear
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Clients ({filteredCompanies.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="py-12 text-center text-muted-foreground">Loading clients...</div>
              ) : filteredCompanies.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  {hasActiveFilters ? "No clients match your filters." : "No clients yet. Create one to get started."}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredCompanies.map((company) => (
                    <div
                      key={company.id}
                      className="flex items-center p-4 border rounded-md"
                      data-testid={`row-client-${company.id}`}
                    >
                      <div className="w-16 flex-shrink-0">
                        <Switch
                          id={`toggle-client-${company.id}`}
                          checked={company.isActive === 1}
                          onCheckedChange={(checked) =>
                            toggleActiveMutation.mutate({
                              id: company.id,
                              isActive: checked,
                            })
                          }
                          data-testid={`switch-client-active-${company.id}`}
                        />
                      </div>
                      <div className="w-[220px] flex-shrink-0 flex items-center gap-3">
                        <Store className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <div>
                          <p className="font-semibold text-dark-blue-night">
                            {company.name}
                          </p>
                          <p className="text-xs text-muted-foreground">{company.industry || "No industry"}</p>
                        </div>
                      </div>
                      <div className="w-[200px] flex-shrink-0">
                        <p className="text-dark-blue-night truncate">
                          {company.primaryContact?.username || "No contact"}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {company.primaryContact?.email || "-"}
                        </p>
                      </div>
                      <div className="w-[80px] flex-shrink-0">
                        <div className="flex items-center gap-1">
                          <Users className="h-3 w-3 text-muted-foreground" />
                          <span className="text-sm">{company.memberCount}</span>
                        </div>
                      </div>
                      <div className="w-[150px] flex-shrink-0">
                        <Badge variant={getPaymentBadgeVariant(company.paymentConfiguration)}>
                          {formatPaymentConfig(company.paymentConfiguration)}
                        </Badge>
                      </div>
                      <div className="w-[100px] flex-shrink-0">
                        <p className="text-sm text-muted-foreground">
                          {formatDate(company.createdAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0 ml-auto">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleLoginAs(company)}
                              disabled={!company.primaryContact?.id}
                              data-testid={`button-login-as-client-${company.id}`}
                            >
                              <LogIn className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Login As</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setLocation(`/org-companies/${company.id}`)}
                              data-testid={`button-edit-client-${company.id}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Edit</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setLocation(`/org-companies/${company.id}`)}
                              data-testid={`button-view-client-${company.id}`}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>View</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setCompanyToDelete(company);
                                setDeleteConfirmOpen(true);
                              }}
                              data-testid={`button-delete-client-${company.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Delete</TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

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
                placeholder="Enter company name"
                data-testid="input-create-name"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="industry">Industry</Label>
                <Input
                  id="industry"
                  value={formData.industry}
                  onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                  placeholder="e.g., Technology"
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
                  placeholder="contact@company.com"
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

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Client</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{companyToDelete?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => companyToDelete && deleteMutation.mutate(companyToDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
