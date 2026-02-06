import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { ArrowLeft, Package, Loader2, User, Calendar, CheckCircle, Clock, AlertCircle, Download, Users, RefreshCw, XCircle, CheckCircle2, DollarSign, Building2, Send, Reply, X, Percent } from "lucide-react";
import { getDisplayStatus, getStatusInfo } from "@/lib/statusUtils";
import { Link } from "wouter";
import { format } from "date-fns";
import type { Bundle, BundleRequest, User as UserType, Service, InputField, VendorProfile, ClientProfile, BundleRequestComment, Refund } from "@shared/schema";

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
  required?: boolean;
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
  const [selectedVendorId, setSelectedVendorId] = useState<string>("");
  const [deliverableUrls, setDeliverableUrls] = useState<{ url: string; name: string }[]>([]);
  const [finalStoreUrl, setFinalStoreUrl] = useState<string>("");
  const [changeRequestModalOpen, setChangeRequestModalOpen] = useState(false);
  const [changeNote, setChangeNote] = useState("");
  const [commentText, setCommentText] = useState("");
  const [commentTab, setCommentTab] = useState<"public" | "internal">("public");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const commentTextareaRef = useRef<HTMLTextAreaElement>(null);

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

  const { data: allUsers = [] } = useQuery<UserType[]>({
    queryKey: ["/api/users"],
  });

  const { data: vendorProfiles = [] } = useQuery<VendorProfile[]>({
    queryKey: ["/api/vendor-profiles"],
  });

  const { data: clientProfiles = [] } = useQuery<ClientProfile[]>({
    queryKey: ["/api/client-profiles"],
  });

  const { data: comments = [], refetch: refetchComments } = useQuery<BundleRequestComment[]>({
    queryKey: ["/api/bundle-requests", requestId, "comments"],
    enabled: !!requestId && !!currentUser,
  });

  // Query to check if bundle has been refunded (for hiding refund button)
  const { data: allRefunds = [] } = useQuery<Refund[]>({
    queryKey: ["/api/refunds"],
    enabled: !!currentUser && currentUser.role === "admin" && !!requestDetail?.request?.id,
  });
  
  const isBundleRefunded = requestDetail?.request?.id ? allRefunds.some(
    (refund) => String(refund.bundleRequestId) === String(requestDetail.request.id) && (refund.status === "completed" || refund.status === "processing")
  ) : false;

  const canAssignToVendor = ["admin", "internal_designer"].includes(currentUser?.role || "");
  const isDesigner = ["admin", "internal_designer", "vendor", "vendor_designer", "designer"].includes(currentUser?.role || "");
  const isClient = currentUser?.role === "client" || currentUser?.role === "distributor";
  
  // Helper to get vendor company name from profile
  const getVendorDisplayName = (vendorUser: UserType) => {
    const profile = vendorProfiles.find(p => p.userId === vendorUser.id);
    return profile?.companyName || vendorUser.username;
  };

  // Helper to get client company name
  const getClientCompanyName = (userId: string | null | undefined): string | null => {
    if (!userId) return null;
    const user = allUsers.find(u => u.id === userId);
    if (!user?.clientProfileId) return null;
    const profile = clientProfiles.find(p => p.id === user.clientProfileId);
    return profile?.companyName || null;
  };
  
  // Only include vendors that have a vendor profile with a company name
  const vendors = allUsers.filter(u => {
    if (u.role !== "vendor" || !u.isActive) return false;
    const profile = vendorProfiles.find(p => p.userId === u.id);
    return profile?.companyName; // Only include if they have a company name
  });

  const assignMutation = useMutation({
    mutationFn: async (assigneeId: string) => {
      return apiRequest("POST", `/api/bundle-requests/${requestId}/assign`, { assigneeId });
    },
    onSuccess: () => {
      toast({ title: "Designer Assigned", description: "The request has been assigned." });
      queryClient.invalidateQueries({ queryKey: ["/api/bundle-requests", requestId] });
      queryClient.invalidateQueries({ queryKey: ["/api/bundle-requests", requestId, "full-detail"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bundle-requests"] });
    },
    onError: (error: Error) => {
      const msg = error.message?.includes(":") ? error.message.split(": ").slice(1).join(": ") : "Failed to assign designer.";
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const startJobMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/bundle-requests/${requestId}/start`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bundle-requests", requestId] });
      queryClient.invalidateQueries({ queryKey: ["/api/bundle-requests", requestId, "full-detail"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bundle-requests"] });
      toast({ title: "Job started", description: "The job is now in progress." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to start job.", variant: "destructive" });
    },
  });

  const assignVendorMutation = useMutation({
    mutationFn: async (vendorId: string) => {
      const response = await fetch(`/api/bundle-requests/${requestId}/assign-vendor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendorId }),
      });
      if (!response.ok) throw new Error("Failed to assign vendor");
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Vendor Assigned", description: "The job has been assigned to the vendor organization." });
      setSelectedVendorId("");
      queryClient.invalidateQueries({ queryKey: ["/api/bundle-requests", requestId] });
      queryClient.invalidateQueries({ queryKey: ["/api/bundle-requests"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to assign vendor.", variant: "destructive" });
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

  const changeRequestMutation = useMutation({
    mutationFn: async (note: string) => {
      return apiRequest("POST", `/api/bundle-requests/${requestId}/change-request`, { 
        changeNote: note
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bundle-requests", requestId] });
      queryClient.invalidateQueries({ queryKey: ["/api/bundle-requests"] });
      refetchComments();
      setChangeNote("");
      setChangeRequestModalOpen(false);
      toast({ title: "Change requested", description: "The designer has been notified." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to request changes.", variant: "destructive" });
    },
  });

  const addCommentMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/bundle-requests/${requestId}/comments`, {
        body: commentText,
        visibility: commentTab,
        parentId: replyingTo || undefined,
      });
    },
    onSuccess: () => {
      refetchComments();
      setCommentText("");
      setReplyingTo(null);
      toast({ title: "Comment added" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add comment.", variant: "destructive" });
    },
  });

  const handleDeliverableUpload = async (fileUrl: string, fileName: string) => {
    setDeliverableUrls(prev => [...prev, { url: fileUrl, name: fileName }]);
    await addAttachmentMutation.mutateAsync({ fileUrl, fileName, kind: "deliverable" });
  };

  const handleDeliver = () => {
    // Check if Final Store URL is required for this bundle
    // Only bundleFields have the required property
    const bundleDeliveryFieldsForCheck = (requestDetail?.bundleFields ?? []).filter(bf => bf.inputField?.inputFor === "delivery");
    const finalUrlBundleField = bundleDeliveryFieldsForCheck.find(f => f.inputField?.fieldKey === "final_store_url");
    const isRequired = finalUrlBundleField?.required === true;
    
    if (isRequired && !finalStoreUrl.trim()) {
      toast({ 
        title: "Final Store URL Required", 
        description: "Please provide the Final Store URL before delivering this job.", 
        variant: "destructive" 
      });
      return;
    }
    
    deliverMutation.mutate({ finalStoreUrl });
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
  const isAdmin = currentUser?.role === "admin";
  const canManageJobs = ["admin", "internal_designer", "vendor", "vendor_designer", "designer"].includes(currentUser?.role || "");
  const canCancel = isAdmin || (isClient && request.status === "pending");
  const hasAssignee = !!request.assigneeId || !!request.vendorAssigneeId;
  const canTakeJob = ["admin", "internal_designer", "designer", "vendor", "vendor_designer"].includes(currentUser?.role || "") && request.status === "pending" && !hasAssignee;
  const isAssignedToMe = request.assigneeId === currentUser?.userId;
  const canStartJob = request.status === "pending" && hasAssignee && isAssignedToMe;
  const canReassign = request.status === "pending" && hasAssignee && canManageJobs && !isAssignedToMe;
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
  const finalStoreUrlField = [...bundleDeliveryFields, ...serviceDeliveryFields, ...lineItemDeliveryFields]
    .find(f => f.inputField?.fieldKey === "final_store_url");
  const finalStoreUrlLabel = finalStoreUrlField?.inputField?.label || "Final Store URL";
  // Check required status only from bundleFields which has the required property
  const finalStoreUrlBundleField = bundleDeliveryFields.find(f => f.inputField?.fieldKey === "final_store_url");
  const isFinalStoreUrlRequired = finalStoreUrlBundleField?.required === true;

  // Get stored final_store_url from bundle request formData
  const formData = (request.formData as Record<string, any>) || {};
  const storedFinalStoreUrl = formData.final_store_url as string | undefined;

  // Check if delivery files are required
  const deliveryFilesField = [...bundleDeliveryFields, ...serviceDeliveryFields, ...lineItemDeliveryFields]
    .find(f => f.inputField?.fieldKey === "delivery_files");
  const isDeliveryFilesRequired = (deliveryFilesField as any)?.required === true;

  // Helper functions for comments
  const getUserById = (userId: string) => allUsers.find(u => u.id === userId);
  
  const getRoleLabelForComment = (role: string | undefined) => {
    switch (role) {
      case "admin": return "Admin";
      case "internal_designer": return "Internal Designer";
      case "vendor": return "Vendor";
      case "vendor_designer": return "Vendor Designer";
      case "designer": return "Designer";
      case "client": return "Client";
      case "distributor": return "Distributor";
      default: return "User";
    }
  };

  const getTopLevelComments = (visibility: "public" | "internal") => {
    return comments.filter(c => c.visibility === visibility && !c.parentId);
  };

  const getReplies = (parentId: string) => {
    return comments.filter(c => c.parentId === parentId);
  };

  const isChangeRequestComment = (comment: BundleRequestComment) => {
    return comment.body.startsWith("[Change Request]");
  };

  const renderCommentThread = (comment: BundleRequestComment, isReply = false) => {
    const author = getUserById(comment.authorId);
    const replies = getReplies(comment.id);
    const isChangeRequest = isChangeRequestComment(comment);
    const roleLabel = getRoleLabelForComment(author?.role);
    
    const clientRoles = ["client", "distributor"];
    const isCurrentUserClient = clientRoles.includes(currentUser?.role ?? "");
    const isAuthorNonClient = !clientRoles.includes(author?.role ?? "");
    const shouldHideUsername = isCurrentUserClient && isAuthorNonClient;
    const displayName = shouldHideUsername ? roleLabel : (author?.username || "Unknown");
    const avatarInitials = shouldHideUsername 
      ? roleLabel.split(" ").map(w => w[0]).join("").slice(0, 2)
      : (author?.username?.slice(0, 2).toUpperCase() || "NS");
    
    return (
      <div key={comment.id} className={`${isReply ? "ml-10 mt-3" : ""}`}>
        <div className="flex gap-3">
          <Avatar className="h-8 w-8 flex-shrink-0">
            <AvatarFallback className={`${comment.visibility === "internal" ? "bg-purple-500" : "bg-sky-blue-accent"} text-white text-xs`}>
              {avatarInitials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-dark-blue-night">
                {displayName}
              </span>
              <Badge variant="outline" className={`text-xs ${comment.visibility === "internal" ? "bg-purple-50" : ""}`}>
                {roleLabel}
              </Badge>
              {isChangeRequest && (
                <Badge className="bg-orange-100 text-orange-800 border-orange-200 text-xs">
                  Change Request
                </Badge>
              )}
              <span className="text-xs text-dark-gray">
                {format(new Date(comment.createdAt), "MMM dd, yyyy")}
              </span>
            </div>
            <p className="text-sm text-dark-gray mt-1" data-testid={`text-comment-${comment.id}`}>
              {isChangeRequest ? comment.body.replace("[Change Request] ", "") : comment.body}
            </p>
            {!isReply && (
              <button
                onClick={() => setReplyingTo(comment.id)}
                className="flex items-center gap-1 text-xs text-sky-blue-accent mt-2 hover:underline"
                data-testid={`button-reply-${comment.id}`}
              >
                <Reply className="h-3 w-3" />
                Reply
              </button>
            )}
          </div>
        </div>
        {replies.map(reply => renderCommentThread(reply, true))}
      </div>
    );
  };

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
      <Dialog open={changeRequestModalOpen} onOpenChange={setChangeRequestModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              placeholder="Please leave a comment explaining the reason for the rejection."
              value={changeNote}
              onChange={(e) => setChangeNote(e.target.value)}
              className="min-h-[120px]"
              data-testid="textarea-change-request-modal"
            />
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button 
              variant="outline" 
              onClick={() => setChangeRequestModalOpen(false)}
              data-testid="button-cancel-change-request"
            >
              Cancel
            </Button>
            <Button
              onClick={() => changeRequestMutation.mutate(changeNote)}
              disabled={!changeNote.trim() || changeRequestMutation.isPending}
              data-testid="button-submit-change-request"
            >
              {changeRequestMutation.isPending ? "Submitting..." : "Submit"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
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
                  <>
                    <Badge variant="outline" className="text-sm bg-green-50 text-green-700 border-green-200" data-testid="text-bundle-price">
                      <DollarSign className="h-3 w-3 mr-0.5" />
                      {bundle.finalPrice}
                    </Badge>
                    {request.discountCouponId && (
                      <Badge 
                        variant="secondary" 
                        className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                        data-testid="badge-discount-applied"
                      >
                        <Percent className="h-3 w-3 mr-1" />
                        Discount
                      </Badge>
                    )}
                  </>
                )}
                <Badge variant="outline" className="text-sm" data-testid="text-job-id">
                  B-{request.id.slice(0, 5).toUpperCase()}
                </Badge>
                {(() => {
                  const displayStatus = getDisplayStatus(
                    request.status,
                    request.assigneeId,
                    request.vendorAssigneeId,
                    currentUser?.role,
                    assignee?.role
                  );
                  const statusInfo = getStatusInfo(displayStatus);
                  const StatusIcon = statusInfo.icon;
                  return (
                    <Badge className={statusInfo.color} data-testid="badge-status">
                      <StatusIcon className="h-3 w-3 mr-1" />
                      {statusInfo.label}
                    </Badge>
                  );
                })()}
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
            {currentUser?.role === "admin" && request.finalPrice && parseFloat(request.finalPrice) > 0 && !isBundleRefunded && (
              <Link href={`/reports/refunds?clientId=${request.userId}&jobId=${request.id}&jobType=bundle_request`}>
                <Button 
                  variant="outline" 
                  data-testid="button-refund-bundle"
                >
                  <DollarSign className="h-4 w-4 mr-1" />
                  Refund
                </Button>
              </Link>
            )}
            
            {currentUser?.role === "admin" && isBundleRefunded && (
              <Badge 
                variant="outline" 
                className="border-green-500 text-green-700"
                data-testid={`status-refunded-${request.id}`}
              >
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Refunded
              </Badge>
            )}
            
            {request.status === "in-progress" && canDeliver && (
              <>
                {isAdmin && (
                  <Button 
                    variant="outline" 
                    className="border-red-300 text-red-600"
                    data-testid="button-cancel"
                  >
                    Cancel
                  </Button>
                )}
                <Button 
                  onClick={handleDeliver}
                  disabled={deliverMutation.isPending}
                  className="bg-sky-blue-accent hover:bg-sky-blue-accent/90"
                  data-testid="button-deliver-top"
                >
                  {deliverMutation.isPending ? "Delivering..." : "Deliver"}
                </Button>
              </>
            )}
            
            {request.status === "change-request" && canDeliver && (
              <>
                {isAdmin && (
                  <Button 
                    variant="outline" 
                    className="border-red-300 text-red-600"
                    data-testid="button-cancel"
                  >
                    Cancel
                  </Button>
                )}
                <Button 
                  onClick={handleDeliver}
                  disabled={deliverMutation.isPending}
                  className="bg-sky-blue-accent hover:bg-sky-blue-accent/90"
                  data-testid="button-deliver-top"
                >
                  {deliverMutation.isPending ? "Delivering..." : "Deliver"}
                </Button>
              </>
            )}

            {request.status === "delivered" && isClient && (
              <Button 
                variant="outline" 
                className="border-red-300 text-red-600"
                onClick={() => setChangeRequestModalOpen(true)}
                data-testid="button-change-request"
              >
                Change Request
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Deliverables at top when delivered/change-request - read-only view for quick access */}
            {showDeliverablesAtTop && (deliverableAttachments.length > 0 || storedFinalStoreUrl) && (
              <Card className="border-green-200 bg-green-50/30">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
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
                        data-testid="link-final-store-url-top"
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
                            <Button size="sm" variant="default" data-testid={`button-download-deliverable-top-${att.id}`}>
                              <Download className="h-3 w-3 mr-1" />
                              Download
                            </Button>
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">General Info</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                {/* Row 1: Client Company (left), Client (right) */}
                {["admin", "internal_designer"].includes(currentUser?.role || "") && getClientCompanyName(request?.userId) && (
                  <div className="p-3 bg-blue-lavender/30 rounded-lg">
                    <p className="text-xs text-dark-gray mb-1">Client Company</p>
                    <p className="text-sm font-medium text-dark-blue-night" data-testid="text-client-company">
                      {getClientCompanyName(request?.userId)}
                    </p>
                  </div>
                )}
                <div className="p-3 bg-blue-lavender/30 rounded-lg">
                  <p className="text-xs text-dark-gray mb-1">Client</p>
                  <p className="text-sm font-medium text-dark-blue-night" data-testid="text-client">
                    {requester?.username || "N/A"}
                  </p>
                </div>
                
                {/* Row 2+: Dynamic general_info fields from bundleFields (includes Order/Project Reference, Due Date, Store Replication Template) */}
                {/* Note: Fields with empty/null uiGroup are treated as general_info */}
                {(() => {
                  const generalInfoFields = (bundleFields ?? [])
                    .filter(bf => 
                      (!bf.uiGroup || bf.uiGroup === "" || bf.uiGroup === "general_info") && 
                      bf.inputField?.inputFor !== "delivery"
                    )
                    .sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999));
                  
                  // Check if Due Date is provided via bundle fields with a value
                  const hasDueDateFieldWithValue = generalInfoFields.some(bf => 
                    (bf.inputField?.fieldKey?.toLowerCase().includes("due_date") || 
                     bf.inputField?.label?.toLowerCase().includes("due date")) &&
                    bf.value !== null && bf.value !== undefined && bf.value !== ""
                  );
                  
                  return (
                    <>
                      {generalInfoFields.map((bf) => {
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
                      
                      {/* Fallback: Show request.dueDate if no Due Date bundle field with value */}
                      {!hasDueDateFieldWithValue && request?.dueDate && (() => {
                        const dueDateObj = new Date(request.dueDate);
                        if (isNaN(dueDateObj.getTime())) return null;
                        return (
                          <div className="p-3 bg-blue-lavender/30 rounded-lg">
                            <p className="text-xs text-dark-gray mb-1">Due Date</p>
                            <p className="text-sm font-medium text-dark-blue-night" data-testid="text-due-date">
                              {format(dueDateObj, "yyyy-MM-dd")}
                            </p>
                          </div>
                        );
                      })()}
                    </>
                  );
                })()}

                {/* Assignee - shown last for proper ordering */}
                {canManageJobs && (
                  <div className="p-3 bg-blue-lavender/30 rounded-lg">
                    <p className="text-xs text-dark-gray mb-1">Assignee</p>
                    <p className="text-sm font-medium text-dark-blue-night" data-testid="text-assignee">
                      {assignee?.username || "Unassigned"}
                    </p>
                  </div>
                )}
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

            {/* Render additional_info bundle fields in Additional Information section - right before Deliverables */}
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

            {/* Bottom Deliverables section - only show when NOT shown at top, or when designers need to edit */}
            {((!showDeliverablesAtTop && (deliverableAttachments.length > 0 || storedFinalStoreUrl)) || 
              (canManageJobs && (request.status === "in-progress" || request.status === "change-request"))) && (
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
                          <p className="text-sm font-medium text-dark-blue-night mb-2">
                            {deliveryFilesLabel}
                            {isDeliveryFilesRequired && <span className="text-red-500 ml-1">*</span>}
                          </p>
                          <FileUploader onUploadComplete={handleDeliverableUpload} />
                        </div>
                      )}

                      {/* URL input field - only if final_store_url is configured */}
                      {hasFinalStoreUrlField && (
                        <div>
                          <Label className="text-sm font-medium text-dark-blue-night">
                            {finalStoreUrlLabel}
                            {isFinalStoreUrlRequired && <span className="text-red-500 ml-1">*</span>}
                          </Label>
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

            {/* Comments Section */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Comments</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Tabs value={commentTab} onValueChange={(v) => setCommentTab(v as "public" | "internal")}>
                  <TabsList>
                    <TabsTrigger value="public" data-testid="tab-comments-public">Comments</TabsTrigger>
                    {isDesigner && (
                      <TabsTrigger value="internal" data-testid="tab-comments-internal">Internal Comments</TabsTrigger>
                    )}
                  </TabsList>

                  <TabsContent value="public" className="space-y-4">
                    <div className="space-y-4 max-h-96 overflow-y-auto">
                      {getTopLevelComments("public").map((comment) => renderCommentThread(comment))}
                      {getTopLevelComments("public").length === 0 && (
                        <p className="text-sm text-dark-gray text-center py-4">No comments yet</p>
                      )}
                    </div>
                  </TabsContent>

                  {isDesigner && (
                    <TabsContent value="internal" className="space-y-4">
                      <div className="space-y-4 max-h-96 overflow-y-auto">
                        {getTopLevelComments("internal").map((comment) => renderCommentThread(comment))}
                        {getTopLevelComments("internal").length === 0 && (
                          <p className="text-sm text-dark-gray text-center py-4">No internal comments yet</p>
                        )}
                      </div>
                    </TabsContent>
                  )}
                </Tabs>

                <div className="border-t pt-4">
                  {replyingTo && (
                    <div className="flex items-center gap-2 mb-2 text-sm text-dark-gray bg-blue-lavender/30 p-2 rounded">
                      <Reply className="h-4 w-4" />
                      <span>Replying to comment</span>
                      <button 
                        onClick={() => setReplyingTo(null)} 
                        className="ml-auto"
                        data-testid="button-cancel-reply"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                  <Textarea
                    ref={commentTextareaRef}
                    placeholder={commentTab === "internal" ? "Write an internal comment..." : "Write a comment..."}
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    className="mb-3"
                    data-testid="textarea-comment"
                  />
                  <div className="flex justify-end">
                    <Button
                      onClick={() => addCommentMutation.mutate()}
                      disabled={!commentText.trim() || addCommentMutation.isPending}
                      data-testid="button-submit-comment"
                    >
                      <Send className="h-4 w-4 mr-2" />
                      Submit
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
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

                  {canStartJob && (
                    <Button
                      onClick={() => startJobMutation.mutate()}
                      disabled={startJobMutation.isPending}
                      className="w-full bg-sky-blue-accent hover:bg-sky-blue-accent/90"
                      data-testid="button-start-job"
                    >
                      {startJobMutation.isPending ? "Starting..." : "Start Job"}
                    </Button>
                  )}

                  {(request.status === "pending" || request.status === "in-progress") && canManageJobs && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{request.assigneeId ? "Re-Assign Designer" : "Assign to Designer"}</span>
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
                        {assignMutation.isPending ? "Assigning..." : (request.assigneeId ? "Re-Assign Designer" : "Assign Selected Designer")}
                      </Button>
                    </div>
                  )}

                  {request.status === "pending" && canAssignToVendor && vendors.length > 0 && (
                    <div className="space-y-2 pt-3 border-t">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Assign to Vendor Organization</span>
                      </div>
                      {request.vendorAssigneeId && (
                        <div className="text-xs text-muted-foreground pb-1">
                          Currently assigned to: {getVendorDisplayName(vendors.find(v => v.id === request.vendorAssigneeId) || { id: '', username: 'Unknown Vendor' } as UserType)}
                        </div>
                      )}
                      <Select 
                        value={selectedVendorId} 
                        onValueChange={setSelectedVendorId}
                      >
                        <SelectTrigger data-testid="select-vendor">
                          <SelectValue placeholder="Select a vendor..." />
                        </SelectTrigger>
                        <SelectContent>
                          {vendors.map((vendor) => (
                            <SelectItem 
                              key={vendor.id} 
                              value={vendor.id}
                              data-testid={`select-vendor-${vendor.id}`}
                            >
                              <span className="flex items-center gap-2">
                                {getVendorDisplayName(vendor)}
                                {vendor.id === request.vendorAssigneeId && (
                                  <Badge variant="secondary" className="text-xs">Current</Badge>
                                )}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        onClick={() => assignVendorMutation.mutate(selectedVendorId)}
                        disabled={!selectedVendorId || assignVendorMutation.isPending || selectedVendorId === request.vendorAssigneeId}
                        variant="outline"
                        className="w-full"
                        data-testid="button-assign-vendor"
                      >
                        {assignVendorMutation.isPending ? "Assigning..." : "Assign to Vendor"}
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        Assigns job to vendor organization. A specific designer can be assigned later.
                      </p>
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
                  {request.vendorAssigneeId && !request.assigneeId && (
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-yellow-500" />
                      <span className="text-sm text-dark-blue-night">Assigned to Vendor</span>
                      {request.vendorAssignedAt && (
                        <span className="text-xs text-dark-gray ml-auto">
                          {format(new Date(request.vendorAssignedAt), "MMM dd, h:mm a")}
                        </span>
                      )}
                    </div>
                  )}
                  {request.assigneeId && (
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                      <span className="text-sm text-dark-blue-night">Assigned to Designer</span>
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
