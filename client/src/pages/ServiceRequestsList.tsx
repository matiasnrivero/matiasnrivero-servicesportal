import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { format } from "date-fns";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Eye, Clock, RefreshCw, CheckCircle2, AlertCircle, XCircle, Package, Boxes, LayoutGrid, List, Trash2, CalendarIcon, Search, ChevronDown, X, SlidersHorizontal } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { BoardView } from "@/components/BoardView";
import { calculateServicePrice } from "@/lib/pricing";
import type { ServiceRequest, Service, User, BundleRequest, Bundle, VendorProfile } from "@shared/schema";

interface CurrentUser {
  userId: string;
  role: string;
  username: string;
}

function isDistributor(role: string | undefined): boolean {
  return role === "client" || role === "distributor";
}

function isInternalRole(role: string | undefined): boolean {
  return ["admin", "internal_designer", "vendor", "vendor_designer"].includes(role || "");
}

const statusConfig: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  "pending": { label: "Pending", color: "bg-yellow-100 text-yellow-800 border-yellow-200", icon: Clock },
  "in-progress": { label: "In Progress", color: "bg-blue-100 text-blue-800 border-blue-200", icon: RefreshCw },
  "delivered": { label: "Delivered", color: "bg-green-100 text-green-800 border-green-200", icon: CheckCircle2 },
  "change-request": { label: "Change Request", color: "bg-orange-100 text-orange-800 border-orange-200", icon: AlertCircle },
  "canceled": { label: "Canceled", color: "bg-gray-100 text-gray-800 border-gray-200", icon: XCircle },
};

interface MultiSelectClientFilterProps {
  options: { id: string; name: string }[];
  selected: string[];
  onChange: (selected: string[]) => void;
}

