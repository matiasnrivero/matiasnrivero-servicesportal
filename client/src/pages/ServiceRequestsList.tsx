import { useState, useEffect, useMemo, useRef, useCallback } from "react";
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
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Eye, Clock, RefreshCw, CheckCircle2, AlertCircle, XCircle, LayoutGrid, List, Trash2, CalendarIcon, Search, ChevronDown, X, SlidersHorizontal, Users, Building2 } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { BoardView } from "@/components/BoardView";
import { calculateServicePrice } from "@/lib/pricing";
import { getDisplayStatus, getStatusInfo, statusConfig as roleAwareStatusConfig } from "@/lib/statusUtils";
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

interface CombinedRequest {
  id: string;
  type: "adhoc" | "bundle";
  serviceName: string;
  method: string;
  customerName: string;
  dueDate: Date | null;
  assigneeId: string | null;
  vendorAssigneeId: string | null;
  status: string;
  createdAt: Date;
  userId: string;
  originalRequest: ServiceRequest | BundleRequest;
  price: string;
}

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
  const [location] = useLocation();
  
  // Parse URL params for dashboard drill-down
  const urlParams = useMemo(() => {
    const searchIndex = location.indexOf('?');
    if (searchIndex === -1) return new URLSearchParams();
    return new URLSearchParams(location.slice(searchIndex));
  }, [location]);
  
  const initialStatusFromUrl = urlParams.get("status") || "all";
  const initialClientFromUrl = urlParams.get("clientId");
  const initialOverSla = urlParams.get("overSla") === "true";
  const initialStartDate = urlParams.get("start");
  const initialEndDate = urlParams.get("end");
  
  const [statusFilter, setStatusFilter] = useState<string>(initialStatusFromUrl);
  const [overSlaFilter, setOverSlaFilter] = useState<boolean>(initialOverSla);
  const [viewMode, setViewMode] = useState<"list" | "board">(() => {
    const saved = localStorage.getItem("serviceRequestsViewMode");
    return (saved as "list" | "board") || "list";
  });

  const [vendorFilter, setVendorFilter] = useState<string>("all");
  const [serviceFilter, setServiceFilter] = useState<string>("all");
  const [serviceMethodFilter, setServiceMethodFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(
    initialStartDate ? new Date(initialStartDate) : undefined
  );
  const [dateTo, setDateTo] = useState<Date | undefined>(
    initialEndDate ? new Date(initialEndDate) : undefined
  );
  const [selectedClients, setSelectedClients] = useState<string[]>(
    initialClientFromUrl ? [initialClientFromUrl] : []
  );
  const [searchJobId, setSearchJobId] = useState("");
  const [isFiltersOpen, setIsFiltersOpen] = useState<boolean>(() => {
    // Open filters if coming from dashboard with params
    if (initialStatusFromUrl !== "all" || initialOverSla || initialClientFromUrl) {
      return true;
    }
    const saved = localStorage.getItem("serviceRequestsFiltersOpen");
    return saved === null ? true : saved === "true";
  });
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [jobToDelete, setJobToDelete] = useState<CombinedRequest | null>(null);
  
  const [selectedRequests, setSelectedRequests] = useState<Set<string>>(new Set());
  const [bulkAssignModalOpen, setBulkAssignModalOpen] = useState(false);
  const [selectedDesignerId, setSelectedDesignerId] = useState<string>("");
  const [selectedVendorId, setSelectedVendorId] = useState<string>("");

  useEffect(() => {
    localStorage.setItem("serviceRequestsViewMode", viewMode);
  }, [viewMode]);

  useEffect(() => {
    localStorage.setItem("serviceRequestsFiltersOpen", String(isFiltersOpen));
  }, [isFiltersOpen]);

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
      const res = await apiRequest("POST", "/api/switch-role", { role });
      return res.json() as Promise<{ role: string; user: User }>;
    },
    onSuccess: (data) => {
      // Optimistically update user data immediately for instant UI response
      if (data.user) {
        localQueryClient.setQueryData(["/api/default-user"], data.user);
      }
      // Fire invalidations in background without awaiting
      localQueryClient.invalidateQueries({ queryKey: ["/api/service-requests"] });
      localQueryClient.invalidateQueries({ queryKey: ["/api/bundle-requests"] });
      localQueryClient.invalidateQueries({ queryKey: ["/api/assignable-users"] });
      toast({ 
        title: "Role switched", 
        description: `You are now viewing as ${data.role}` 
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

  const { data: assignableUsers = [] } = useQuery<User[]>({
    queryKey: ["/api/assignable-users"],
    enabled: !!currentUser,
  });

  const canAssignToVendor = ["admin", "internal_designer"].includes(currentUser?.role || "");
  
  const vendorUsers = useMemo(() => {
    return users.filter(u => {
      if (u.role !== "vendor" || !u.isActive) return false;
      const profile = vendorProfiles.find(p => p.userId === u.id);
      return profile?.companyName;
    });
  }, [users, vendorProfiles]);

  const getVendorDisplayName = (vendorUser: User) => {
    const profile = vendorProfiles.find(p => p.userId === vendorUser.id);
    return profile?.companyName || vendorUser.username;
  };

  const bulkAssignMutation = useMutation({
    mutationFn: async (data: { requestIds: string[]; assignmentType: "designer" | "vendor"; targetId: string }) => {
      const res = await apiRequest("POST", "/api/service-requests/bulk-assign", data);
      return res.json();
    },
    onSuccess: (data: { success: boolean; assigned: number; skipped: number }) => {
      localQueryClient.invalidateQueries({ queryKey: ["/api/service-requests"] });
      localQueryClient.invalidateQueries({ queryKey: ["/api/bundle-requests"] });
      setSelectedRequests(new Set());
      setBulkAssignModalOpen(false);
      setSelectedDesignerId("");
      setSelectedVendorId("");
      
      const assigned = data?.assigned || 0;
      const skipped = data?.skipped || 0;
      
      if (assigned > 0) {
        toast({ 
          title: "Bulk assignment complete", 
          description: `Successfully assigned ${assigned} job${assigned !== 1 ? 's' : ''}${skipped > 0 ? `. ${skipped} job${skipped !== 1 ? 's' : ''} skipped (not eligible).` : '.'}`
        });
      } else {
        toast({ 
          title: "No jobs assigned", 
          description: `${skipped} job${skipped !== 1 ? 's' : ''} skipped - no eligible jobs in selection.`,
          variant: "destructive"
        });
      }
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to bulk assign jobs", variant: "destructive" });
    },
  });

  const canBulkAssign = ["admin", "internal_designer", "vendor", "vendor_designer"].includes(currentUser?.role || "");

  // Helper to get assignee role from user map (moved here for use in isJobEligibleForBulkAssign)
  const getAssigneeRole = useCallback((assigneeId: string | null | undefined): string | null => {
    if (!assigneeId) return null;
    const user = userMap[assigneeId];
    return user?.role || null;
  }, [userMap]);

  // Eligibility check for bulk assignment that mirrors backend logic exactly
  // Backend checks in /api/service-requests/bulk-assign:
  // - status must be "pending"
  // - Admin/Internal: skip if assigneeId points to a designer (non-vendor role)
  // - Vendor/VendorDesigner: skip if vendorAssigneeId doesn't match their org OR if assigneeId is set
  const isJobEligibleForBulkAssign = useCallback((request: CombinedRequest): boolean => {
    // Guard: if userMap isn't loaded yet, treat as not eligible to prevent stale counts
    if (Object.keys(userMap).length === 0) return false;
    
    // First check: must be pending status (backend line 800-803)
    if (request.status !== "pending") return false;
    
    const isAdminOrInternal = ["admin", "internal_designer"].includes(currentUser?.role || "");
    
    if (isAdminOrInternal) {
      // Backend logic (lines 806-818): 
      // Skip only if assigneeId points to a designer (not vendor)
      if (request.assigneeId) {
        const assigneeRole = getAssigneeRole(request.assigneeId);
        // Backend also skips if getUser returns null (user deleted/inactive)
        // We mirror this by checking if we can't find the assignee in userMap
        if (!assigneeRole) {
          // Assignee not in userMap - could be deleted/inactive, skip for safety
          return false;
        }
        // If there's an assignee and it's NOT a vendor role, skip
        if (assigneeRole !== "vendor") {
          return false;
        }
      }
      // Otherwise eligible (pending-assignment or assigned-to-vendor)
      return true;
    } else {
      // Vendor/Vendor Designer backend logic (lines 820-832):
      // Must be assigned to their vendor org and have no designer assignee
      const currentUserData = userMap[currentUser?.userId || ""];
      const vendorId = currentUser?.role === "vendor" 
        ? currentUser?.userId 
        : currentUserData?.vendorId;
      
      // Skip if can't determine vendor or not assigned to their org
      if (!vendorId || request.vendorAssigneeId !== vendorId) return false;
      // Skip if already has a designer assignee
      if (request.assigneeId) return false;
      return true;
    }
  }, [currentUser?.role, currentUser?.userId, getAssigneeRole, userMap]);

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
      if (statusFilter !== "all") {
        // For pending sub-statuses, compare display status
        if (statusFilter === "pending-assignment" || statusFilter === "assigned-to-vendor") {
          const displayStatus = getDisplayStatus(r.status, r.assigneeId, r.vendorAssigneeId, currentUser?.role, getAssigneeRole(r.assigneeId));
          if (displayStatus !== statusFilter) return false;
        } else if (r.status !== statusFilter) {
          return false;
        }
      }

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
  }, [requests, statusFilter, vendorFilter, serviceFilter, serviceMethodFilter, dateFrom, dateTo, selectedClients, searchJobId, currentUser?.role]);

  const filteredBundleRequests = useMemo(() => {
    return bundleRequests.filter(r => {
      if (statusFilter !== "all") {
        // For pending sub-statuses, compare display status
        if (statusFilter === "pending-assignment" || statusFilter === "assigned-to-vendor") {
          const displayStatus = getDisplayStatus(r.status, r.assigneeId, r.vendorAssigneeId, currentUser?.role, getAssigneeRole(r.assigneeId));
          if (displayStatus !== statusFilter) return false;
        } else if (r.status !== statusFilter) {
          return false;
        }
      }

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
  }, [bundleRequests, statusFilter, vendorFilter, serviceFilter, serviceMethodFilter, dateFrom, dateTo, selectedClients, searchJobId, currentUser?.role]);

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
    setOverSlaFilter(false);
  };
  
  // Helper function to check if a job is over SLA
  const isOverSla = useCallback((dueDate: Date | null, status: string): boolean => {
    if (!dueDate) return false;
    if (status === "delivered" || status === "canceled") return false;
    return new Date(dueDate) < new Date();
  }, []);

  // Create combined request list
  const combinedFilteredRequests = useMemo((): CombinedRequest[] => {
    const adhocItems: CombinedRequest[] = filteredRequests.map(r => ({
      id: r.id,
      type: "adhoc" as const,
      serviceName: getServiceTitle(r.serviceId),
      method: "Ad-hoc",
      customerName: r.customerName || "N/A",
      dueDate: r.dueDate,
      assigneeId: r.assigneeId,
      vendorAssigneeId: r.vendorAssigneeId ?? null,
      status: r.status,
      createdAt: r.createdAt,
      userId: r.userId,
      originalRequest: r,
      price: getServicePrice(r),
    }));

    const bundleItems: CombinedRequest[] = filteredBundleRequests.map(r => ({
      id: r.id,
      type: "bundle" as const,
      serviceName: getBundleName(r.bundleId),
      method: "Bundle",
      customerName: getBundleCustomerName(r),
      dueDate: r.dueDate,
      assigneeId: r.assigneeId,
      vendorAssigneeId: r.vendorAssigneeId ?? null,
      status: r.status,
      createdAt: r.createdAt,
      userId: r.userId,
      originalRequest: r,
      price: getBundlePrice(r),
    }));

    let combined = [...adhocItems, ...bundleItems];
    
    // Apply overSLA filter if active
    if (overSlaFilter) {
      combined = combined.filter(r => isOverSla(r.dueDate, r.status));
    }
    
    return combined.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [filteredRequests, filteredBundleRequests, overSlaFilter, isOverSla]);

  // Compute eligible count from selected requests for bulk assignment
  const eligibleSelectedRequests = useMemo(() => {
    return combinedFilteredRequests.filter(
      request => selectedRequests.has(request.id) && isJobEligibleForBulkAssign(request)
    );
  }, [combinedFilteredRequests, selectedRequests, isJobEligibleForBulkAssign]);

  const eligibleCount = eligibleSelectedRequests.length;
  const totalSelectedCount = selectedRequests.size;
  const hasIneligibleSelected = totalSelectedCount > eligibleCount;

  return (
    <main className="flex flex-col w-full min-h-screen bg-light-grey">
      <Header />
      <div className="flex-1 p-8">
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <CardTitle className="font-title-semibold text-dark-blue-night text-2xl">
                Service Requests <span className="text-sky-blue-accent">({combinedFilteredRequests.length})</span>
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
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[180px]" data-testid="select-status-filter">
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      {(currentUser?.role === "admin" || currentUser?.role === "internal_designer") ? (
                        <>
                          <SelectItem value="pending-assignment">Pending Assignment</SelectItem>
                          <SelectItem value="assigned-to-vendor">Assigned to Vendor</SelectItem>
                        </>
                      ) : (
                        <SelectItem value="pending">Pending</SelectItem>
                      )}
                      <SelectItem value="in-progress">In Progress</SelectItem>
                      <SelectItem value="delivered">Delivered</SelectItem>
                      <SelectItem value="change-request">Change Request</SelectItem>
                      <SelectItem value="canceled">Canceled</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                {viewMode === "list" && canBulkAssign && (
                  <Button
                    variant="outline"
                    onClick={() => setBulkAssignModalOpen(true)}
                    disabled={selectedRequests.size === 0}
                    data-testid="button-bulk-assign"
                  >
                    <Users className="h-4 w-4 mr-2" />
                    Bulk Assign {selectedRequests.size > 0 && `(${selectedRequests.size})`}
                  </Button>
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

                {hasActiveFilters && (
                  <div className="mt-4 flex items-center gap-2">
                    <span className="text-sm text-dark-gray">Active filters:</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearAllFilters}
                      data-testid="button-clear-active-filters"
                    >
                      Clear all
                    </Button>
                  </div>
                )}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        <Card>
          <CardContent className="pt-6">
            {viewMode === "board" ? (
              <BoardView
                requests={filteredRequests}
                bundleRequests={filteredBundleRequests}
                services={services}
                bundles={bundles}
                users={users}
                currentUserRole={currentUser?.role}
                isLoading={loadingRequests || loadingBundleRequests}
              />
            ) : (loadingRequests || loadingBundleRequests) ? (
              <div className="text-center py-8">
                <p className="font-body-reg text-dark-gray">Loading requests...</p>
              </div>
            ) : combinedFilteredRequests.length === 0 ? (
              <div className="text-center py-8">
                <p className="font-body-reg text-dark-gray">No service requests found</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    {canBulkAssign && (
                      <TableHead className="w-[40px]">
                        <Checkbox
                          checked={selectedRequests.size > 0 && selectedRequests.size === combinedFilteredRequests.length}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedRequests(new Set(combinedFilteredRequests.map(r => r.id)));
                            } else {
                              setSelectedRequests(new Set());
                            }
                          }}
                          data-testid="checkbox-select-all"
                        />
                      </TableHead>
                    )}
                    <TableHead>Job ID</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Method</TableHead>
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
                  {combinedFilteredRequests.map((request) => {
                    const displayStatus = getDisplayStatus(
                      request.status,
                      request.assigneeId,
                      request.vendorAssigneeId,
                      currentUser?.role,
                      getAssigneeRole(request.assigneeId)
                    );
                    const statusInfo = getStatusInfo(displayStatus);
                    const StatusIcon = statusInfo.icon;
                    const jobPrefix = request.type === "adhoc" ? "A" : "B";
                    const detailLink = request.type === "adhoc" 
                      ? `/jobs/${request.id}` 
                      : `/bundle-jobs/${request.id}`;
                    const isSelected = selectedRequests.has(request.id);
                    
                    return (
                      <TableRow key={`${request.type}-${request.id}`} data-testid={`row-request-${request.id}`}>
                        {canBulkAssign && (
                          <TableCell>
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={(checked) => {
                                const newSelected = new Set(selectedRequests);
                                if (checked) {
                                  newSelected.add(request.id);
                                } else {
                                  newSelected.delete(request.id);
                                }
                                setSelectedRequests(newSelected);
                              }}
                              data-testid={`checkbox-select-${request.id}`}
                            />
                          </TableCell>
                        )}
                        <TableCell className="font-medium whitespace-nowrap">
                          <Link href={detailLink}>
                            <span className="text-sky-blue-accent hover:underline cursor-pointer" data-testid={`link-job-id-${request.id}`}>
                              {jobPrefix}-{request.id.slice(0, 5).toUpperCase()}
                            </span>
                          </Link>
                        </TableCell>
                        <TableCell data-testid={`text-service-${request.id}`}>
                          {request.serviceName}
                        </TableCell>
                        <TableCell data-testid={`text-method-${request.id}`}>
                          <Badge variant="outline" className="text-xs whitespace-nowrap">
                            {request.method}
                          </Badge>
                        </TableCell>
                        <TableCell data-testid={`text-customer-${request.id}`}>
                          {request.customerName}
                        </TableCell>
                        <TableCell data-testid={`text-due-date-${request.id}`}>
                          {request.dueDate
                            ? format(new Date(request.dueDate), "MM/dd/yyyy")
                            : "Not set"}
                        </TableCell>
                        {isDistributor(currentUser?.role) ? (
                          <TableCell data-testid={`text-price-${request.id}`}>
                            <span className="text-dark-blue-night font-medium">{request.price}</span>
                          </TableCell>
                        ) : (
                          <TableCell data-testid={`text-assignee-${request.id}`}>
                            {getAssigneeName(request.assigneeId)}
                          </TableCell>
                        )}
                        <TableCell>
                          <Badge 
                            className={`${statusInfo.color} whitespace-nowrap`}
                            data-testid={`badge-status-${request.id}`}
                          >
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {statusInfo.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap" data-testid={`text-created-${request.id}`}>
                          {format(new Date(request.createdAt), "MMM dd, yyyy")}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Link href={detailLink}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button 
                                    size="icon" 
                                    variant="ghost"
                                    data-testid={`button-view-${request.id}`}
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>View</TooltipContent>
                              </Tooltip>
                            </Link>
                            {currentUser?.role === "admin" && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button 
                                    size="icon" 
                                    variant="ghost"
                                    onClick={() => {
                                      setJobToDelete(request);
                                      setDeleteModalOpen(true);
                                    }}
                                    data-testid={`button-delete-${request.id}`}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Delete</TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={bulkAssignModalOpen} onOpenChange={setBulkAssignModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk Assign Jobs</DialogTitle>
            <DialogDescription>
              Assign {eligibleCount} eligible job{eligibleCount !== 1 ? 's' : ''} to a designer{canAssignToVendor ? ' or vendor organization' : ''}.
            </DialogDescription>
          </DialogHeader>
          
          {hasIneligibleSelected && (
            <div className="flex items-start gap-3 p-3 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
              <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800 dark:text-amber-200">
                <p className="font-medium">Only {eligibleCount} of {totalSelectedCount} selected jobs qualify for bulk assignment</p>
                <p className="mt-1 text-amber-700 dark:text-amber-300">
                  Only jobs with "Pending Assignment" or "Assigned to Vendor" status can be bulk assigned. 
                  Jobs with other statuses (In Progress, Delivered, Change Request, Canceled) will be skipped.
                </p>
              </div>
            </div>
          )}
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Users className="h-4 w-4" />
                Assign to Designer
              </label>
              <Select value={selectedDesignerId} onValueChange={(val) => {
                setSelectedDesignerId(val);
                setSelectedVendorId("");
              }}>
                <SelectTrigger data-testid="select-bulk-assign-designer">
                  <SelectValue placeholder="Select a designer..." />
                </SelectTrigger>
                <SelectContent>
                  {assignableUsers.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.username}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {canAssignToVendor && (
              <>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">Or</span>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    Assign to Vendor Organization
                  </label>
                  <Select value={selectedVendorId} onValueChange={(val) => {
                    setSelectedVendorId(val);
                    setSelectedDesignerId("");
                  }}>
                    <SelectTrigger data-testid="select-bulk-assign-vendor">
                      <SelectValue placeholder="Select a vendor..." />
                    </SelectTrigger>
                    <SelectContent>
                      {vendorUsers.map((vendor) => (
                        <SelectItem key={vendor.id} value={vendor.id}>
                          {getVendorDisplayName(vendor)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            
            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setBulkAssignModalOpen(false);
                  setSelectedDesignerId("");
                  setSelectedVendorId("");
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (selectedDesignerId) {
                    bulkAssignMutation.mutate({
                      requestIds: Array.from(selectedRequests),
                      assignmentType: "designer",
                      targetId: selectedDesignerId,
                    });
                  } else if (selectedVendorId) {
                    bulkAssignMutation.mutate({
                      requestIds: Array.from(selectedRequests),
                      assignmentType: "vendor",
                      targetId: selectedVendorId,
                    });
                  }
                }}
                disabled={!selectedDesignerId && !selectedVendorId || bulkAssignMutation.isPending}
                data-testid="button-confirm-bulk-assign"
              >
                {bulkAssignMutation.isPending ? "Assigning..." : "Assign"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Job</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete job {jobToDelete?.type === "adhoc" ? "A" : "B"}-{jobToDelete?.id.slice(0, 5).toUpperCase()}? This action cannot be undone and will permanently remove this service request and all associated data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (jobToDelete) {
                  if (jobToDelete.type === "adhoc") {
                    deleteRequestMutation.mutate(jobToDelete.id);
                  } else {
                    deleteBundleRequestMutation.mutate(jobToDelete.id);
                  }
                }
                setDeleteModalOpen(false);
                setJobToDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
