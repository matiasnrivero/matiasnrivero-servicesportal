import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Header } from "@/components/Header";
import { FileUploader } from "@/components/FileUploader";
import { ArrowLeft, Package, Loader2, User, Calendar, CheckCircle, Clock, AlertCircle, Download, Users, RefreshCw, XCircle, CheckCircle2 } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import type { Bundle, BundleRequest, User as UserType, Service, InputField } from "@shared/schema";

interface EnrichedField {
  id: string;
  inputFieldId: string;
  inputField: InputField | null;
  defaultValue: any;
  value: any;
  displayLabelOverride?: string | null;
  helpTextOverride?: string | null;
}

interface EnrichedBundleField {
  id: string;
  inputFieldId: string;
  inputField: InputField | null;
  defaultValue: any;
  value: any;
  displayLabelOverride?: string | null;
}

interface LineItemField {
  id: string;
  inputFieldId: string;
  inputField: InputField | null;
  lineItem: { id: string; name: string };
  value: any;
}

interface ServiceWithFields {
  bundleItemId: string;
  serviceId: string;
  service: Service;
  fields: EnrichedField[];
  lineItemFields: LineItemField[];
}

interface BundleRequestFullDetail {
  request: BundleRequest;
  bundle: Bundle;
  bundleFields: EnrichedBundleField[];
  services: ServiceWithFields[];
  attachments: Array<{ id: string; fileName: string; fileUrl: string; kind: string }>;
  comments: Array<{ id: string; body: string; authorId: string; createdAt: string }>;
  requester: UserType | null;
  assignee: UserType | null;
}

interface CurrentUser {
  userId: string;
  role: string;
  username: string;
}

async function fetchBundleRequestDetail(id: string): Promise<BundleRequestFullDetail> {
  const response = await fetch(`/api/bundle-requests/${id}/full-detail`);
  if (!response.ok) {
    throw new Error("Failed to fetch bundle request detail");
  }
  return response.json();
}

async function fetchDesigners(): Promise<UserType[]> {
  const response = await fetch("/api/users?role=internal_designer,vendor_designer");
  if (!response.ok) {
    throw new Error("Failed to fetch designers");
  }
  return response.json();
}

async function getDefaultUser(): Promise<CurrentUser> {
  const response = await fetch("/api/default-user");
  if (!response.ok) {
    throw new Error("Failed to get default user");
  }
  return response.json();
}

const statusConfig: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  "pending": { label: "Pending", color: "bg-yellow-100 text-yellow-800 border-yellow-200", icon: Clock },
  "in-progress": { label: "In Progress", color: "bg-blue-100 text-blue-800 border-blue-200", icon: RefreshCw },
  "delivered": { label: "Delivered", color: "bg-green-100 text-green-800 border-green-200", icon: CheckCircle2 },
  "change-request": { label: "Change Request", color: "bg-orange-100 text-orange-800 border-orange-200", icon: AlertCircle },
  "canceled": { label: "Canceled", color: "bg-gray-100 text-gray-800 border-gray-200", icon: XCircle },
};

