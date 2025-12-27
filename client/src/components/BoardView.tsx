import { useLocation } from "wouter";
import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Clock, RefreshCw, CheckCircle2, AlertCircle, XCircle, Calendar, User } from "lucide-react";
import { calculateServicePrice } from "@/lib/pricing";
import type { ServiceRequest, Service, User as UserType, BundleRequest, Bundle } from "@shared/schema";

type RequestType = "adhoc" | "bundle";

interface CombinedBoardRequest {
  id: string;
  type: RequestType;
  status: string;
  dueDate: Date | null;
  createdAt: Date;
  assigneeId: string | null;
  originalRequest: ServiceRequest | BundleRequest;
}

interface BoardViewProps {
  requests: ServiceRequest[];
  bundleRequests?: BundleRequest[];
  type?: RequestType;
  services?: Service[];
  bundles?: Bundle[];
  users: UserType[];
  currentUserRole?: string;
  isLoading?: boolean;
}

const statusColumns = [
  { id: "pending", label: "Pending", icon: Clock, bgColor: "bg-yellow-100 dark:bg-yellow-900/30", textColor: "text-yellow-700 dark:text-yellow-400", borderColor: "border-yellow-300 dark:border-yellow-700" },
  { id: "in-progress", label: "In Progress", icon: RefreshCw, bgColor: "bg-blue-100 dark:bg-blue-900/30", textColor: "text-blue-700 dark:text-blue-400", borderColor: "border-blue-300 dark:border-blue-700" },
  { id: "change-request", label: "Change Request", icon: AlertCircle, bgColor: "bg-orange-100 dark:bg-orange-900/30", textColor: "text-orange-700 dark:text-orange-400", borderColor: "border-orange-300 dark:border-orange-700" },
  { id: "delivered", label: "Delivered", icon: CheckCircle2, bgColor: "bg-green-100 dark:bg-green-900/30", textColor: "text-green-700 dark:text-green-400", borderColor: "border-green-300 dark:border-green-700" },
  { id: "canceled", label: "Canceled", icon: XCircle, bgColor: "bg-gray-100 dark:bg-gray-800/30", textColor: "text-gray-600 dark:text-gray-400", borderColor: "border-gray-300 dark:border-gray-600" },
];

function isDistributor(role: string | undefined): boolean {
  return role === "client" || role === "distributor";
}

