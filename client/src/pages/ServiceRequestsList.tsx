import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { NavigationMenuSection } from "./sections/NavigationMenuSection";
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
import type { ServiceRequest, UpdateServiceRequest } from "@shared/schema";

async function fetchServiceRequests(): Promise<ServiceRequest[]> {
  const response = await fetch("/api/service-requests");
  if (!response.ok) {
    throw new Error("Failed to fetch service requests");
  }
  return response.json();
}

async function updateServiceRequestStatus(id: string, data: UpdateServiceRequest) {
  const response = await fetch(`/api/service-requests/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error("Failed to update service request");
  }
  return response.json();
}

const statusColors = {
  pending: "bg-yellow-100 text-yellow-800",
  "in-progress": "bg-blue-100 text-blue-800",
  "awaiting-approval": "bg-purple-100 text-purple-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
};

const statusLabels = {
  pending: "Pending",
  "in-progress": "In Progress",
  "awaiting-approval": "Awaiting Approval",
  completed: "Completed",
  cancelled: "Cancelled",
};

export default function ServiceRequestsList() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["service-requests"],
    queryFn: fetchServiceRequests,
  });

  const mutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateServiceRequest }) =>
      updateServiceRequestStatus(id, data),
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Request status updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["service-requests"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update request status",
        variant: "destructive",
      });
    },
  });

  const handleStatusChange = (id: string, newStatus: string) => {
    const updateData: UpdateServiceRequest = {
      status: newStatus,
      completedAt: newStatus === "completed" ? new Date() : undefined,
    };
    mutation.mutate({ id, data: updateData });
  };

  return (
    <main className="flex w-full max-w-[1440px] min-w-[1440px] min-h-screen bg-light-grey">
      <NavigationMenuSection />
      <div className="flex-1 p-8">
        <Card>
          <CardHeader>
            <CardTitle className="font-title-semibold text-dark-blue-night text-2xl">
              Service Requests
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">
                <p className="font-body-reg text-dark-gray">Loading requests...</p>
              </div>
            ) : requests.length === 0 ? (
              <div className="text-center py-8">
                <p className="font-body-reg text-dark-gray">No service requests found</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order #</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((request) => (
                    <TableRow key={request.id}>
                      <TableCell className="font-medium">
                        {request.orderNumber || "N/A"}
                      </TableCell>
                      <TableCell>{request.customerName || "N/A"}</TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        Service ID: {request.serviceId.substring(0, 8)}...
                      </TableCell>
                      <TableCell>{request.decorationMethod || "N/A"}</TableCell>
                      <TableCell>{request.quantity || "N/A"}</TableCell>
                      <TableCell>
                        {request.dueDate
                          ? new Date(request.dueDate).toLocaleDateString()
                          : "N/A"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            statusColors[request.status as keyof typeof statusColors] ||
                            "bg-gray-100 text-gray-800"
                          }
                        >
                          {statusLabels[request.status as keyof typeof statusLabels] ||
                            request.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(request.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={request.status}
                          onValueChange={(value) => handleStatusChange(request.id, value)}
                        >
                          <SelectTrigger className="w-[180px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="in-progress">In Progress</SelectItem>
                            <SelectItem value="awaiting-approval">
                              Awaiting Approval
                            </SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                            <SelectItem value="cancelled">Cancelled</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