export default function BundleRequestDetail() {
  const params = useParams<{ id: string }>();
  const requestId = params.id;
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [selectedAssignee, setSelectedAssignee] = useState<string>("");

  const { data: requestDetail, isLoading, error } = useQuery({
    queryKey: ["/api/bundle-requests", requestId, "full-detail"],
    queryFn: () => fetchBundleRequestDetail(requestId!),
    enabled: !!requestId,
  });

  const { data: designers } = useQuery({
    queryKey: ["/api/users", "designers"],
    queryFn: fetchDesigners,
  });

  const { data: currentUser } = useQuery<CurrentUser>({
    queryKey: ["/api/default-user"],
    queryFn: getDefaultUser,
  });

  const assignMutation = useMutation({
    mutationFn: async (assigneeId: string) => {
      const response = await fetch(`/api/bundle-requests/${requestId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigneeId }),
      });
      if (!response.ok) throw new Error("Failed to assign designer");
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Designer Assigned", description: "The request has been assigned." });
      queryClient.invalidateQueries({ queryKey: ["/api/bundle-requests", requestId] });
      queryClient.invalidateQueries({ queryKey: ["/api/bundle-requests"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to assign designer.", variant: "destructive" });
    },
  });

  const deliverMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/bundle-requests/${requestId}/deliver`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) throw new Error("Failed to deliver request");
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Request Delivered", description: "The request has been marked as delivered." });
      queryClient.invalidateQueries({ queryKey: ["/api/bundle-requests", requestId] });
      queryClient.invalidateQueries({ queryKey: ["/api/bundle-requests"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to deliver request.", variant: "destructive" });
    },
  });


  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (error || !requestDetail) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="max-w-4xl mx-auto px-4 py-8">
          <Card>
            <CardContent className="py-8">
              <div className="text-center">
                <p className="text-destructive mb-4">
                  {error?.message || "Request not found"}
                </p>
                <Link href="/service-requests">
                  <Button data-testid="button-back">Back to Requests</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const { request, bundle, bundleFields, services, attachments, requester, assignee } = requestDetail;
  const canManageJobs = ["admin", "internal_designer", "vendor", "vendor_designer", "designer"].includes(currentUser?.role || "");
  const canTakeJob = ["admin", "internal_designer", "designer", "vendor_designer"].includes(currentUser?.role || "") && request.status === "pending" && !request.assigneeId;
  const canDeliver = canManageJobs && request.status !== "delivered";

  const renderFieldValue = (value: any): React.ReactNode => {
    if (value === null || value === undefined) return "Not provided";
    if (Array.isArray(value)) {
      if (value.length > 0 && value[0]?.url && value[0]?.fileName) {
        return (
          <div className="flex flex-col gap-2">
            {value.map((file: { url: string; fileName: string }, idx: number) => (
              <div key={idx} className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                <span className="text-sm flex-1 truncate">{file.fileName}</span>
                <a href={file.url} target="_blank" rel="noopener noreferrer">
                  <Button size="sm" variant="default" data-testid={`button-download-file-${idx}`}>
                    <Download className="h-3 w-3 mr-1" />
                    Download
                  </Button>
                </a>
              </div>
            ))}
          </div>
        );
      }
      return value.join(", ");
    }
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };

  return (
    <div className="min-h-screen bg-off-white-cream">
      <Header />
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4 flex-wrap">
            <Link href="/service-requests">
              <Button variant="outline" data-testid="button-back">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
            </Link>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold text-dark-blue-night" data-testid="text-bundle-name">
                  {bundle.name}
                </h1>
                <Badge variant="outline" className="text-sm" data-testid="text-job-id">
                  B-{request.id.slice(0, 5).toUpperCase()}
                </Badge>
                <Badge className={`${statusConfig[request.status]?.color || ""}`} data-testid="badge-status">
                  {(() => {
                    const StatusIcon = statusConfig[request.status]?.icon || Clock;
                    return (
                      <>
                        <StatusIcon className="h-3 w-3 mr-1" />
                        {statusConfig[request.status]?.label || request.status}
                      </>
                    );
                  })()}
                </Badge>
              </div>
              <p className="text-sm text-dark-gray mt-1" data-testid="text-created-date">
                Created on {request.createdAt ? format(new Date(request.createdAt), "MMMM do, yyyy") : "N/A"}
                {request.deliveredAt && (
                  <span className="ml-2">
                    • Delivered on {format(new Date(request.deliveredAt), "MMMM do, yyyy")}
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">

            {bundleFields && bundleFields.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">General Information</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {bundleFields.map((bf) => (
                      <div key={bf.id} className="flex flex-col gap-1">
                        <Label className="text-sm font-medium text-muted-foreground">
                          {bf.displayLabelOverride || bf.inputField?.label || "Field"}
                        </Label>
                        <p className="text-sm" data-testid={`text-bundle-field-${bf.id}`}>
                          {renderFieldValue(bf.value)}
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {services.map((serviceData) => (
              <Card key={serviceData.serviceId}>
                <CardHeader>
                  <CardTitle className="text-lg" data-testid={`text-service-${serviceData.serviceId}`}>
                    {serviceData.service.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {serviceData.fields
                      .filter((field) => field.inputField?.showOnBundleForm !== false)
                      .map((field) => (
                      <div key={field.id} className="flex flex-col gap-1">
                        <Label className="text-sm font-medium text-muted-foreground">
                          {field.displayLabelOverride || field.inputField?.label || "Field"}
                        </Label>
                        <div className="flex items-center gap-2">
                          <span className="text-sm" data-testid={`text-field-${field.id}`}>
                            {renderFieldValue(field.value)}
                          </span>
                          {field.defaultValue !== undefined && field.defaultValue !== null && (
                            <Badge variant="secondary" className="text-xs">
                              Default
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {serviceData.lineItemFields.length > 0 && (
                    <>
                      <Separator className="my-4" />
                      <div className="space-y-4">
                        <h4 className="font-medium text-sm">Line Item Fields</h4>
                        {serviceData.lineItemFields.map((lif) => (
                          <div key={lif.id} className="flex flex-col gap-1">
                            <Label className="text-sm font-medium text-muted-foreground">
                              {lif.lineItem.name} - {lif.inputField?.label || "Field"}
                            </Label>
                            <p className="text-sm">{renderFieldValue(lif.value)}</p>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            ))}

            {request.notes && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm whitespace-pre-wrap" data-testid="text-notes">
                    {request.notes}
                  </p>
                </CardContent>
              </Card>
            )}

            {attachments.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Attachments</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {attachments.map((att) => (
                      <div key={att.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <span className="text-sm truncate flex-1">{att.fileName}</span>
                        <a href={att.fileUrl} target="_blank" rel="noopener noreferrer">
                          <Button size="sm" variant="default" data-testid={`button-download-attachment-${att.id}`}>
                            <Download className="h-3 w-3 mr-1" />
                            Download
                          </Button>
                        </a>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Request Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">
                    Requested by: <strong>{requester?.username || "Unknown"}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">
                    Created: {request.createdAt ? format(new Date(request.createdAt), "MMM d, yyyy 'at' h:mm a") : "N/A"}
                  </span>
                </div>
                {assignee && (
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">
                      Assigned to: <strong>{assignee.username}</strong>
                    </span>
                  </div>
                )}
                {request.dueDate && (
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">
                      Due: {format(new Date(request.dueDate), "MMM d, yyyy")}
                    </span>
                  </div>
                )}
                {request.deliveredAt && (
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="text-sm">
                      Delivered: {format(new Date(request.deliveredAt), "MMM d, yyyy")}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            {canManageJobs && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {canTakeJob && (
                    <Button
                      onClick={() => assignMutation.mutate(currentUser?.userId || "")}
                      disabled={assignMutation.isPending}
                      className="w-full bg-sky-blue-accent hover:bg-sky-blue-accent/90"
                      data-testid="button-take-job"
                    >
                      {assignMutation.isPending ? "Taking job..." : "Take This Job"}
                    </Button>
                  )}

                  {(request.status === "pending" || request.status === "in-progress") && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Assign to Designer</span>
                      </div>
                      <Select
                        value={selectedAssignee || assignee?.id || ""}
                        onValueChange={setSelectedAssignee}
                      >
                        <SelectTrigger data-testid="select-designer">
                          <SelectValue placeholder="Select a designer..." />
                        </SelectTrigger>
                        <SelectContent>
                          {designers?.map((d) => {
                            const roleLabel = d.role === "internal_designer" ? "Internal Designer" 
                              : d.role === "vendor_designer" ? "Vendor Designer"
                              : d.role.charAt(0).toUpperCase() + d.role.slice(1);
                            return (
                              <SelectItem key={d.id} value={d.id} data-testid={`select-designer-${d.id}`}>
                                <span className="flex items-center gap-2">
                                  {d.username}
                                  {d.id === currentUser?.userId && " (You)"}
                                  <Badge variant="secondary" className="text-xs">
                                    {roleLabel}
                                  </Badge>
                                </span>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      <Button
                        onClick={() => {
                          if (selectedAssignee) {
                            assignMutation.mutate(selectedAssignee);
                          }
                        }}
                        disabled={!selectedAssignee || assignMutation.isPending}
                        variant="outline"
                        className="w-full"
                        data-testid="button-assign-designer"
                      >
                        {assignMutation.isPending ? "Assigning..." : "Assign Selected Designer"}
                      </Button>
                    </div>
                  )}

                  {canDeliver && (
                    <Button
                      onClick={() => deliverMutation.mutate()}
                      disabled={deliverMutation.isPending}
                      className="w-full"
                      data-testid="button-deliver"
                    >
                      {deliverMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Delivering...
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Mark as Delivered
                        </>
                      )}
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
