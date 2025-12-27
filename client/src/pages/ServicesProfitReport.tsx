import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { format } from "date-fns";
import { Header } from "@/components/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { ChevronLeft, CalendarIcon, Search, DollarSign, TrendingUp, BarChart3, X, ChevronDown, Clock, RefreshCw, CheckCircle2, AlertCircle, XCircle } from "lucide-react";
import { calculateServicePrice } from "@/lib/pricing";
import type { ServiceRequest, Service, User, VendorProfile, ServicePricingTier, BundleRequest, Bundle, VendorBundleCost } from "@shared/schema";

interface CurrentUser {
  userId: string;
  role: string;
  username: string;
}

type ServiceMethod = "ad_hoc" | "bundle";

const PIXELS_HIVE_VENDOR_ID = "9903d7f7-2754-41a0-872f-62863489b22c";

const statusConfig: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  "pending": { label: "Pending", color: "bg-yellow-100 text-yellow-800 border-yellow-200", icon: Clock },
  "in-progress": { label: "In Progress", color: "bg-blue-100 text-blue-800 border-blue-200", icon: RefreshCw },
  "delivered": { label: "Delivered", color: "bg-green-100 text-green-800 border-green-200", icon: CheckCircle2 },
  "change-request": { label: "Change Request", color: "bg-orange-100 text-orange-800 border-orange-200", icon: AlertCircle },
  "canceled": { label: "Canceled", color: "bg-gray-100 text-gray-800 border-gray-200", icon: XCircle },
};