function MultiSelectClientFilter({ options, selected, onChange }: MultiSelectClientFilterProps) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredOptions = useMemo(() => {
    if (!searchTerm) return options;
    return options.filter(opt => opt.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [options, searchTerm]);

  const allSelected = selected.length === options.length && options.length > 0;
  const someSelected = selected.length > 0 && selected.length < options.length;

  const handleSelectAll = () => {
    if (allSelected) {
      onChange([]);
    } else {
      onChange(options.map(o => o.id));
    }
  };

  const handleToggle = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter(s => s !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  const handleRemove = (id: string) => {
    onChange(selected.filter(s => s !== id));
  };

  const selectedNames = useMemo(() => {
    return options.filter(o => selected.includes(o.id));
  }, [options, selected]);

  return (
    <div className="space-y-2">
      <Label className="text-sm">Client Filter</Label>
      <div ref={containerRef} className="relative">
        <div
          className="min-h-9 flex flex-wrap items-center gap-1 p-1.5 border rounded-md cursor-pointer bg-background"
          onClick={() => setOpen(!open)}
          data-testid="multiselect-client-trigger"
        >
          {selectedNames.length === 0 ? (
            <span className="text-muted-foreground text-sm px-1">All Clients</span>
          ) : (
            <>
              {selectedNames.slice(0, 3).map(item => (
                <Badge
                  key={item.id}
                  variant="secondary"
                  className="text-xs flex items-center gap-1"
                  data-testid={`badge-client-${item.id}`}
                >
                  {item.name}
                  <X
                    className="w-3 h-3 cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemove(item.id);
                    }}
                    data-testid={`remove-client-${item.id}`}
                  />
                </Badge>
              ))}
              {selectedNames.length > 3 && (
                <Badge variant="secondary" className="text-xs">
                  +{selectedNames.length - 3} more
                </Badge>
              )}
            </>
          )}
          <ChevronDown className="w-4 h-4 ml-auto text-muted-foreground" />
        </div>

        {open && (
          <div className="absolute z-50 mt-1 w-full bg-popover border rounded-md shadow-md">
            <div className="p-2 border-b">
              <Input
                placeholder="Filter..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-8"
                data-testid="input-client-filter-search"
              />
            </div>
            <div className="max-h-60 overflow-y-auto p-2">
              <div
                className="flex items-center gap-2 p-2 hover-elevate rounded cursor-pointer"
                onClick={handleSelectAll}
                data-testid="checkbox-select-all-clients"
              >
                <Checkbox
                  checked={allSelected}
                  className={someSelected ? "data-[state=checked]:bg-primary data-[state=checked]:border-primary" : ""}
                />
                <span className="text-sm font-medium">Select All</span>
              </div>
              {filteredOptions.map(option => (
                <div
                  key={option.id}
                  className="flex items-center gap-2 p-2 hover-elevate rounded cursor-pointer"
                  onClick={() => handleToggle(option.id)}
                  data-testid={`checkbox-client-${option.id}`}
                >
                  <Checkbox checked={selected.includes(option.id)} />
                  <span className="text-sm">{option.name}</span>
                </div>
              ))}
              {filteredOptions.length === 0 && (
                <p className="text-sm text-muted-foreground p-2">No clients found</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ServiceRequestsList() {
  const { toast } = useToast();
  const localQueryClient = useQueryClient();
  const [location, navigate] = useLocation();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [bundleStatusFilter, setBundleStatusFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"adhoc" | "bundle">("adhoc");
  const [viewMode, setViewMode] = useState<"list" | "board">(() => {
    const saved = localStorage.getItem("serviceRequestsViewMode");
    return (saved as "list" | "board") || "list";
  });

  const [vendorFilter, setVendorFilter] = useState<string>("all");
  const [serviceFilter, setServiceFilter] = useState<string>("all");
  const [serviceMethodFilter, setServiceMethodFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [selectedClients, setSelectedClients] = useState<string[]>([]);
  const [searchJobId, setSearchJobId] = useState("");
  const [isFiltersOpen, setIsFiltersOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem("serviceRequestsFiltersOpen");
    return saved === null ? true : saved === "true";
  });

  useEffect(() => {
    localStorage.setItem("serviceRequestsViewMode", viewMode);
  }, [viewMode]);

  useEffect(() => {
    localStorage.setItem("serviceRequestsFiltersOpen", String(isFiltersOpen));
  }, [isFiltersOpen]);
  
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tabFromUrl = urlParams.get("tab");
    setActiveTab(tabFromUrl === "bundle" ? "bundle" : "adhoc");
  }, [location]);
  
  const handleTabChange = (tab: "adhoc" | "bundle") => {
    setActiveTab(tab);
    if (tab === "adhoc") {
      navigate("/service-requests");
    } else {
      navigate("/service-requests?tab=bundle");
    }
  };

  const { data: currentUser, refetch: refetchUser } = useQuery<CurrentUser>({
    queryKey: ["/api/default-user"],
  });

  const { data: requests = [], isLoading: loadingRequests } = useQuery<ServiceRequest[]>({
    queryKey: ["/api/service-requests"],
  });

  const { data: bundleRequests = [], isLoading: loadingBundleRequests } = useQuery<BundleRequest[]>({
    queryKey: ["/api/bundle-requests"],
  });

  const { data: services = [] } = useQuery<Service[]>({
    queryKey: ["/api/services"],
  });

  const { data: bundles = [] } = useQuery<Bundle[]>({
    queryKey: ["/api/bundles"],
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const { data: vendorProfiles = [] } = useQuery<VendorProfile[]>({
    queryKey: ["/api/vendor-profiles"],
  });

  const isAdmin = currentUser?.role === "admin";

  const userMap = useMemo(() => {
    const map: Record<string, User> = {};
    users.forEach(u => { map[u.id] = u; });
    return map;
  }, [users]);

  const vendorProfileMap = useMemo(() => {
    const map: Record<string, VendorProfile> = {};
    vendorProfiles.forEach(vp => { map[vp.userId] = vp; });
    return map;
  }, [vendorProfiles]);

  const vendors = useMemo(() => {
    return users.filter(u => u.role === "vendor" || u.role === "vendor_designer");
  }, [users]);

  const clientOptions = useMemo(() => {
    const clientsSet = new Map<string, string>();
    requests.forEach(r => {
      const user = userMap[r.userId];
      if (user) clientsSet.set(user.id, user.username);
    });
    bundleRequests.forEach(r => {
      const user = userMap[r.userId];
      if (user) clientsSet.set(user.id, user.username);
    });
    return Array.from(clientsSet.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [requests, bundleRequests, userMap]);

  const switchRoleMutation = useMutation({
    mutationFn: async (role: string) => {
      return apiRequest("POST", "/api/switch-role", { role });
    },
    onSuccess: async () => {
      await refetchUser();
      localQueryClient.invalidateQueries({ queryKey: ["/api/default-user"] });
      localQueryClient.invalidateQueries({ queryKey: ["/api/service-requests"] });
      toast({ 
        title: "Role switched", 
        description: `You are now viewing as ${currentUser?.role === "designer" ? "Client" : "Designer"}` 
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to switch role", variant: "destructive" });
    },
  });

  const deleteRequestMutation = useMutation({
    mutationFn: async (requestId: string) => {
      return apiRequest("DELETE", `/api/service-requests/${requestId}`);
    },
    onSuccess: () => {
      localQueryClient.invalidateQueries({ queryKey: ["/api/service-requests"] });
      toast({ 
        title: "Job deleted", 
        description: "The service request has been permanently deleted." 
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete service request", variant: "destructive" });
    },
  });

  const deleteBundleRequestMutation = useMutation({
    mutationFn: async (requestId: string) => {
      return apiRequest("DELETE", `/api/bundle-requests/${requestId}`);
    },
    onSuccess: () => {
      localQueryClient.invalidateQueries({ queryKey: ["/api/bundle-requests"] });
      toast({ 
        title: "Job deleted", 
        description: "The bundle request has been permanently deleted." 
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete bundle request", variant: "destructive" });
    },
  });

  const getServiceTitle = (serviceId: string) => {
    const service = services.find(s => s.id === serviceId);
    return service?.title || "Unknown Service";
  };

  const getAssigneeName = (assigneeId: string | null) => {
    if (!assigneeId) return "Unassigned";
    const user = users.find(u => u.id === assigneeId);
    return user?.username || "Unknown";
  };

  const getServicePrice = (request: ServiceRequest) => {
    const service = services.find(s => s.id === request.serviceId);
    const formData = request.formData as Record<string, any> | null;
    
    return calculateServicePrice({
      serviceTitle: service?.title,
      pricingStructure: service?.pricingStructure,
      basePrice: service?.basePrice,
      formData,
      finalPrice: request.finalPrice,
    });
  };

  const getBundleName = (bundleId: string) => {
    const bundle = bundles.find(b => b.id === bundleId);
    return bundle?.name || "Unknown Bundle";
  };

  const getBundlePrice = (request: BundleRequest) => {
    const formData = request.formData as Record<string, any> | null;
    if (formData?.calculatedPrice) {
      return `$ ${formData.calculatedPrice}`;
    }
    const bundle = bundles.find(b => b.id === request.bundleId);
    return bundle?.finalPrice ? `$ ${bundle.finalPrice}` : "N/A";
  };

  const getBundleCustomerName = (request: BundleRequest) => {
    const formData = request.formData as Record<string, any> | null;
    if (formData?.customerName) {
      return formData.customerName;
    }
    const user = users.find(u => u.id === request.userId);
    return user?.username || "Unknown";
  };

  const getVendorIdFromAssignee = (assigneeId: string | null): string | null => {
    if (!assigneeId) return null;
    const user = userMap[assigneeId];
    if (!user) return null;
    if (user.role === "vendor") return user.id;
    if (user.role === "vendor_designer") return user.vendorId || null;
    return null;
  };

  const filteredRequests = useMemo(() => {
    return requests.filter(r => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;

      if (vendorFilter !== "all") {
        const assigneeVendorId = getVendorIdFromAssignee(r.assigneeId);
        if (assigneeVendorId !== vendorFilter) return false;
      }

      if (serviceFilter !== "all") {
        if (serviceFilter.startsWith("service:")) {
          const serviceId = serviceFilter.replace("service:", "");
          if (r.serviceId !== serviceId) return false;
        } else if (serviceFilter.startsWith("bundle:")) {
          return false;
        }
      }

      if (serviceMethodFilter !== "all") {
        if (serviceMethodFilter === "bundle") return false;
      }

      if (dateFrom) {
        const createdAt = new Date(r.createdAt);
        if (createdAt < dateFrom) return false;
      }
      if (dateTo) {
        const endOfDay = new Date(dateTo);
        endOfDay.setHours(23, 59, 59, 999);
        const createdAt = new Date(r.createdAt);
        if (createdAt > endOfDay) return false;
      }

      if (selectedClients.length > 0 && !selectedClients.includes(r.userId)) {
        return false;
      }

      if (searchJobId) {
        const jobNumber = `A-${r.id.slice(0, 5).toUpperCase()}`;
        if (!jobNumber.toLowerCase().includes(searchJobId.toLowerCase()) && 
            !r.id.toLowerCase().includes(searchJobId.toLowerCase())) {
          return false;
        }
      }

      return true;
    });
  }, [requests, statusFilter, vendorFilter, serviceFilter, serviceMethodFilter, dateFrom, dateTo, selectedClients, searchJobId]);

  const filteredBundleRequests = useMemo(() => {
    return bundleRequests.filter(r => {
      if (bundleStatusFilter !== "all" && r.status !== bundleStatusFilter) return false;

      if (vendorFilter !== "all") {
        const assigneeVendorId = getVendorIdFromAssignee(r.assigneeId);
        if (assigneeVendorId !== vendorFilter) return false;
      }

      if (serviceFilter !== "all") {
        if (serviceFilter.startsWith("bundle:")) {
          const bundleId = serviceFilter.replace("bundle:", "");
          if (r.bundleId !== bundleId) return false;
        } else if (serviceFilter.startsWith("service:")) {
          return false;
        }
      }

      if (serviceMethodFilter !== "all") {
        if (serviceMethodFilter === "ad_hoc") return false;
      }

      if (dateFrom) {
        const createdAt = new Date(r.createdAt);
        if (createdAt < dateFrom) return false;
      }
      if (dateTo) {
        const endOfDay = new Date(dateTo);
        endOfDay.setHours(23, 59, 59, 999);
        const createdAt = new Date(r.createdAt);
        if (createdAt > endOfDay) return false;
      }

      if (selectedClients.length > 0 && !selectedClients.includes(r.userId)) {
        return false;
      }

      if (searchJobId) {
        const jobNumber = `B-${r.id.slice(0, 5).toUpperCase()}`;
        if (!jobNumber.toLowerCase().includes(searchJobId.toLowerCase()) && 
            !r.id.toLowerCase().includes(searchJobId.toLowerCase())) {
          return false;
        }
      }

      return true;
    });
  }, [bundleRequests, bundleStatusFilter, vendorFilter, serviceFilter, serviceMethodFilter, dateFrom, dateTo, selectedClients, searchJobId]);

  const hasActiveFilters = vendorFilter !== "all" || serviceFilter !== "all" || serviceMethodFilter !== "all" || dateFrom || dateTo || selectedClients.length > 0 || searchJobId;

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (vendorFilter !== "all") count++;
    if (serviceFilter !== "all") count++;
    if (serviceMethodFilter !== "all") count++;
    if (dateFrom) count++;
    if (dateTo) count++;
    if (selectedClients.length > 0) count++;
    if (searchJobId) count++;
    return count;
  }, [vendorFilter, serviceFilter, serviceMethodFilter, dateFrom, dateTo, selectedClients, searchJobId]);

  const clearAllFilters = () => {
    setVendorFilter("all");
    setServiceFilter("all");
    setServiceMethodFilter("all");
    setDateFrom(undefined);
    setDateTo(undefined);
    setSelectedClients([]);
    setSearchJobId("");
    setStatusFilter("all");
    setBundleStatusFilter("all");
  };

  return (
    <main className="flex flex-col w-full min-h-screen bg-light-grey">
      <Header />
      <div className="flex-1 p-8">
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <CardTitle className="font-title-semibold text-dark-blue-night text-2xl">
                Service Requests
              </CardTitle>
              <div className="flex items-center gap-4">
                <ToggleGroup
                  type="single"
                  value={viewMode}
                  onValueChange={(value) => value && setViewMode(value as "list" | "board")}
                  className="border rounded-md"
                >
                  <ToggleGroupItem
                    value="list"
                    aria-label="List view"
                    data-testid="toggle-list-view"
                    className="px-3"
                  >
                    <List className="h-4 w-4" />
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="board"
                    aria-label="Board view"
                    data-testid="toggle-board-view"
                    className="px-3"
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </ToggleGroupItem>
                </ToggleGroup>
                {viewMode === "list" && (
                  activeTab === "adhoc" ? (
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-[180px]" data-testid="select-status-filter">
                        <SelectValue placeholder="Filter by status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="in-progress">In Progress</SelectItem>
                        <SelectItem value="delivered">Delivered</SelectItem>
                        <SelectItem value="change-request">Change Request</SelectItem>
                        <SelectItem value="canceled">Canceled</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Select value={bundleStatusFilter} onValueChange={setBundleStatusFilter}>
                      <SelectTrigger className="w-[180px]" data-testid="select-bundle-status-filter">
                        <SelectValue placeholder="Filter by status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="in-progress">In Progress</SelectItem>
                        <SelectItem value="delivered">Delivered</SelectItem>
                        <SelectItem value="change-request">Change Request</SelectItem>
                        <SelectItem value="canceled">Canceled</SelectItem>
                      </SelectContent>
                    </Select>
                  )
                )}
                <Link href="/">
                  <Button data-testid="button-new-request">New Request</Button>
                </Link>
              </div>
            </div>
          </CardHeader>
        </Card>

        <Collapsible open={isFiltersOpen} onOpenChange={setIsFiltersOpen} className="mb-6">
          <Card>
            <div className="flex items-center justify-between px-6 py-4">
              <CollapsibleTrigger asChild>
                <Button 
                  variant="ghost" 
                  className="flex items-center gap-2 p-0 h-auto hover:bg-transparent"
                  data-testid="button-toggle-filters"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  <span className="font-medium">Filters</span>
                  {activeFilterCount > 0 && (
                    <Badge variant="secondary" className="ml-1 text-xs">
                      {activeFilterCount}
                    </Badge>
                  )}
                  <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isFiltersOpen ? "rotate-180" : ""}`} />
                </Button>
              </CollapsibleTrigger>
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearAllFilters}
                  className="text-dark-gray"
                  data-testid="button-clear-filters"
                >
                  Clear all
                </Button>
              )}
            </div>
            <CollapsibleContent className="data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
              <CardContent className="pt-0 pb-6">
                {(() => {
                  // Calculate visible filter count based on role
                  const hasVendorFilter = isAdmin || currentUser?.role === "internal_designer";
                  const hasClientFilter = isInternalRole(currentUser?.role);
                  // Base filters: Service Type, Service Method, Date From, Date To, Search Job ID = 5
                  const filterCount = 5 + (hasVendorFilter ? 1 : 0) + (hasClientFilter ? 1 : 0);
                  
                  return (
                    <div 
                      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
                      style={{ 
                        gridTemplateColumns: `repeat(1, minmax(0, 1fr))`,
                      }}
                      data-filter-count={filterCount}
                    >
                      <style>{`
                        @media (min-width: 768px) {
                          [data-filter-count="${filterCount}"] {
                            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
                          }
                        }
                        @media (min-width: 1024px) {
                          [data-filter-count="${filterCount}"] {
                        grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
                      }
                    }
                    @media (min-width: 1280px) {
                      [data-filter-count="${filterCount}"] {
                        grid-template-columns: repeat(${filterCount}, minmax(0, 1fr)) !important;
                      }
                    }
                  `}</style>
              {(isAdmin || currentUser?.role === "internal_designer") && (
                <div className="space-y-2">
                  <Label className="text-sm">Vendor</Label>
                  <Select value={vendorFilter} onValueChange={setVendorFilter}>
                    <SelectTrigger data-testid="select-vendor-filter">
                      <SelectValue placeholder="All Vendors" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Vendors</SelectItem>
                      {vendors.filter(v => v.role === "vendor").map(vendor => {
                        const vp = vendorProfileMap[vendor.id];
                        return (
                          <SelectItem key={vendor.id} value={vendor.id}>
                            {vp?.companyName || vendor.username}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-sm">Service Type</Label>
                <Select value={serviceFilter} onValueChange={setServiceFilter}>
                  <SelectTrigger data-testid="select-service-filter">
                    <SelectValue placeholder="All Services" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Services</SelectItem>
                    {services.filter(s => s.isActive === 1 && !s.parentServiceId).length > 0 && (
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Ad-hoc Services</div>
                    )}
                    {services.filter(s => s.isActive === 1 && !s.parentServiceId).map(service => (
                      <SelectItem key={`service-${service.id}`} value={`service:${service.id}`}>
                        {service.title}
                      </SelectItem>
                    ))}
                    {bundles.filter(b => b.isActive).length > 0 && (
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t mt-1 pt-1">Bundle Services</div>
                    )}
                    {bundles.filter(b => b.isActive).map(bundle => (
                      <SelectItem key={`bundle-${bundle.id}`} value={`bundle:${bundle.id}`}>
                        {bundle.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Service Method</Label>
                <Select value={serviceMethodFilter} onValueChange={setServiceMethodFilter}>
                  <SelectTrigger data-testid="select-service-method-filter">
                    <SelectValue placeholder="All Methods" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Methods</SelectItem>
                    <SelectItem value="ad_hoc">Ad-hoc Service</SelectItem>
                    <SelectItem value="bundle">Bundle Service</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Date From</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                      data-testid="button-date-from"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateFrom ? format(dateFrom, "MMM d, yyyy") : "Select date"}
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
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Date To</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                      data-testid="button-date-to"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateTo ? format(dateTo, "MMM d, yyyy") : "Select date"}
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
              </div>

              {isInternalRole(currentUser?.role) && (
                <MultiSelectClientFilter
                  options={clientOptions}
                  selected={selectedClients}
                  onChange={setSelectedClients}
                />
              )}

              <div className="space-y-2">
                <Label className="text-sm">Search Job ID</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-gray" />
                  <Input
                    placeholder="Job ID..."
                    value={searchJobId}
                    onChange={(e) => setSearchJobId(e.target.value)}
                    className="pl-9"
                    data-testid="input-search-job-id"
                  />
                </div>
              </div>
                    </div>
                  );
                })()}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        <Card>
          <CardContent className="pt-6">
            <Tabs value={activeTab} onValueChange={(v) => handleTabChange(v as "adhoc" | "bundle")}>
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="adhoc" data-testid="tab-adhoc-requests" className="gap-2">
                  <Package className="h-4 w-4" />
                  Ad-hoc Service Requests ({filteredRequests.length})
                </TabsTrigger>
                <TabsTrigger value="bundle" data-testid="tab-bundle-requests" className="gap-2">
                  <Boxes className="h-4 w-4" />
                  Bundle Requests ({filteredBundleRequests.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="adhoc">
                {viewMode === "board" ? (
                  <BoardView
                    requests={filteredRequests}
                    type="adhoc"
                    services={services}
                    users={users}
                    currentUserRole={currentUser?.role}
                    isLoading={loadingRequests}
                  />
                ) : loadingRequests ? (
                  <div className="text-center py-8">
                    <p className="font-body-reg text-dark-gray">Loading requests...</p>
                  </div>
                ) : filteredRequests.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="font-body-reg text-dark-gray">No service requests found</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Job ID</TableHead>
                        <TableHead>Service</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Due Date</TableHead>
                        {isDistributor(currentUser?.role) ? (
                          <TableHead>Price</TableHead>
                        ) : (
                          <TableHead>Assignee</TableHead>
                        )}
                        <TableHead>Status</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRequests.map((request) => {
                        const StatusIcon = statusConfig[request.status]?.icon || Clock;
                        return (
                          <TableRow key={request.id} data-testid={`row-request-${request.id}`}>
                            <TableCell className="font-medium">
                              <Link href={`/jobs/${request.id}`}>
                                <span className="text-sky-blue-accent hover:underline cursor-pointer" data-testid={`link-job-id-${request.id}`}>
                                  A-{request.id.slice(0, 5).toUpperCase()}
                                </span>
                              </Link>
                            </TableCell>
                            <TableCell data-testid={`text-service-${request.id}`}>
                              {getServiceTitle(request.serviceId)}
                            </TableCell>
                            <TableCell data-testid={`text-customer-${request.id}`}>
                              {request.customerName || "N/A"}
                            </TableCell>
                            <TableCell data-testid={`text-due-date-${request.id}`}>
                              {request.dueDate
                                ? format(new Date(request.dueDate), "MM/dd/yyyy")
                                : "Not set"}
                            </TableCell>
                            {isDistributor(currentUser?.role) ? (
                              <TableCell data-testid={`text-price-${request.id}`}>
                                <span className="text-dark-blue-night font-medium">{getServicePrice(request)}</span>
                              </TableCell>
                            ) : (
                              <TableCell data-testid={`text-assignee-${request.id}`}>
                                {getAssigneeName(request.assigneeId)}
                              </TableCell>
                            )}
                            <TableCell>
                              <Badge 
                                className={statusConfig[request.status]?.color || "bg-gray-100 text-gray-800"}
                                data-testid={`badge-status-${request.id}`}
                              >
                                <StatusIcon className="h-3 w-3 mr-1" />
                                {statusConfig[request.status]?.label || request.status}
                              </Badge>
                            </TableCell>
                            <TableCell data-testid={`text-created-${request.id}`}>
                              {format(new Date(request.createdAt), "MMM dd, yyyy")}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Link href={`/jobs/${request.id}`}>
                                  <Button 
                                    size="sm" 
                                    variant="outline"
                                    data-testid={`button-view-${request.id}`}
                                  >
                                    <Eye className="h-4 w-4 mr-1" />
                                    View
                                  </Button>
                                </Link>
                                {currentUser?.role === "admin" && (
                                  <Button 
                                    size="icon" 
                                    variant="ghost"
                                    onClick={() => {
                                      if (confirm(`Are you sure you want to delete job A-${request.id.slice(0, 5).toUpperCase()}?`)) {
                                        deleteRequestMutation.mutate(request.id);
                                      }
                                    }}
                                    data-testid={`button-delete-${request.id}`}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>

              <TabsContent value="bundle">
                {viewMode === "board" ? (
                  <BoardView
                    requests={filteredBundleRequests}
                    type="bundle"
                    bundles={bundles}
                    users={users}
                    currentUserRole={currentUser?.role}
                    isLoading={loadingBundleRequests}
                  />
                ) : loadingBundleRequests ? (
                  <div className="text-center py-8">
                    <p className="font-body-reg text-dark-gray">Loading bundle requests...</p>
                  </div>
                ) : filteredBundleRequests.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="font-body-reg text-dark-gray">No bundle requests found</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Job ID</TableHead>
                        <TableHead>Bundle</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Due Date</TableHead>
                        {isDistributor(currentUser?.role) ? (
                          <TableHead>Price</TableHead>
                        ) : (
                          <TableHead>Assignee</TableHead>
                        )}
                        <TableHead>Status</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredBundleRequests.map((request) => {
                        const StatusIcon = statusConfig[request.status]?.icon || Clock;
                        return (
                          <TableRow key={request.id} data-testid={`row-bundle-request-${request.id}`}>
                            <TableCell className="font-medium">
                              <Link href={`/bundle-jobs/${request.id}`}>
                                <span className="text-sky-blue-accent hover:underline cursor-pointer" data-testid={`link-bundle-job-id-${request.id}`}>
                                  B-{request.id.slice(0, 5).toUpperCase()}
                                </span>
                              </Link>
                            </TableCell>
                            <TableCell data-testid={`text-bundle-${request.id}`}>
                              {getBundleName(request.bundleId)}
                            </TableCell>
                            <TableCell data-testid={`text-bundle-customer-${request.id}`}>
                              {getBundleCustomerName(request)}
                            </TableCell>
                            <TableCell data-testid={`text-bundle-due-date-${request.id}`}>
                              {request.dueDate
                                ? format(new Date(request.dueDate), "MM/dd/yyyy")
                                : "Not set"}
                            </TableCell>
                            {isDistributor(currentUser?.role) ? (
                              <TableCell data-testid={`text-bundle-price-${request.id}`}>
                                <span className="text-dark-blue-night font-medium">{getBundlePrice(request)}</span>
                              </TableCell>
                            ) : (
                              <TableCell data-testid={`text-bundle-assignee-${request.id}`}>
                                {getAssigneeName(request.assigneeId)}
                              </TableCell>
                            )}
                            <TableCell>
                              <Badge 
                                className={statusConfig[request.status]?.color || "bg-gray-100 text-gray-800"}
                                data-testid={`badge-bundle-status-${request.id}`}
                              >
                                <StatusIcon className="h-3 w-3 mr-1" />
                                {statusConfig[request.status]?.label || request.status}
                              </Badge>
                            </TableCell>
                            <TableCell data-testid={`text-bundle-created-${request.id}`}>
                              {format(new Date(request.createdAt), "MMM dd, yyyy")}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Link href={`/bundle-jobs/${request.id}`}>
                                  <Button 
                                    size="sm" 
                                    variant="outline"
                                    data-testid={`button-view-bundle-${request.id}`}
                                  >
                                    <Eye className="h-4 w-4 mr-1" />
                                    View
                                  </Button>
                                </Link>
                                {currentUser?.role === "admin" && (
                                  <Button 
                                    size="icon" 
                                    variant="ghost"
                                    onClick={() => {
                                      if (confirm(`Are you sure you want to delete job B-${request.id.slice(0, 5).toUpperCase()}?`)) {
                                        deleteBundleRequestMutation.mutate(request.id);
                                      }
                                    }}
                                    data-testid={`button-delete-bundle-${request.id}`}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
