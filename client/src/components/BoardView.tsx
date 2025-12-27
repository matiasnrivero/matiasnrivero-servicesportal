import { useLocation } from "wouter";
import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Calendar, User } from "lucide-react";
import { calculateServicePrice } from "@/lib/pricing";
import { getBoardColumns, getDisplayStatus, statusConfig, type DisplayStatus } from "@/lib/statusUtils";
import type { ServiceRequest, Service, User as UserType, BundleRequest, Bundle } from "@shared/schema";

type RequestType = "adhoc" | "bundle";

interface CombinedBoardRequest {
  id: string;
  type: RequestType;
  status: string;
  displayStatus: DisplayStatus;
  dueDate: Date | null;
  createdAt: Date;
  assigneeId: string | null;
  vendorAssigneeId: string | null;
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

  // Get role-based columns
  const columnStatuses = getBoardColumns(currentUserRole || "client");
  
  // Combine adhoc and bundle requests
  const combinedRequests: CombinedBoardRequest[] = [
    ...requests.map(r => ({
      id: r.id,
      type: "adhoc" as RequestType,
      status: r.status,
      displayStatus: getDisplayStatus(r.status, r.assigneeId, r.vendorAssigneeId, currentUserRole),
      dueDate: r.dueDate,
      createdAt: r.createdAt,
      assigneeId: r.assigneeId,
      vendorAssigneeId: r.vendorAssigneeId ?? null,
      originalRequest: r,
    })),
    ...bundleRequests.map(r => ({
      id: r.id,
      type: "bundle" as RequestType,
      status: r.status,
      displayStatus: getDisplayStatus(r.status, r.assigneeId, r.vendorAssigneeId, currentUserRole),
      dueDate: r.dueDate,
      createdAt: r.createdAt,
      assigneeId: r.assigneeId,
      vendorAssigneeId: r.vendorAssigneeId ?? null,
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
        {columnStatuses.map((columnStatus) => {
          const config = statusConfig[columnStatus];
          const StatusIcon = config.icon;
          const columnRequests = combinedRequests.filter((r) => r.displayStatus === columnStatus);

          return (
            <div
              key={columnStatus}
              className="flex flex-col w-[280px] min-w-[280px] bg-muted/30 rounded-lg"
              data-testid={`column-${columnStatus}`}
            >
              <div className="flex items-center gap-2 p-3 border-b">
                <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md border ${config.color}`}>
                  <StatusIcon className="h-3.5 w-3.5" />
                  <span className="font-medium text-xs uppercase tracking-wide">{config.label}</span>
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
