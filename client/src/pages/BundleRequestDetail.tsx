import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { ImagePreviewTooltip } from "@/components/ImagePreviewTooltip";
import { ArrowLeft, Package, Loader2, User, Calendar, CheckCircle, Clock, AlertCircle, Download, Users, RefreshCw, XCircle, CheckCircle2, DollarSign } from "lucide-react";
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
  uiGroup?: string | null;
  sortOrder?: number;
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

async function fetchAssignableUsers(): Promise<UserType[]> {
  const response = await fetch("/api/assignable-users");
  if (!response.ok) {
    throw new Error("Failed to fetch assignable users");
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

  // Get the "from" query parameter to determine back navigation
  const urlParams = new URLSearchParams(window.location.search);
  const fromPage = urlParams.get("from");
  const backUrl = fromPage === "profit-report" ? "/reports/services-profit" : "/service-requests";

  const [selectedAssignee, setSelectedAssignee] = useState<string>("");
  const [deliverableUrls, setDeliverableUrls] = useState<{ url: string; name: string }[]>([]);
  const [finalStoreUrl, setFinalStoreUrl] = useState<string>("");

  const { data: requestDetail, isLoading, error } = useQuery({
    queryKey: ["/api/bundle-requests", requestId, "full-detail"],
    queryFn: () => fetchBundleRequestDetail(requestId!),
    enabled: !!requestId,
  });

  const { data: designers } = useQuery({
    queryKey: ["/api/assignable-users"],
    queryFn: fetchAssignableUsers,
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
    mutationFn: async (data: { finalStoreUrl?: string }) => {
      const response = await fetch(`/api/bundle-requests/${requestId}/deliver`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ finalStoreUrl: data.finalStoreUrl || undefined }),
      });
      if (!response.ok) throw new Error("Failed to deliver request");
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Request Delivered", description: "The request has been marked as delivered." });
      setFinalStoreUrl("");
      queryClient.invalidateQueries({ queryKey: ["/api/bundle-requests", requestId] });
      queryClient.invalidateQueries({ queryKey: ["/api/bundle-requests"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to deliver request.", variant: "destructive" });
    },
  });

  const addAttachmentMutation = useMutation({
    mutationFn: async (data: { fileUrl: string; fileName: string; kind: string }) => {
      const response = await fetch(`/api/bundle-requests/${requestId}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: data.fileName,
          fileUrl: data.fileUrl,
          fileType: data.fileName.split(".").pop(),
          kind: data.kind,
        }),
      });
      if (!response.ok) throw new Error("Failed to add attachment");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bundle-requests", requestId, "full-detail"] });
    },
  });

  const handleDeliverableUpload = async (fileUrl: string, fileName: string) => {
    setDeliverableUrls(prev => [...prev, { url: fileUrl, name: fileName }]);
    await addAttachmentMutation.mutateAsync({ fileUrl, fileName, kind: "deliverable" });
  };


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
                <Link href={backUrl}>
                  <Button data-testid="button-back">Back</Button>
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
  
  const requestAttachments = attachments.filter(a => a.kind === "request" || !a.kind);
  const deliverableAttachments = attachments.filter(a => a.kind === "deliverable");
  const showDeliverablesAtTop = request.status === "delivered" || request.status === "change-request";

  // Identify delivery fields from bundle, service, and line item fields
  const bundleDeliveryFields = (bundleFields ?? []).filter(bf => bf.inputField?.inputFor === "delivery");
  const serviceDeliveryFields = services.flatMap(s => s.fields.filter(f => f.inputField?.inputFor === "delivery"));
  const lineItemDeliveryFields = services.flatMap(s => s.lineItemFields.filter(lif => lif.inputField?.inputFor === "delivery"));
  
  // Check if there are file upload or URL delivery fields configured
  const hasDeliveryFilesField = [...bundleDeliveryFields, ...serviceDeliveryFields, ...lineItemDeliveryFields]
    .some(f => f.inputField?.fieldKey === "delivery_files");
  const hasFinalStoreUrlField = [...bundleDeliveryFields, ...serviceDeliveryFields, ...lineItemDeliveryFields]
    .some(f => f.inputField?.fieldKey === "final_store_url");
  
  // Get the label for delivery fields
  const deliveryFilesLabel = [...bundleDeliveryFields, ...serviceDeliveryFields, ...lineItemDeliveryFields]
    .find(f => f.inputField?.fieldKey === "delivery_files")?.inputField?.label || "Upload Delivery Files";
  const finalStoreUrlLabel = [...bundleDeliveryFields, ...serviceDeliveryFields, ...lineItemDeliveryFields]
    .find(f => f.inputField?.fieldKey === "final_store_url")?.inputField?.label || "Final Store URL";

  // Get stored final_store_url from bundle request formData
  const formData = (request.formData as Record<string, any>) || {};
  const storedFinalStoreUrl = formData.final_store_url as string | undefined;

  const renderFieldValue = (value: any): React.ReactNode => {
    if (value === null || value === undefined) return "Not provided";
    if (Array.isArray(value)) {
      if (value.length > 0 && value[0]?.url && value[0]?.fileName) {
        return (
          <div className="flex flex-col gap-2">
            {value.map((file: { url: string; fileName: string }, idx: number) => (
              <div key={idx} className="flex items-center gap-3 p-3 bg-blue-lavender/30 rounded-lg w-full">
                <ImagePreviewTooltip
                  fileUrl={file.url}
                  fileName={file.fileName}
                  thumbnailSize="sm"
                />
                <span className="text-sm text-dark-blue-night flex-1 truncate">{file.fileName}</span>
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
            <Link href={backUrl}>
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
                {(currentUser?.role === "admin" || currentUser?.role === "client") && bundle.finalPrice && (
                  <Badge variant="outline" className="text-sm bg-green-50 text-green-700 border-green-200" data-testid="text-bundle-price">
                    <DollarSign className="h-3 w-3 mr-0.5" />
                    {bundle.finalPrice}
                  </Badge>
                )}
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
                Created on {request.createdAt ? format(new Date(request.createdAt), "MMMM do, yyyy 'at' h:mm a") : "N/A"}
                {request.deliveredAt && (
                  <span className="ml-2">
                    • Delivered on {format(new Date(request.deliveredAt), "MMMM do, yyyy")}
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {request.status === "in-progress" && (
              currentUser?.role === "admin" || 
              currentUser?.role === "internal_designer" || 
              request.assigneeId === currentUser?.userId
            ) && (
              <>
                <Button 
                  variant="outline" 
                  className="border-red-300 text-red-600"
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={() => deliverMutation.mutate({ finalStoreUrl })}
                  disabled={deliverMutation.isPending}
                  className="bg-sky-blue-accent hover:bg-sky-blue-accent/90"
                  data-testid="button-deliver-top"
                >
                  {deliverMutation.isPending ? "Delivering..." : "Deliver"}
                </Button>
              </>
            )}
            
            {request.status === "change-request" && (
              currentUser?.role === "admin" || 
              currentUser?.role === "internal_designer" || 
              request.assigneeId === currentUser?.userId
            ) && (
              <>
                <Button 
                  variant="outline" 
                  className="border-red-300 text-red-600"
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={() => deliverMutation.mutate({ finalStoreUrl })}
                  disabled={deliverMutation.isPending}
                  className="bg-sky-blue-accent hover:bg-sky-blue-accent/90"
                  data-testid="button-deliver-top"
                >
                  {deliverMutation.isPending ? "Delivering..." : "Deliver"}
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">General Info</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                {/* System fields: Client and Assignee */}
                <div className="p-3 bg-blue-lavender/30 rounded-lg">
                  <p className="text-xs text-dark-gray mb-1">Client</p>
                  <p className="text-sm font-medium text-dark-blue-night" data-testid="text-client">
                    {requester?.username || "N/A"}
                  </p>
                </div>

                {canManageJobs && (
                  <div className="p-3 bg-blue-lavender/30 rounded-lg">
                    <p className="text-xs text-dark-gray mb-1">Assignee</p>
                    <p className="text-sm font-medium text-dark-blue-night" data-testid="text-assignee">
                      {assignee?.username || "Unassigned"}
                    </p>
                  </div>
                )}
                
                {/* Render dynamic general_info fields from bundleFields */}
                {(bundleFields ?? [])
                  .filter(bf => bf.uiGroup === "general_info" && bf.inputField?.inputFor !== "delivery")
                  .sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999))
                  .map((bf) => {
                    const value = bf.value;
                    if (value === null || value === undefined || value === "") return null;
                    
                    let displayValue: string;
                    if (typeof value === "boolean") {
                      displayValue = value ? "Yes" : "No";
                    } else if (Array.isArray(value)) {
                      displayValue = value.join(", ");
                    } else {
                      displayValue = String(value);
                    }
                    
                    return (
                      <div key={bf.id} className="p-3 bg-blue-lavender/30 rounded-lg">
                        <p className="text-xs text-dark-gray mb-1">
                          {bf.displayLabelOverride || bf.inputField?.label || "Field"}
                        </p>
                        <p className="text-sm font-medium text-dark-blue-night" data-testid={`text-bundle-field-${bf.id}`}>
                          {displayValue}
                        </p>
                      </div>
                    );
                  })}
              </CardContent>
            </Card>

            {/* Render info_details bundle fields in a separate section */}
            {(bundleFields ?? []).filter(bf => 
              bf.uiGroup === "info_details" && 
              bf.inputField?.inputFor !== "delivery"
            ).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Bundle Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {(bundleFields ?? [])
                      .filter(bf => bf.uiGroup === "info_details" && bf.inputField?.inputFor !== "delivery")
                      .sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999))
                      .map((bf) => {
                        const value = bf.value;
                        if (value === null || value === undefined || value === "") return null;
                        
                        return (
                          <div key={bf.id} className="flex flex-col gap-1">
                            <Label className="text-sm font-medium text-muted-foreground">
                              {bf.displayLabelOverride || bf.inputField?.label || "Field"}
                            </Label>
                            <div className="text-sm" data-testid={`text-bundle-field-${bf.id}`}>
                              {renderFieldValue(value)}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </CardContent>
              </Card>
            )}
            
            {/* Render additional_info bundle fields in Additional Information section */}
            {(bundleFields ?? []).filter(bf => 
              bf.uiGroup === "additional_info" && 
              bf.inputField?.inputFor !== "delivery"
            ).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Additional Information</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {(bundleFields ?? [])
                      .filter(bf => bf.uiGroup === "additional_info" && bf.inputField?.inputFor !== "delivery")
                      .sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999))
                      .map((bf) => {
                        const value = bf.value;
                        if (value === null || value === undefined || value === "") return null;
                        
                        return (
                          <div key={bf.id} className="flex flex-col gap-1">
                            <Label className="text-sm font-medium text-muted-foreground">
                              {bf.displayLabelOverride || bf.inputField?.label || "Field"}
                            </Label>
                            <div className="text-sm" data-testid={`text-bundle-field-${bf.id}`}>
                              {renderFieldValue(value)}
                            </div>
                          </div>
                        );
                      })}
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
                      .filter((field) => field.inputField?.showOnBundleForm !== false && field.inputField?.inputFor !== "delivery")
                      .map((field) => (
                      <div key={field.id} className="flex flex-col gap-1">
                        <Label className="text-sm font-medium text-muted-foreground">
                          {field.displayLabelOverride || field.inputField?.label || "Field"}
                        </Label>
                        <div className="flex items-start gap-2 flex-wrap">
                          <div className="text-sm flex-1" data-testid={`text-field-${field.id}`}>
                            {renderFieldValue(field.value)}
                          </div>
                          {field.defaultValue !== undefined && field.defaultValue !== null && (
                            <Badge variant="secondary" className="text-xs">
                              Default
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {serviceData.lineItemFields.filter(lif => lif.inputField?.inputFor !== "delivery").length > 0 && (
                    <>
                      <Separator className="my-4" />
                      <div className="space-y-4">
                        <h4 className="font-medium text-sm">Line Item Fields</h4>
                        {serviceData.lineItemFields
                          .filter(lif => lif.inputField?.inputFor !== "delivery")
                          .map((lif) => (
                          <div key={lif.id} className="flex flex-col gap-1">
                            <Label className="text-sm font-medium text-muted-foreground">
                              {lif.lineItem.name} - {lif.inputField?.label || "Field"}
                            </Label>
                            <div className="text-sm">{renderFieldValue(lif.value)}</div>
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

            {requestAttachments.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Attachments</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {requestAttachments.map((att) => (
                      <div key={att.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <div className="flex items-center gap-3 flex-1">
                          <ImagePreviewTooltip
                            fileUrl={att.fileUrl}
                            fileName={att.fileName}
                            thumbnailSize="sm"
                          />
                          <span className="text-sm truncate flex-1">{att.fileName}</span>
                        </div>
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

            {(canManageJobs || deliverableAttachments.length > 0 || storedFinalStoreUrl) && (
              <Card className={showDeliverablesAtTop ? "border-green-200 bg-green-50/30" : ""}>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    {showDeliverablesAtTop && <CheckCircle2 className="h-5 w-5 text-green-600" />}
                    Deliverables
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Display stored final store URL if delivered */}
                  {storedFinalStoreUrl && (
                    <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                      <p className="text-sm font-medium text-dark-blue-night mb-1">{finalStoreUrlLabel}</p>
                      <a 
                        href={storedFinalStoreUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:underline break-all"
                        data-testid="link-final-store-url"
                      >
                        {storedFinalStoreUrl}
                      </a>
                    </div>
                  )}

                  {deliverableAttachments.length > 0 && (
                    <div className="space-y-2">
                      {deliverableAttachments.map((att) => (
                        <div 
                          key={att.id}
                          className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg"
                        >
                          <div className="flex items-center gap-3">
                            <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                            <ImagePreviewTooltip
                              fileUrl={att.fileUrl}
                              fileName={att.fileName}
                              thumbnailSize="sm"
                            />
                            <span className="text-sm text-dark-blue-night flex-1 truncate">{att.fileName}</span>
                          </div>
                          <a href={att.fileUrl} target="_blank" rel="noopener noreferrer">
                            <Button size="sm" variant="default" data-testid={`button-download-deliverable-${att.id}`}>
                              <Download className="h-3 w-3 mr-1" />
                              Download
                            </Button>
                          </a>
                        </div>
                      ))}
                    </div>
                  )}

                  {deliverableAttachments.length === 0 && !storedFinalStoreUrl && !canManageJobs && (
                    <p className="text-sm text-dark-gray">No deliverables uploaded yet</p>
                  )}

                  {/* Dynamic delivery field inputs for designers */}
                  {canManageJobs && (request.status === "in-progress" || request.status === "change-request") && (
                    <div className="space-y-4">
                      {/* File upload field - only if delivery_files is configured */}
                      {hasDeliveryFilesField && (
                        <div>
                          <p className="text-sm font-medium text-dark-blue-night mb-2">{deliveryFilesLabel}</p>
                          <FileUploader onUploadComplete={handleDeliverableUpload} />
                        </div>
                      )}

                      {/* URL input field - only if final_store_url is configured */}
                      {hasFinalStoreUrlField && (
                        <div>
                          <Label className="text-sm font-medium text-dark-blue-night">{finalStoreUrlLabel}</Label>
                          <Input
                            type="url"
                            placeholder="https://example.com/store/..."
                            value={finalStoreUrl}
                            onChange={(e) => setFinalStoreUrl(e.target.value)}
                            className="mt-1"
                            data-testid="input-final-store-url"
                          />
                        </div>
                      )}

                      {/* Fallback if no delivery fields are configured */}
                      {!hasDeliveryFilesField && !hasFinalStoreUrlField && (
                        <div>
                          <p className="text-sm font-medium text-dark-blue-night mb-2">Upload File*</p>
                          <FileUploader onUploadComplete={handleDeliverableUpload} />
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-6">
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

                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Status History</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    <span className="text-sm text-dark-blue-night">Created</span>
                    <span className="text-xs text-dark-gray ml-auto">
                      {format(new Date(request.createdAt), "MMM dd, h:mm a")}
                    </span>
                  </div>
                  {request.assigneeId && (
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                      <span className="text-sm text-dark-blue-night">Assigned</span>
                      {request.assignedAt && (
                        <span className="text-xs text-dark-gray ml-auto">
                          {format(new Date(request.assignedAt), "MMM dd, h:mm a")}
                        </span>
                      )}
                    </div>
                  )}
                  {request.deliveredAt && request.status === "delivered" && (
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      <span className="text-sm text-dark-blue-night">Delivered</span>
                      <span className="text-xs text-dark-gray ml-auto">
                        {format(new Date(request.deliveredAt), "MMM dd, h:mm a")}
                      </span>
                    </div>
                  )}
                  {request.status === "change-request" && (
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                      <span className="text-sm text-dark-blue-night">Change Requested</span>
                      <Badge variant="outline" className="text-xs ml-auto">Current</Badge>
                    </div>
                  )}
                  {request.status === "in-progress" && (
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                      <span className="text-sm text-dark-blue-night">In Progress</span>
                      <Badge variant="outline" className="text-xs ml-auto">Current</Badge>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Current User</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarFallback className="bg-sky-blue-accent text-white">
                      {currentUser?.username?.slice(0, 2).toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium text-dark-blue-night">
                      {currentUser?.username || "Guest"}
                    </p>
                    <Badge variant="outline" className="text-xs capitalize">
                      {currentUser?.role || "client"}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

    </div>
  );
}
