import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { format } from "date-fns";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Eye, Clock, RefreshCw, CheckCircle2, AlertCircle, UserCog, XCircle } from "lucide-react";
import type { ServiceRequest, Service, User } from "@shared/schema";

interface CurrentUser {
  userId: string;
  role: string;
  username: string;
}

// Check if user is a distributor/client (not designer)
function isDistributor(role: string | undefined): boolean {
  return role === "client" || role === "distributor";
}

const statusConfig: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  "pending": { label: "Pending", color: "bg-yellow-100 text-yellow-800 border-yellow-200", icon: Clock },
  "in-progress": { label: "In Progress", color: "bg-blue-100 text-blue-800 border-blue-200", icon: RefreshCw },
  "delivered": { label: "Delivered", color: "bg-green-100 text-green-800 border-green-200", icon: CheckCircle2 },
  "change-request": { label: "Change Request", color: "bg-orange-100 text-orange-800 border-orange-200", icon: AlertCircle },
  "canceled": { label: "Canceled", color: "bg-gray-100 text-gray-800 border-gray-200", icon: XCircle },
};

export default function ServiceRequestsList() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: currentUser, refetch: refetchUser } = useQuery<CurrentUser>({
    queryKey: ["/api/default-user"],
  });

  const { data: requests = [], isLoading: loadingRequests } = useQuery<ServiceRequest[]>({
    queryKey: ["/api/service-requests"],
  });

  const { data: services = [] } = useQuery<Service[]>({
    queryKey: ["/api/services"],
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const switchRoleMutation = useMutation({
    mutationFn: async (role: string) => {
      return apiRequest("POST", "/api/switch-role", { role });
    },
    onSuccess: async () => {
      await refetchUser();
      // Invalidate all relevant queries so they refetch with new session
      queryClient.invalidateQueries({ queryKey: ["/api/default-user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/service-requests"] });
      toast({ 
        title: "Role switched", 
        description: `You are now viewing as ${currentUser?.role === "designer" ? "Client" : "Designer"}` 
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to switch role", variant: "destructive" });
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
    // Check if the request has a calculated price in formData (for Store Creation)
    const formData = request.formData as Record<string, any> | null;
    if (formData?.calculatedPrice) {
      return `$${formData.calculatedPrice}`;
    }
    // Otherwise use the service's price range
    const service = services.find(s => s.id === request.serviceId);
    return service?.priceRange || "N/A";
  };

  const filteredRequests = requests.filter(r => {
    if (statusFilter === "all") return true;
    return r.status === statusFilter;
  });

  const handleSwitchRole = () => {
    const newRole = currentUser?.role === "designer" ? "client" : "designer";
    switchRoleMutation.mutate(newRole);
  };

  return (
    <main className="flex flex-col w-full min-h-screen bg-light-grey">
      <Header />
      <div className="flex-1 p-8">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <CardTitle className="font-title-semibold text-dark-blue-night text-2xl">
                Service Requests
              </CardTitle>
              <div className="flex items-center gap-4">
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
                <Link href="/">
                  <Button data-testid="button-new-request">New Request</Button>
                </Link>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loadingRequests ? (
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
    </main>
  );
}
