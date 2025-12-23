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
import { ArrowLeft, Package, Loader2, User, Calendar, CheckCircle, Clock, AlertCircle } from "lucide-react";
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

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  "in-progress": "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  delivered: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  "change-request": "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
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
  const canAssign = ["admin", "internal_designer", "vendor", "vendor_designer"].includes(currentUser?.role || "");
  const canDeliver = canAssign && request.status !== "delivered";

  const renderFieldValue = (value: any): React.ReactNode => {
    if (value === null || value === undefined) return "Not provided";
    if (Array.isArray(value)) {
      // Check if it's an array of file objects
      if (value.length > 0 && value[0]?.url && value[0]?.fileName) {
        return (
          <div className="flex flex-col gap-1">
            {value.map((file: { url: string; fileName: string }, idx: number) => (
              <a
                key={idx}
                href={file.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                {file.fileName}
              </a>
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
    <div className="min-h-screen bg-background">
      <Header />
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Link href="/service-requests">
            <Button variant="ghost" size="sm" data-testid="button-back">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Requests
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
                  <Package className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <CardTitle data-testid="text-bundle-name">{bundle.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">Bundle Request</p>
                </div>
                <Badge className={statusColors[request.status] || ""} data-testid="badge-status">
                  {request.status}
                </Badge>
              </CardHeader>
            </Card>

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
                        <p className="text-sm" data-testid={`text-field-${field.id}`}>
                          {renderFieldValue(field.value)}
                        </p>
                        {field.defaultValue !== undefined && field.defaultValue !== null && (
                          <Badge variant="secondary" className="w-fit text-xs">
                            Default
                          </Badge>
                        )}
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
                      <div key={att.id} className="flex items-center justify-between p-2 bg-muted rounded">
                        <span className="text-sm truncate">{att.fileName}</span>
                        <a
                          href={att.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary text-sm hover:underline"
                        >
                          View
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

            {canAssign && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Assign Designer</Label>
                    <Select
                      value={selectedAssignee || assignee?.id || ""}
                      onValueChange={(value) => {
                        setSelectedAssignee(value);
                        assignMutation.mutate(value);
                      }}
                    >
                      <SelectTrigger data-testid="select-assignee">
                        <SelectValue placeholder="Select designer" />
                      </SelectTrigger>
                      <SelectContent>
                        {designers?.map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.username}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

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