export function BoardView({
  requests,
  bundleRequests = [],
  services = [],
  bundles = [],
  users,
  currentUserRole,
  isLoading,
}: BoardViewProps) {
  const [, navigate] = useLocation();

  // Combine adhoc and bundle requests
  const combinedRequests: CombinedBoardRequest[] = [
    ...requests.map(r => ({
      id: r.id,
      type: "adhoc" as RequestType,
      status: r.status,
      dueDate: r.dueDate,
      createdAt: r.createdAt,
      assigneeId: r.assigneeId,
      originalRequest: r,
    })),
    ...bundleRequests.map(r => ({
      id: r.id,
      type: "bundle" as RequestType,
      status: r.status,
      dueDate: r.dueDate,
      createdAt: r.createdAt,
      assigneeId: r.assigneeId,
      originalRequest: r,
    })),
  ];

  const getServiceTitle = (serviceId: string) => {
    const service = services.find((s) => s.id === serviceId);
    return service?.title || "Unknown Service";
  };

  const getBundleName = (bundleId: string) => {
    const bundle = bundles.find((b) => b.id === bundleId);
    return bundle?.name || "Unknown Bundle";
  };

  const getAssigneeName = (assigneeId: string | null) => {
    if (!assigneeId) return null;
    const user = users.find((u) => u.id === assigneeId);
    return user?.username || "Unknown";
  };

  const getAssigneeInitials = (assigneeId: string | null) => {
    if (!assigneeId) return "?";
    const user = users.find((u) => u.id === assigneeId);
    if (!user) return "?";
    return user.username.slice(0, 2).toUpperCase();
  };

  const getPrice = (item: CombinedBoardRequest) => {
    const formData = item.originalRequest.formData as Record<string, any> | null;
    
    if (item.type === "adhoc") {
      const serviceRequest = item.originalRequest as ServiceRequest;
      const service = services.find((s) => s.id === serviceRequest.serviceId);
      
      return calculateServicePrice({
        serviceTitle: service?.title,
        pricingStructure: service?.pricingStructure,
        basePrice: service?.basePrice,
        formData,
        finalPrice: serviceRequest.finalPrice,
      });
    } else {
      const bundleRequest = item.originalRequest as BundleRequest;
      const bundle = bundles.find((b) => b.id === bundleRequest.bundleId);
      return bundle?.finalPrice ? `$${bundle.finalPrice}` : "N/A";
    }
  };

  const getCustomerName = (item: CombinedBoardRequest) => {
    if (item.type === "adhoc") {
      return (item.originalRequest as ServiceRequest).customerName || "N/A";
    }
    const formData = item.originalRequest.formData as Record<string, any> | null;
    if (formData?.customerName) {
      return formData.customerName;
    }
    const user = users.find((u) => u.id === item.originalRequest.userId);
    return user?.username || "Unknown";
  };

  const handleCardClick = (item: CombinedBoardRequest) => {
    if (item.type === "adhoc") {
      navigate(`/jobs/${item.id}`);
    } else {
      navigate(`/bundle-jobs/${item.id}`);
    }
  };

  const getJobId = (item: CombinedBoardRequest) => {
    const prefix = item.type === "adhoc" ? "A" : "B";
    return `${prefix}-${item.id.slice(0, 5).toUpperCase()}`;
  };

  const getTitle = (item: CombinedBoardRequest) => {
    if (item.type === "adhoc") {
      return getServiceTitle((item.originalRequest as ServiceRequest).serviceId);
    }
    return getBundleName((item.originalRequest as BundleRequest).bundleId);
  };

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <p className="font-body-reg text-dark-gray">Loading requests...</p>
      </div>
    );
  }

  return (
    <ScrollArea className="w-full">
      <div className="flex gap-4 pb-4 min-w-max">
        {statusColumns.map((column) => {
          const StatusIcon = column.icon;
          const columnRequests = combinedRequests.filter((r) => r.status === column.id);

          return (
            <div
              key={column.id}
              className="flex flex-col w-[280px] min-w-[280px] bg-muted/30 rounded-lg"
              data-testid={`column-${column.id}`}
            >
              <div className="flex items-center gap-2 p-3 border-b">
                <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md border ${column.bgColor} ${column.textColor} ${column.borderColor}`}>
                  <StatusIcon className="h-3.5 w-3.5" />
                  <span className="font-medium text-xs uppercase tracking-wide">{column.label}</span>
                </div>
                <Badge variant="secondary" className="ml-auto text-xs">
                  {columnRequests.length}
                </Badge>
              </div>

              <ScrollArea className="flex-1 p-2" style={{ maxHeight: "calc(100vh - 320px)" }}>
                <div className="flex flex-col gap-2">
                  {columnRequests.length === 0 ? (
                    <div className="text-center py-4 text-muted-foreground text-sm">
                      No requests
                    </div>
                  ) : (
                    columnRequests.map((item) => (
                      <Card
                        key={`${item.type}-${item.id}`}
                        className="p-3 cursor-pointer hover-elevate transition-all bg-white dark:bg-card"
                        onClick={() => handleCardClick(item)}
                        data-testid={`card-request-${item.id}`}
                      >
                        <div className="flex flex-col gap-2">
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-xs font-medium text-sky-blue-accent">
                              {getJobId(item)}
                            </span>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {item.type === "adhoc" ? "Ad-hoc" : "Bundle"}
                            </Badge>
                          </div>

                          <h4 className="font-medium text-sm line-clamp-2">
                            {getTitle(item)}
                          </h4>

                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <User className="h-3 w-3" />
                            <span className="truncate">{getCustomerName(item)}</span>
                          </div>

                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              <span>
                                {item.dueDate
                                  ? format(new Date(item.dueDate), "MMM dd")
                                  : "No due date"}
                              </span>
                            </div>
                            <span className="text-muted-foreground/70">
                              {format(new Date(item.createdAt), "MMM dd")}
                            </span>
                          </div>

                          <div className="flex items-center justify-between pt-1 border-t">
                            {isDistributor(currentUserRole) ? (
                              <span className="text-sm font-medium text-dark-blue-night">
                                {getPrice(item)}
                              </span>
                            ) : (
                              <div className="flex items-center gap-2">
                                <Avatar className="h-6 w-6">
                                  <AvatarFallback className="text-xs bg-muted">
                                    {getAssigneeInitials(item.assigneeId)}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                                  {getAssigneeName(item.assigneeId) || "Unassigned"}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </Card>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
          );
        })}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}
