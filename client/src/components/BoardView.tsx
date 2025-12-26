import { useLocation } from "wouter";
import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Clock, RefreshCw, CheckCircle2, AlertCircle, XCircle, Calendar, User } from "lucide-react";
import type { ServiceRequest, Service, User as UserType, BundleRequest, Bundle } from "@shared/schema";

type RequestType = "adhoc" | "bundle";

interface BoardViewProps {
  requests: ServiceRequest[] | BundleRequest[];
  type: RequestType;
  services?: Service[];
  bundles?: Bundle[];
  users: UserType[];
  currentUserRole?: string;
  isLoading?: boolean;
}

const statusColumns = [
  { id: "pending", label: "Pending", icon: Clock, color: "bg-yellow-500" },
  { id: "in-progress", label: "In Progress", icon: RefreshCw, color: "bg-blue-500" },
  { id: "change-request", label: "Change Request", icon: AlertCircle, color: "bg-orange-500" },
  { id: "delivered", label: "Delivered", icon: CheckCircle2, color: "bg-green-500" },
  { id: "canceled", label: "Canceled", icon: XCircle, color: "bg-gray-500" },
];

function isDistributor(role: string | undefined): boolean {
  return role === "client" || role === "distributor";
}

export function BoardView({
  requests,
  type,
  services = [],
  bundles = [],
  users,
  currentUserRole,
  isLoading,
}: BoardViewProps) {
  const [, navigate] = useLocation();

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

  const getPrice = (request: ServiceRequest | BundleRequest) => {
    const formData = request.formData as Record<string, any> | null;
    if (formData?.calculatedPrice) {
      return `$${formData.calculatedPrice}`;
    }
    if (type === "adhoc") {
      const service = services.find((s) => s.id === (request as ServiceRequest).serviceId);
      return service?.priceRange || "N/A";
    } else {
      const bundle = bundles.find((b) => b.id === (request as BundleRequest).bundleId);
      return bundle?.finalPrice ? `$${bundle.finalPrice}` : "N/A";
    }
  };

  const getCustomerName = (request: ServiceRequest | BundleRequest) => {
    if (type === "adhoc") {
      return (request as ServiceRequest).customerName || "N/A";
    }
    const formData = request.formData as Record<string, any> | null;
    if (formData?.customerName) {
      return formData.customerName;
    }
    const user = users.find((u) => u.id === request.userId);
    return user?.username || "Unknown";
  };

  const handleCardClick = (request: ServiceRequest | BundleRequest) => {
    if (type === "adhoc") {
      navigate(`/jobs/${request.id}`);
    } else {
      navigate(`/bundle-jobs/${request.id}`);
    }
  };

  const getJobId = (request: ServiceRequest | BundleRequest) => {
    const prefix = type === "adhoc" ? "A" : "B";
    return `${prefix}-${request.id.slice(0, 5).toUpperCase()}`;
  };

  const getTitle = (request: ServiceRequest | BundleRequest) => {
    if (type === "adhoc") {
      return getServiceTitle((request as ServiceRequest).serviceId);
    }
    return getBundleName((request as BundleRequest).bundleId);
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
          const columnRequests = requests.filter((r) => r.status === column.id);

          return (
            <div
              key={column.id}
              className="flex flex-col w-[280px] min-w-[280px] bg-muted/30 rounded-lg"
              data-testid={`column-${column.id}`}
            >
              <div className="flex items-center gap-2 p-3 border-b">
                <div className={`w-2 h-2 rounded-full ${column.color}`} />
                <span className="font-medium text-sm">{column.label}</span>
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
                    columnRequests.map((request) => (
                      <Card
                        key={request.id}
                        className="p-3 cursor-pointer hover-elevate transition-all"
                        onClick={() => handleCardClick(request)}
                        data-testid={`card-request-${request.id}`}
                      >
                        <div className="flex flex-col gap-2">
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-xs font-medium text-sky-blue-accent">
                              {getJobId(request)}
                            </span>
                          </div>

                          <h4 className="font-medium text-sm line-clamp-2">
                            {getTitle(request)}
                          </h4>

                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <User className="h-3 w-3" />
                            <span className="truncate">{getCustomerName(request)}</span>
                          </div>

                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              <span>
                                {request.dueDate
                                  ? format(new Date(request.dueDate), "MMM dd")
                                  : "No due date"}
                              </span>
                            </div>
                            <span className="text-muted-foreground/70">
                              {format(new Date(request.createdAt), "MMM dd")}
                            </span>
                          </div>

                          <div className="flex items-center justify-between pt-1 border-t">
                            {isDistributor(currentUserRole) ? (
                              <span className="text-sm font-medium text-dark-blue-night">
                                {getPrice(request)}
                              </span>
                            ) : (
                              <div className="flex items-center gap-2">
                                <Avatar className="h-6 w-6">
                                  <AvatarFallback className="text-xs bg-muted">
                                    {getAssigneeInitials(request.assigneeId)}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                                  {getAssigneeName(request.assigneeId) || "Unassigned"}
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