interface ReportRow {
  requestId: string;
  jobNumber: string;
  clientName: string;
  clientId: string;
  serviceName: string;
  serviceMethod: ServiceMethod;
  status: string;
  assigneeName: string;
  assigneeRole: string;
  vendorId: string | null;
  vendorName: string | null;
  retailPrice: number;
  vendorCost: number;
  discount: number;
  profit: number;
  createdAt: Date;
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

export default function ServicesProfitReport() {
  const [vendorFilter, setVendorFilter] = useState<string>("all");
  const [serviceFilter, setServiceFilter] = useState<string>("all");
  const [serviceMethodFilter, setServiceMethodFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [selectedClients, setSelectedClients] = useState<string[]>([]);
  const [searchJobId, setSearchJobId] = useState("");

  const { data: currentUser } = useQuery<CurrentUser>({
    queryKey: ["/api/default-user"],
  });

  const { data: requests = [], isLoading: loadingRequests } = useQuery<ServiceRequest[]>({
    queryKey: ["/api/service-requests"],
  });

  const { data: bundleRequests = [], isLoading: loadingBundleRequests } = useQuery<BundleRequest[]>({
    queryKey: ["/api/bundle-requests"],
  });

  const { data: bundles = [] } = useQuery<Bundle[]>({
    queryKey: ["/api/bundles"],
  });

  const { data: vendorBundleCosts = [] } = useQuery<VendorBundleCost[]>({
    queryKey: ["/api/vendor-bundle-costs"],
  });

  const { data: services = [] } = useQuery<Service[]>({
    queryKey: ["/api/services", "includeAll"],
    queryFn: async () => {
      const res = await fetch("/api/services?excludeSons=false");
      if (!res.ok) throw new Error("Failed to fetch services");
      return res.json();
    },
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const { data: vendorProfiles = [] } = useQuery<VendorProfile[]>({
    queryKey: ["/api/vendor-profiles"],
  });

  const { data: allTiers = [] } = useQuery<ServicePricingTier[]>({
    queryKey: ["/api/service-pricing-tiers"],
  });

  const isAdmin = currentUser?.role === "admin";

  const serviceMap = useMemo(() => {
    const map: Record<string, Service> = {};
    services.forEach(s => { map[s.id] = s; });
    return map;
  }, [services]);

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

  const bundleMap = useMemo(() => {
    const map: Record<string, Bundle> = {};
    bundles.forEach(b => { map[b.id] = b; });
    return map;
  }, [bundles]);

  const vendorBundleCostMap = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    vendorBundleCosts.forEach(vbc => {
      if (!map[vbc.vendorId]) map[vbc.vendorId] = {};
      map[vbc.vendorId][vbc.bundleId] = parseFloat(String(vbc.cost));
    });
    return map;
  }, [vendorBundleCosts]);

  const tiersByService = useMemo(() => {
    const map: Record<string, ServicePricingTier[]> = {};
    allTiers.forEach(tier => {
      if (!map[tier.serviceId]) map[tier.serviceId] = [];
      map[tier.serviceId].push(tier);
    });
    for (const serviceId in map) {
      map[serviceId].sort((a, b) => a.sortOrder - b.sortOrder);
    }
    return map;
  }, [allTiers]);

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

  const calculateVendorCost = (
    request: ServiceRequest,
    service: Service | undefined,
    assignee: User | undefined
  ): number => {
    if (!service || !assignee) return 0;
    
    if (assignee.role === "internal_designer") {
      return 0;
    }
    
    const vendorUserId = assignee.role === "vendor" ? assignee.id : assignee.vendorId;
    if (!vendorUserId) return 0;
    
    const vendorProfile = vendorProfileMap[vendorUserId];
    if (!vendorProfile) return 0;
    
    const pricingAgreements = vendorProfile.pricingAgreements as Record<string, {
      basePrice?: number;
      complexity?: Record<string, number>;
      quantity?: Record<string, number>;
    }> | null;
    
    if (!pricingAgreements) return 0;
    
    const servicePricing = pricingAgreements[service.title];
    if (!servicePricing) return 0;
    
    const formData = request.formData as Record<string, unknown> | null;
    const pricingStructure = service.pricingStructure || "single";
    
    if (pricingStructure === "complexity" && servicePricing.complexity) {
      const complexity = (formData?.complexity || formData?.designComplexity) as string | undefined;
      if (complexity) {
        const complexityLower = complexity.toLowerCase();
        for (const [tierKey, price] of Object.entries(servicePricing.complexity)) {
          if (tierKey.toLowerCase() === complexityLower) {
            return price;
          }
        }
      }
    }
    
    if (pricingStructure === "quantity" && servicePricing.quantity) {
      const quantity = parseInt(String(formData?.amount_of_products || formData?.amountOfProducts || formData?.quantity || 0));
      if (quantity > 0) {
        let matchedPrice: number | null = null;
        let matchedMinForUnbounded = -1;
        
        for (const [tierLabel, tierPrice] of Object.entries(servicePricing.quantity)) {
          const rangeMatch = tierLabel.match(/(\d+)\s*-\s*(\d+)/);
          if (rangeMatch) {
            const min = parseInt(rangeMatch[1]);
            const max = parseInt(rangeMatch[2]);
            if (quantity >= min && quantity <= max) {
              return quantity * tierPrice;
            }
          }
          
          const plusMatch = tierLabel.match(/(\d+)\+/);
          if (plusMatch) {
            const min = parseInt(plusMatch[1]);
            if (quantity >= min && min > matchedMinForUnbounded) {
              matchedMinForUnbounded = min;
              matchedPrice = tierPrice;
            }
          }
          
          const greaterMatch = tierLabel.match(/>(\d+)/);
          if (greaterMatch) {
            const min = parseInt(greaterMatch[1]);
            if (quantity > min && min > matchedMinForUnbounded) {
              matchedMinForUnbounded = min;
              matchedPrice = tierPrice;
            }
          }
        }
        
        if (matchedPrice !== null) {
          return quantity * matchedPrice;
        }
      }
    }
    
    return servicePricing.basePrice || 0;
  };

  const calculateBundleVendorCost = (
    bundleRequest: BundleRequest
  ): number => {
    const vendorCosts = vendorBundleCostMap[PIXELS_HIVE_VENDOR_ID];
    if (!vendorCosts) return 0;
    
    return vendorCosts[bundleRequest.bundleId] || 0;
  };

  const reportData = useMemo((): ReportRow[] => {
    const rows: ReportRow[] = [];

    requests.forEach(request => {
      const service = serviceMap[request.serviceId];
      const client = userMap[request.userId];
      const assignee = request.assigneeId ? userMap[request.assigneeId] : undefined;
      const createdBy = userMap[request.userId];
      
      let retailPrice = 0;
      if (createdBy?.role === "admin") {
        retailPrice = 0;
      } else if (request.finalPrice) {
        retailPrice = parseFloat(String(request.finalPrice));
      } else if (service) {
        const formData = request.formData as Record<string, unknown> | null;
        const priceStr = calculateServicePrice({
          serviceTitle: service.title,
          pricingStructure: service.pricingStructure || "single",
          basePrice: service.basePrice,
          formData: formData as Record<string, any> | null,
          finalPrice: null,
        });
        if (priceStr !== "N/A") {
          retailPrice = parseFloat(priceStr.replace("$", ""));
        }
      }
      
      const vendorCost = calculateVendorCost(request, service, assignee);
      const discount = 0;
      const profit = retailPrice - vendorCost - discount;
      
      let vendorId: string | null = null;
      let vendorName: string | null = null;
      if (assignee) {
        if (assignee.role === "vendor") {
          vendorId = assignee.id;
          const vp = vendorProfileMap[assignee.id];
          vendorName = vp?.companyName || assignee.username;
        } else if (assignee.role === "vendor_designer" && assignee.vendorId) {
          vendorId = assignee.vendorId;
          const vp = vendorProfileMap[assignee.vendorId];
          vendorName = vp?.companyName || null;
        }
      }
      
      const idPart = request.id.slice(0, 5).toUpperCase();
      const jobNumber = `A-${idPart}`;
      
      rows.push({
        requestId: request.id,
        jobNumber,
        clientName: client?.username || "Unknown",
        clientId: request.userId,
        serviceName: service?.title || "Unknown Service",
        serviceMethod: "ad_hoc",
        status: request.status,
        assigneeName: assignee?.username || "Unassigned",
        assigneeRole: assignee?.role || "",
        vendorId,
        vendorName,
        retailPrice,
        vendorCost,
        discount,
        profit,
        createdAt: new Date(request.createdAt),
      });
    });

    bundleRequests.forEach(bundleRequest => {
      const bundle = bundleMap[bundleRequest.bundleId];
      const client = userMap[bundleRequest.userId];
      const createdBy = userMap[bundleRequest.userId];
      
      let retailPrice = 0;
      if (createdBy?.role === "admin") {
        retailPrice = 0;
      } else if (bundle?.finalPrice) {
        retailPrice = parseFloat(String(bundle.finalPrice));
      }
      
      const vendorCost = calculateBundleVendorCost(bundleRequest);
      const discount = 0;
      const profit = retailPrice - vendorCost - discount;
      
      const vendorId = PIXELS_HIVE_VENDOR_ID;
      const vp = vendorProfileMap[PIXELS_HIVE_VENDOR_ID];
      const vendorName = vp?.companyName || "Pixel's Hive";
      
      const idPart = bundleRequest.id.slice(0, 5).toUpperCase();
      const jobNumber = `B-${idPart}`;
      
      rows.push({
        requestId: bundleRequest.id,
        jobNumber,
        clientName: client?.username || "Unknown",
        clientId: bundleRequest.userId,
        serviceName: bundle?.name || "Unknown Bundle",
        serviceMethod: "bundle",
        status: bundleRequest.status,
        assigneeName: "Unassigned",
        assigneeRole: "",
        vendorId,
        vendorName,
        retailPrice,
        vendorCost,
        discount,
        profit,
        createdAt: new Date(bundleRequest.createdAt),
      });
    });

    return rows;
  }, [requests, bundleRequests, serviceMap, userMap, vendorProfileMap, bundleMap, tiersByService, vendorBundleCostMap]);

  const filteredData = useMemo(() => {
    return reportData.filter(row => {
      if (vendorFilter !== "all") {
        if (row.vendorId !== vendorFilter) return false;
      }
      
      if (serviceFilter !== "all") {
        if (serviceFilter.startsWith("service:")) {
          const serviceId = serviceFilter.replace("service:", "");
          const service = services.find(s => s.id === serviceId);
          if (row.serviceName !== service?.title) return false;
        } else if (serviceFilter.startsWith("bundle:")) {
          const bundleId = serviceFilter.replace("bundle:", "");
          const bundle = bundles.find(b => b.id === bundleId);
          if (row.serviceName !== bundle?.name) return false;
        }
      }

      if (serviceMethodFilter !== "all") {
        if (row.serviceMethod !== serviceMethodFilter) return false;
      }
      
      if (dateFrom && row.createdAt < dateFrom) return false;
      if (dateTo) {
        const endOfDay = new Date(dateTo);
        endOfDay.setHours(23, 59, 59, 999);
        if (row.createdAt > endOfDay) return false;
      }
      
      if (selectedClients.length > 0 && !selectedClients.includes(row.clientId)) {
        return false;
      }
      
      if (searchJobId && !row.jobNumber.toLowerCase().includes(searchJobId.toLowerCase()) && 
          !row.requestId.toLowerCase().includes(searchJobId.toLowerCase())) {
        return false;
      }
      
      return true;
    });
  }, [reportData, vendorFilter, serviceFilter, serviceMethodFilter, dateFrom, dateTo, selectedClients, searchJobId, services, bundles]);

  const totals = useMemo(() => {
    return filteredData.reduce(
      (acc, row) => ({
        retailPrice: acc.retailPrice + row.retailPrice,
        vendorCost: acc.vendorCost + row.vendorCost,
        discount: acc.discount + row.discount,
        profit: acc.profit + row.profit,
      }),
      { retailPrice: 0, vendorCost: 0, discount: 0, profit: 0 }
    );
  }, [filteredData]);

  const profitMargin = totals.retailPrice > 0 
    ? ((totals.profit / totals.retailPrice) * 100).toFixed(1) 
    : "0.0";

  const isLoading = loadingRequests || loadingBundleRequests;

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-dark-gray">
                You don't have permission to view this report.
              </p>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/reports">
            <Button variant="ghost" size="icon" data-testid="button-back-reports">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-dark-blue-night" data-testid="text-report-title">
              Services Profit Report ({filteredData.length} jobs)
            </h1>
            <p className="text-dark-gray text-sm mt-1">
              Analyze retail prices, vendor costs, and profit margins
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-green-100">
                  <DollarSign className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-dark-gray">Total Revenue</p>
                  <p className="text-xl font-bold text-dark-blue-night" data-testid="text-total-revenue">
                    ${totals.retailPrice.toFixed(2)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-orange-100">
                  <BarChart3 className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm text-dark-gray">Vendor Costs</p>
                  <p className="text-xl font-bold text-dark-blue-night" data-testid="text-total-vendor-cost">
                    ${totals.vendorCost.toFixed(2)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-purple-100">
                  <TrendingUp className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-dark-gray">Net Profit</p>
                  <p className="text-xl font-bold text-dark-blue-night" data-testid="text-total-profit">
                    ${totals.profit.toFixed(2)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-blue-100">
                  <BarChart3 className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-dark-gray">Profit Margin</p>
                  <p className="text-xl font-bold text-dark-blue-night" data-testid="text-profit-margin">
                    {profitMargin}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-4">
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

              <MultiSelectClientFilter
                options={clientOptions}
                selected={selectedClients}
                onChange={setSelectedClients}
              />

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

            {(vendorFilter !== "all" || serviceFilter !== "all" || serviceMethodFilter !== "all" || dateFrom || dateTo || selectedClients.length > 0 || searchJobId) && (
              <div className="mt-4 flex items-center gap-2">
                <span className="text-sm text-dark-gray">Active filters:</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setVendorFilter("all");
                    setServiceFilter("all");
                    setServiceMethodFilter("all");
                    setDateFrom(undefined);
                    setDateTo(undefined);
                    setSelectedClients([]);
                    setSearchJobId("");
                  }}
                  data-testid="button-clear-filters"
                >
                  Clear all
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 overflow-x-auto">
            {isLoading ? (
              <div className="py-8 text-center text-dark-gray">Loading...</div>
            ) : filteredData.length === 0 ? (
              <div className="py-8 text-center text-dark-gray">No data matches your filters.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job ID</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead className="text-right">Retail Price</TableHead>
                    <TableHead className="text-right">Vendor Cost</TableHead>
                    <TableHead className="text-right">Discount</TableHead>
                    <TableHead className="text-right">Profit</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.map((row) => (
                    <TableRow key={`${row.serviceMethod}-${row.requestId}`} data-testid={`row-job-${row.requestId}`}>
                      <TableCell>
                        <Link href={row.serviceMethod === "bundle" ? `/bundle-jobs/${row.requestId}?from=profit-report` : `/jobs/${row.requestId}?from=profit-report`}>
                          <Button variant="link" className="p-0 h-auto text-sky-blue-accent" data-testid={`link-job-${row.requestId}`}>
                            {row.jobNumber}
                          </Button>
                        </Link>
                      </TableCell>
                      <TableCell>{row.clientName}</TableCell>
                      <TableCell>{row.serviceName}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Badge variant="outline" className="text-xs">
                          {row.serviceMethod === "ad_hoc" ? "Ad-hoc" : "Bundle"}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {(() => {
                          const config = statusConfig[row.status] || { label: row.status, color: "bg-gray-100 text-gray-800 border-gray-200", icon: Clock };
                          const StatusIcon = config.icon;
                          return (
                            <Badge variant="outline" className={`text-xs border ${config.color}`}>
                              <StatusIcon className="w-3 h-3 mr-1" />
                              {config.label}
                            </Badge>
                          );
                        })()}
                      </TableCell>
                      <TableCell>{row.vendorName || "-"}</TableCell>
                      <TableCell className="text-right">
                        {row.retailPrice === 0 && row.assigneeRole !== "internal_designer" ? (
                          <span className="text-dark-gray">$0.00</span>
                        ) : (
                          <span className="text-green-600">${row.retailPrice.toFixed(2)}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.vendorCost === 0 ? (
                          <span className="text-dark-gray">$0.00</span>
                        ) : (
                          <span className="text-orange-600">${row.vendorCost.toFixed(2)}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-dark-gray">
                        ${row.discount.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={row.profit >= 0 ? "text-purple-600 font-medium" : "text-red-600 font-medium"}>
                          ${row.profit.toFixed(2)}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-dark-gray">
                        {format(row.createdAt, "MMM d, yyyy")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
