import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useRoute, Link } from "wouter";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { FileUploader } from "@/components/FileUploader";
import { ImagePreviewTooltip } from "@/components/ImagePreviewTooltip";
import { apiRequest } from "@/lib/queryClient";
import { calculateServicePrice } from "@/lib/pricing";
import { 
  ArrowLeft, 
  Download, 
  Calendar, 
  FileText, 
  Send,
  AlertCircle,
  CheckCircle2,
  Clock,
  RefreshCw,
  Users,
  Reply,
  X,
  XCircle,
  Upload,
  Trash2,
  DollarSign,
  Building2
} from "lucide-react";
import type { ServiceRequest, Service, User as UserType, ServiceAttachment, Comment, VendorProfile } from "@shared/schema";

interface CurrentUser {
  userId: string;
  role: string;
  username: string;
}

interface DeliveryVersion {
  id: string;
  requestId: string;
  version: number;
  deliveredBy: string;
  deliveredAt: string;
  files: Array<{ url: string; fileName: string }>;
  deliverer: { id: string; username: string; role: string } | null;
}

const statusConfig: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  "pending": { label: "Pending", color: "bg-yellow-100 text-yellow-800 border-yellow-200", icon: Clock },
  "in-progress": { label: "In Progress", color: "bg-blue-100 text-blue-800 border-blue-200", icon: RefreshCw },
  "delivered": { label: "Delivered", color: "bg-green-100 text-green-800 border-green-200", icon: CheckCircle2 },
  "change-request": { label: "Change Request", color: "bg-orange-100 text-orange-800 border-orange-200", icon: AlertCircle },
  "canceled": { label: "Canceled", color: "bg-gray-100 text-gray-800 border-gray-200", icon: XCircle },
};

export default function JobDetailView() {
  const [, params] = useRoute("/jobs/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get the "from" query parameter to determine back navigation
  const urlParams = new URLSearchParams(window.location.search);
  const fromPage = urlParams.get("from");
  const backUrl = fromPage === "profit-report" ? "/reports/services-profit" : "/service-requests";

  const [changeNote, setChangeNote] = useState("");
  const [commentText, setCommentText] = useState("");
  const [commentTab, setCommentTab] = useState<"public" | "internal">("public");
  const [deliverableUrls, setDeliverableUrls] = useState<{ url: string; name: string }[]>([]);
  const [finalStoreUrl, setFinalStoreUrl] = useState<string>("");
  const [selectedDesignerId, setSelectedDesignerId] = useState<string>("");
  const [selectedVendorId, setSelectedVendorId] = useState<string>("");
  const [changeRequestModalOpen, setChangeRequestModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  const [mentionCursorPosition, setMentionCursorPosition] = useState(0);
  const commentTextareaRef = useRef<HTMLTextAreaElement>(null);

  const requestId = params?.id;

  const { data: currentUser } = useQuery<CurrentUser>({
    queryKey: ["/api/default-user"],
  });

  const { data: request, isLoading: loadingRequest } = useQuery<ServiceRequest>({
    queryKey: ["/api/service-requests", requestId],
    enabled: !!requestId,
  });

  const { data: service } = useQuery<Service>({
    queryKey: ["/api/services", request?.serviceId],
    enabled: !!request?.serviceId,
  });

  // Fetch service fields with input field details to identify delivery fields
  interface ServiceFieldWithInput {
    id: string;
    inputFieldId: string;
    uiGroup: string | null;
    sortOrder: number;
    inputField: {
      id: string;
      fieldKey: string;
      label: string;
      inputType: string;
      inputFor: string;
    } | null;
  }
  
  const { data: serviceFields = [] } = useQuery<ServiceFieldWithInput[]>({
    queryKey: ["/api/services", request?.serviceId, "form-fields"],
    enabled: !!request?.serviceId,
  });

  // Get delivery fields for this service
  const deliveryFields = serviceFields.filter(sf => sf.inputField?.inputFor === "delivery");

  const { data: attachments = [] } = useQuery<ServiceAttachment[]>({
    queryKey: ["/api/service-requests", requestId, "attachments"],
    enabled: !!requestId,
  });

  const { data: comments = [], refetch: refetchComments } = useQuery<Comment[]>({
    queryKey: ["/api/service-requests", requestId, "comments"],
    enabled: !!requestId && !!currentUser,
  });

  // Fetch delivery versions (for file deliverables versioning)
  const { data: deliveryVersions = [] } = useQuery<DeliveryVersion[]>({
    queryKey: ["/api/service-requests", requestId, "deliveries"],
    enabled: !!requestId,
  });

  const { data: allUsers = [] } = useQuery<UserType[]>({
    queryKey: ["/api/users"],
  });

  const { data: vendorProfiles = [] } = useQuery<VendorProfile[]>({
    queryKey: ["/api/vendor-profiles"],
  });

  // Get users that the current user can assign to (role-based filtering)
  const { data: assignableUsers = [] } = useQuery<UserType[]>({
    queryKey: ["/api/assignable-users"],
    enabled: !!currentUser,
  });

  // Get vendors for vendor assignment (admin/internal_designer only)
  const canAssignToVendor = ["admin", "internal_designer"].includes(currentUser?.role || "");
  const vendors = allUsers.filter(u => u.role === "vendor" && u.isActive);
  
  // Helper to get vendor company name from profile
  const getVendorDisplayName = (vendorUser: UserType) => {
    const profile = vendorProfiles.find(p => p.userId === vendorUser.id);
    return profile?.companyName || vendorUser.username;
  };

  const requestAttachments = attachments.filter(a => a.kind === "request");
  const deliverableAttachments = attachments.filter(a => a.kind === "deliverable");
  // Pending deliverables are unversioned attachments (not yet linked to a delivery)
  const pendingDeliverables = deliverableAttachments.filter(a => !a.deliveryId);

  const isDesigner = currentUser?.role === "designer";
  const isClient = currentUser?.role === "client" || currentUser?.role === "distributor";
  const canSeePricing = ["admin", "client"].includes(currentUser?.role || "");
  const canManageJobs = ["admin", "internal_designer", "vendor", "vendor_designer", "designer"].includes(currentUser?.role || "");
  const canTakeJob = ["admin", "internal_designer", "designer", "vendor_designer"].includes(currentUser?.role || "");

  useEffect(() => {
    if (request?.assigneeId) {
      setSelectedDesignerId(request.assigneeId);
    }
  }, [request?.assigneeId]);


  const assignMutation = useMutation({
    mutationFn: async (designerId?: string) => {
      return apiRequest("POST", `/api/service-requests/${requestId}/assign`, { 
        designerId: designerId || undefined 
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-requests", requestId] });
      queryClient.invalidateQueries({ queryKey: ["/api/service-requests"] });
      setSelectedDesignerId("");
      toast({ title: "Job assigned", description: "The job has been assigned successfully." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to assign job.", variant: "destructive" });
    },
  });

  const assignVendorMutation = useMutation({
    mutationFn: async (vendorId: string) => {
      return apiRequest("POST", `/api/service-requests/${requestId}/assign-vendor`, { 
        vendorId 
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-requests", requestId] });
      queryClient.invalidateQueries({ queryKey: ["/api/service-requests"] });
      setSelectedVendorId("");
      toast({ title: "Vendor assigned", description: "The job has been assigned to the vendor organization." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to assign vendor.", variant: "destructive" });
    },
  });

  const deliverMutation = useMutation({
    mutationFn: async (data: { finalStoreUrl?: string }) => {
      return apiRequest("POST", `/api/service-requests/${requestId}/deliver`, {
        finalStoreUrl: data.finalStoreUrl || undefined
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-requests", requestId] });
      queryClient.invalidateQueries({ queryKey: ["/api/service-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/service-requests", requestId, "deliveries"] });
      setFinalStoreUrl("");
      toast({ title: "Deliverables submitted", description: "The job has been marked as delivered." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to submit deliverables.", variant: "destructive" });
    },
  });

  const deleteAttachmentMutation = useMutation({
    mutationFn: async (attachmentId: string) => {
      return apiRequest("DELETE", `/api/attachments/${attachmentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-requests", requestId, "attachments"] });
      toast({ title: "File removed", description: "The pending file has been deleted." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete file.", variant: "destructive" });
    },
  });

  const changeRequestMutation = useMutation({
    mutationFn: async (note: string) => {
      return apiRequest("POST", `/api/service-requests/${requestId}/change-request`, { 
        changeNote: note
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-requests", requestId] });
      queryClient.invalidateQueries({ queryKey: ["/api/service-requests"] });
      refetchComments();
      setChangeNote("");
      setChangeRequestModalOpen(false);
      toast({ title: "Change requested", description: "The designer has been notified." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to request changes.", variant: "destructive" });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/service-requests/${requestId}/resume`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-requests", requestId] });
      queryClient.invalidateQueries({ queryKey: ["/api/service-requests"] });
      toast({ title: "Work resumed", description: "The job is back in progress." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to resume work.", variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/service-requests/${requestId}/cancel`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-requests", requestId] });
      queryClient.invalidateQueries({ queryKey: ["/api/service-requests"] });
      toast({ title: "Request canceled", description: "The service request has been canceled." });
      navigate("/service-requests");
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to cancel request.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", `/api/service-requests/${requestId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-requests"] });
      toast({ title: "Job deleted", description: "The service request has been permanently deleted." });
      navigate("/service-requests");
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete job.", variant: "destructive" });
    },
  });

  const addCommentMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/service-requests/${requestId}/comments`, {
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

  const addAttachmentMutation = useMutation({
    mutationFn: async (data: { fileUrl: string; fileName: string; kind: string }) => {
      return apiRequest("POST", `/api/service-requests/${requestId}/attachments`, {
        fileName: data.fileName,
        fileUrl: data.fileUrl,
        fileType: data.fileName.split(".").pop(),
        kind: data.kind,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-requests", requestId, "attachments"] });
    },
  });

  const handleDeliverableUpload = async (fileUrl: string, fileName: string) => {
    setDeliverableUrls(prev => [...prev, { url: fileUrl, name: fileName }]);
    await addAttachmentMutation.mutateAsync({ fileUrl, fileName, kind: "deliverable" });
  };

  const handleTakeJob = (designerId?: string) => {
    assignMutation.mutate(designerId);
  };

  // Use role-based filtered assignable users from backend
  const designers = assignableUsers;
  const isAssignee = currentUser?.userId === request?.assigneeId;

  const handleDeliver = () => {
    deliverMutation.mutate({ finalStoreUrl });
  };

  const handleRequestChange = () => {
    if (changeNote.trim()) {
      changeRequestMutation.mutate(changeNote);
    }
  };

  const handleResume = () => {
    resumeMutation.mutate();
  };

  const handleCancel = () => {
    cancelMutation.mutate();
  };

  const getUserById = (id: string | null) => {
    if (!id) return null;
    return allUsers.find(u => u.id === id);
  };

  const handleCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart;
    setCommentText(value);
    setMentionCursorPosition(cursorPos);

    const textBeforeCursor = value.substring(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf("@");
    
    if (atIndex !== -1 && (atIndex === 0 || textBeforeCursor[atIndex - 1] === " ")) {
      const searchText = textBeforeCursor.substring(atIndex + 1);
      if (!searchText.includes(" ")) {
        setMentionSearch(searchText.toLowerCase());
        setShowMentionDropdown(true);
        return;
      }
    }
    setShowMentionDropdown(false);
    setMentionSearch("");
  };

  const insertMention = (user: UserType) => {
    const textBeforeCursor = commentText.substring(0, mentionCursorPosition);
    const atIndex = textBeforeCursor.lastIndexOf("@");
    const textBeforeAt = commentText.substring(0, atIndex);
    const textAfterCursor = commentText.substring(mentionCursorPosition);
    
    const newText = `${textBeforeAt}@${user.username} ${textAfterCursor}`;
    setCommentText(newText);
    setShowMentionDropdown(false);
    setMentionSearch("");
    
    setTimeout(() => {
      commentTextareaRef.current?.focus();
    }, 0);
  };

  const filteredMentionUsers = allUsers.filter(
    user => user.username.toLowerCase().includes(mentionSearch)
  );

  const getTopLevelComments = (visibility: "public" | "internal") => {
    return comments.filter(c => c.visibility === visibility && !c.parentId);
  };

  const getReplies = (parentId: string) => {
    return comments.filter(c => c.parentId === parentId);
  };

  const isChangeRequestComment = (comment: Comment) => {
    return comment.body.startsWith("[Change Request]");
  };

  if (loadingRequest) {
    return (
      <div className="min-h-screen bg-off-white-cream flex items-center justify-center">
        <div className="text-dark-gray">Loading job details...</div>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="min-h-screen bg-off-white-cream flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-dark-blue-night mb-2">Job not found</h2>
          <Link href={backUrl}>
            <Button variant="outline">Back</Button>
          </Link>
        </div>
      </div>
    );
  }

  const StatusIcon = statusConfig[request.status]?.icon || Clock;
  const assignedDesigner = getUserById(request.assigneeId);
  const showDeliverablesAtTop = request.status === "delivered" || request.status === "change-request";

  const renderCommentThread = (comment: Comment, isReply = false) => {
    const author = getUserById(comment.authorId);
    const replies = getReplies(comment.id);
    const isChangeRequest = isChangeRequestComment(comment);
    
    return (
      <div key={comment.id} className={`${isReply ? "ml-10 mt-3" : ""}`}>
        <div className="flex gap-3">
          <Avatar className="h-8 w-8 flex-shrink-0">
            <AvatarFallback className={`${comment.visibility === "internal" ? "bg-purple-500" : "bg-sky-blue-accent"} text-white text-xs`}>
              {author?.username?.slice(0, 2).toUpperCase() || "NS"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-dark-blue-night">
                {author?.username || "Unknown"}
              </span>
              <Badge variant="outline" className={`text-xs ${comment.visibility === "internal" ? "bg-purple-50" : ""}`}>
                {author?.role === "designer" ? "Designer" : "Distributor"}
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

  // Check if this service has specific delivery fields configured
  const hasDeliveryFilesField = deliveryFields.some(df => df.inputField?.fieldKey === "delivery_files");
  const hasFinalStoreUrlField = deliveryFields.some(df => df.inputField?.fieldKey === "final_store_url");

  // Get stored final_store_url from formData if it was already saved
  const formData = request?.formData as Record<string, unknown> | null;
  const storedFinalStoreUrl = formData?.final_store_url as string | undefined;

  const DeliverablesSection = () => (
    <Card className={showDeliverablesAtTop ? "border-green-200 bg-green-50/30" : ""}>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          {showDeliverablesAtTop && <CheckCircle2 className="h-5 w-5 text-green-600" />}
          Deliverables
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Show versioned file deliveries (newest to oldest) */}
        {deliveryVersions.length > 0 && (
          <div className="space-y-4">
            {deliveryVersions.map((delivery) => (
              <div 
                key={delivery.id}
                className={`p-4 rounded-lg border ${delivery.version === deliveryVersions[0]?.version ? 'bg-green-50 border-green-200' : 'bg-muted/30 border-muted'}`}
                data-testid={`delivery-version-${delivery.version}`}
              >
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={delivery.version === deliveryVersions[0]?.version ? "default" : "secondary"}>
                      v{delivery.version}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Delivered by {delivery.deliverer?.username || "Unknown"} on {format(new Date(delivery.deliveredAt), "MMM dd, yyyy 'at' h:mm a")}
                    </span>
                  </div>
                  {delivery.version === deliveryVersions[0]?.version && (
                    <Badge variant="outline" className="text-green-600 border-green-300">Latest</Badge>
                  )}
                </div>
                <div className="space-y-2">
                  {(delivery.files as Array<{ url: string; fileName: string }>).map((file, fileIndex) => (
                    <div 
                      key={`${delivery.id}-${fileIndex}`}
                      className="flex items-center justify-between p-2 bg-background rounded border"
                    >
                      <div className="flex items-center gap-3">
                        <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                        <ImagePreviewTooltip
                          fileUrl={file.url}
                          fileName={file.fileName}
                          thumbnailSize="sm"
                        />
                        <span className="text-sm text-dark-blue-night truncate">{file.fileName}</span>
                      </div>
                      <a href={file.url} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" variant="default" data-testid={`button-download-v${delivery.version}-file-${fileIndex}`}>
                          <Download className="h-3 w-3 mr-1" />
                          Download
                        </Button>
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Show pending uploads (unversioned attachments waiting for next delivery) */}
        {pendingDeliverables.length > 0 && (
          <div className="p-4 rounded-lg border bg-blue-50 border-blue-200" data-testid="pending-deliverables">
            <div className="flex items-center gap-2 mb-3">
              <Badge variant="outline" className="text-blue-600 border-blue-300">
                Pending v{deliveryVersions.length > 0 ? deliveryVersions[0].version + 1 : 1}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {pendingDeliverables.length} file{pendingDeliverables.length !== 1 ? 's' : ''} ready for delivery
              </span>
            </div>
            <div className="space-y-2">
              {pendingDeliverables.map((attachment) => (
                <div 
                  key={attachment.id}
                  className="flex items-center justify-between p-2 bg-background rounded border"
                >
                  <div className="flex items-center gap-3">
                    <Upload className="h-4 w-4 text-blue-600 flex-shrink-0" />
                    <ImagePreviewTooltip
                      fileUrl={attachment.fileUrl}
                      fileName={attachment.fileName}
                      thumbnailSize="sm"
                    />
                    <span className="text-sm text-dark-blue-night truncate">{attachment.fileName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <a href={attachment.fileUrl} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="outline" data-testid={`button-download-pending-${attachment.id}`}>
                        <Download className="h-3 w-3 mr-1" />
                        Preview
                      </Button>
                    </a>
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      className="text-destructive hover:text-destructive"
                      onClick={() => deleteAttachmentMutation.mutate(attachment.id)}
                      disabled={deleteAttachmentMutation.isPending}
                      data-testid={`button-delete-pending-${attachment.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Fallback: Show unversioned deliverable attachments for backwards compatibility (only when no versions exist) */}
        {deliveryVersions.length === 0 && pendingDeliverables.length === 0 && deliverableAttachments.length > 0 && (
          <div className="space-y-2">
            {deliverableAttachments.map((attachment) => (
              <div 
                key={attachment.id}
                className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                  <ImagePreviewTooltip
                    fileUrl={attachment.fileUrl}
                    fileName={attachment.fileName}
                    thumbnailSize="sm"
                  />
                  <span className="text-sm text-dark-blue-night flex-1 truncate">{attachment.fileName}</span>
                </div>
                <a href={attachment.fileUrl} target="_blank" rel="noopener noreferrer">
                  <Button size="sm" variant="default" data-testid={`button-download-deliverable-${attachment.id}`}>
                    <Download className="h-3 w-3 mr-1" />
                    Download
                  </Button>
                </a>
              </div>
            ))}
          </div>
        )}

        {/* Show stored final store URL if delivered (Final Store URL is NOT versioned) */}
        {storedFinalStoreUrl && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
            <Label className="text-sm font-medium text-dark-gray mb-1">Final Store URL</Label>
            <a 
              href={storedFinalStoreUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-sm text-sky-blue-accent hover:underline block"
              data-testid="link-final-store-url"
            >
              {storedFinalStoreUrl}
            </a>
          </div>
        )}

        {deliveryVersions.length === 0 && deliverableAttachments.length === 0 && !storedFinalStoreUrl && !canManageJobs && (
          <p className="text-sm text-dark-gray">No deliverables uploaded yet</p>
        )}

        {/* Show delivery field inputs for designers when job is in-progress or change-request */}
        {canManageJobs && (request.status === "in-progress" || request.status === "change-request") && (
          <div className="space-y-4">
            {/* Render file upload field if delivery_files is configured for this service */}
            {(hasDeliveryFilesField || deliveryFields.length === 0) && (
              <div>
                <Label className="text-sm font-medium text-dark-blue-night mb-2 block">
                  {deliveryFields.find(df => df.inputField?.fieldKey === "delivery_files")?.inputField?.label || "Upload Delivery Files"}
                </Label>
                <FileUploader onUploadComplete={handleDeliverableUpload} />
              </div>
            )}

            {/* Render URL input if final_store_url is configured for this service */}
            {hasFinalStoreUrlField && (
              <div>
                <Label className="text-sm font-medium text-dark-blue-night mb-2 block">
                  {deliveryFields.find(df => df.inputField?.fieldKey === "final_store_url")?.inputField?.label || "Final Store URL"}
                </Label>
                <Input
                  type="url"
                  placeholder="https://..."
                  value={finalStoreUrl}
                  onChange={(e) => setFinalStoreUrl(e.target.value)}
                  data-testid="input-final-store-url"
                />
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );

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
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setChangeRequestModalOpen(false)}
              data-testid="button-cancel-change-request"
            >
              Cancel
            </Button>
            <Button
              onClick={handleRequestChange}
              disabled={!changeNote.trim() || changeRequestMutation.isPending}
              className="bg-red-600 hover:bg-red-700 text-white"
              data-testid="button-submit-change-request"
            >
              {changeRequestMutation.isPending ? "Submitting..." : "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Job</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete job A-{request?.id?.slice(0, 5).toUpperCase()}? This action cannot be undone and will permanently remove this service request and all associated data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
                <h1 className="text-2xl font-bold text-dark-blue-night" data-testid="text-job-title">
                  {service?.title || "Service Request"}
                </h1>
                {(() => {
                  if (currentUser?.role !== "admin" && currentUser?.role !== "client") return null;
                  const price = calculateServicePrice({
                    serviceTitle: service?.title,
                    pricingStructure: service?.pricingStructure,
                    basePrice: service?.basePrice,
                    formData: request.formData as Record<string, any> | null,
                    finalPrice: request.finalPrice,
                  });
                  if (!price || price === "N/A") return null;
                  return (
                    <Badge variant="outline" className="text-sm bg-green-50 text-green-700 border-green-200" data-testid="text-job-price">
                      <DollarSign className="h-3 w-3 mr-0.5" />
                      {price.replace('$', '')}
                    </Badge>
                  );
                })()}
                <Badge variant="outline" className="text-sm" data-testid="text-job-id">
                  A-{request.id.slice(0, 5).toUpperCase()}
                </Badge>
                <Badge className={`${statusConfig[request.status]?.color || ""}`} data-testid="text-job-status">
                  <StatusIcon className="h-3 w-3 mr-1" />
                  {statusConfig[request.status]?.label || request.status}
                </Badge>
              </div>
              <p className="text-sm text-dark-gray mt-1" data-testid="text-created-date">
                Created on {format(new Date(request.createdAt), "MMMM do, yyyy")} at {format(new Date(request.createdAt), "h:mm a")}
                {request.deliveredAt && (
                  <span className="ml-2">
                    • Delivered on {format(new Date(request.deliveredAt), "MMMM do, yyyy")} at {format(new Date(request.deliveredAt), "h:mm a")}
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 ml-auto">
            {currentUser?.role === "admin" && (
              <Button 
                variant="outline" 
                className="border-red-500 text-red-600 hover:bg-red-50"
                onClick={() => setDeleteModalOpen(true)}
                data-testid="button-delete-job"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete Job
              </Button>
            )}

            {request.status === "pending" && (
              <>
                <Button 
                  variant="outline" 
                  className="border-red-300 text-red-600"
                  onClick={handleCancel}
                  disabled={cancelMutation.isPending}
                  data-testid="button-cancel-request"
                >
                  {cancelMutation.isPending ? "Canceling..." : "Cancel Request"}
                </Button>
                <Button 
                  className="bg-sky-blue-accent hover:bg-sky-blue-accent/90"
                  data-testid="button-save"
                >
                  Save
                </Button>
              </>
            )}

            {request.status === "in-progress" && (isAssignee || currentUser?.role === "admin") && (
              <>
                <Button 
                  variant="outline" 
                  className="border-red-300 text-red-600"
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleDeliver}
                  disabled={deliverMutation.isPending || (deliverableAttachments.length === 0 && deliverableUrls.length === 0)}
                  className="bg-sky-blue-accent hover:bg-sky-blue-accent/90"
                  data-testid="button-deliver"
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

            {request.status === "change-request" && (isAssignee || currentUser?.role === "admin") && (
              <>
                <Button 
                  variant="outline" 
                  className="border-red-300 text-red-600"
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleDeliver}
                  disabled={deliverMutation.isPending || (deliverableAttachments.length === 0 && deliverableUrls.length === 0)}
                  className="bg-sky-blue-accent hover:bg-sky-blue-accent/90"
                  data-testid="button-deliver"
                >
                  {deliverMutation.isPending ? "Delivering..." : "Deliver"}
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {showDeliverablesAtTop && <DeliverablesSection />}

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">General Info</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                {/* System fields: Client and Assignee */}
                <div className="p-3 bg-blue-lavender/30 rounded-lg">
                  <p className="text-xs text-dark-gray mb-1">Client</p>
                  <p className="text-sm font-medium text-dark-blue-night" data-testid="text-client">
                    {request.customerName || "N/A"}
                  </p>
                </div>

                {canManageJobs && (
                  <div className="p-3 bg-blue-lavender/30 rounded-lg">
                    <p className="text-xs text-dark-gray mb-1">Assignee</p>
                    <p className="text-sm font-medium text-dark-blue-night" data-testid="text-assignee">
                      {assignedDesigner?.username || "Unassigned"}
                    </p>
                  </div>
                )}
                
                {/* Render dynamic general_info fields from formData */}
                {(() => {
                  const formData = request.formData as Record<string, unknown> | null;
                  if (!formData || serviceFields.length === 0) return null;
                  
                  // Get general_info fields from serviceFields, sorted by sortOrder
                  const generalInfoFields = serviceFields
                    .filter(sf => sf.uiGroup === "general_info" && sf.inputField)
                    .sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999));
                  
                  if (generalInfoFields.length === 0) return null;
                  
                  return generalInfoFields.map(sf => {
                    const fieldKey = sf.inputField!.fieldKey;
                    const value = formData[fieldKey];
                    
                    // Skip empty values
                    if (value === null || value === undefined || value === "") return null;
                    
                    let displayValue: string;
                    if (typeof value === "boolean") {
                      displayValue = value ? "Yes" : "No";
                    } else if (Array.isArray(value)) {
                      displayValue = value.join(", ");
                    } else if (typeof value === "number" && value === 0) {
                      displayValue = "0";
                    } else {
                      displayValue = String(value);
                    }
                    
                    return (
                      <div key={fieldKey} className="p-3 bg-blue-lavender/30 rounded-lg">
                        <p className="text-xs text-dark-gray mb-1">{sf.inputField!.label || fieldKey}</p>
                        <p className="text-sm font-medium text-dark-blue-night" data-testid={`text-${fieldKey}`}>
                          {displayValue}
                        </p>
                      </div>
                    );
                  });
                })()}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Info Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Helper function to render file sections */}
                {(() => {
                  const formData = request.formData as Record<string, unknown> | null;
                  const uploadedFiles = formData?.uploadedFiles as Record<string, Array<{ url?: string; name?: string; fileName?: string; objectPath?: string }>> | null;
                  
                  const renderFileSection = (label: string, fieldName: string, testIdPrefix: string) => {
                    // For artwork files, check both uploadAssets and artworkFile keys
                    let files = uploadedFiles?.[fieldName] || [];
                    if (fieldName === 'uploadAssets' && files.length === 0) {
                      files = uploadedFiles?.['artworkFile'] || [];
                    }
                    
                    if (files.length === 0) {
                      return (
                        <div key={fieldName}>
                          <p className="text-xs text-dark-gray mb-2">{label}</p>
                          <p className="text-sm text-dark-gray">No files uploaded</p>
                        </div>
                      );
                    }
                    
                    return (
                      <div key={fieldName}>
                        <p className="text-xs text-dark-gray mb-2">{label}</p>
                        <div className="flex flex-col gap-2">
                          {files.map((file, index) => {
                            const fileName = file.name || file.fileName || 'Unknown file';
                            let fileUrl = file.url || file.objectPath || '';
                            
                            // If objectPath doesn't start with http, prepend /objects prefix
                            if (file.objectPath && !file.objectPath.startsWith('http')) {
                              fileUrl = `/objects/${file.objectPath}`;
                            }
                            
                            if (!fileUrl) return null;
                            
                            return (
                              <div 
                                key={`${fieldName}-${index}`}
                                className="flex items-center gap-3 p-3 bg-blue-lavender/30 rounded-lg w-full"
                              >
                                <ImagePreviewTooltip
                                  fileUrl={fileUrl}
                                  fileName={fileName}
                                  thumbnailSize="sm"
                                />
                                <span className="text-sm text-dark-blue-night flex-1 truncate">{fileName}</span>
                                <a 
                                  href={fileUrl} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                >
                                  <Button size="sm" variant="default" data-testid={`button-download-${testIdPrefix}-${index}`}>
                                    <Download className="h-3 w-3 mr-1" />
                                    Download
                                  </Button>
                                </a>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  };
                  
                  // Check if this is Store Creation form (has storeName field)
                  const isStoreCreation = formData?.storeName !== undefined;
                  
                  if (isStoreCreation) {
                    const artworkFiles = uploadedFiles?.uploadAssets || [];
                    return (
                      <>
                        {/* Artwork (Upload Assets) */}
                        {artworkFiles.length > 0 ? (
                          <div>
                            <p className="text-xs text-dark-gray mb-2">Artwork</p>
                            <div className="flex flex-col gap-2">
                              {artworkFiles.map((file, index) => {
                                const fileName = file.name || file.fileName || 'Unknown file';
                                let fileUrl = file.url || file.objectPath || '';
                                if (file.objectPath && !file.objectPath.startsWith('http')) {
                                  fileUrl = `/objects/${file.objectPath}`;
                                }
                                if (!fileUrl) return null;
                                return (
                                  <div 
                                    key={`artwork-${index}`}
                                    className="flex items-center gap-3 p-3 bg-blue-lavender/30 rounded-lg w-full"
                                  >
                                    <ImagePreviewTooltip
                                      fileUrl={fileUrl}
                                      fileName={fileName}
                                      thumbnailSize="sm"
                                    />
                                    <span className="text-sm text-dark-blue-night flex-1 truncate">{fileName}</span>
                                    <a href={fileUrl} target="_blank" rel="noopener noreferrer">
                                      <Button size="sm" variant="default" data-testid={`button-download-artwork-${index}`}>
                                        <Download className="h-3 w-3 mr-1" />
                                        Download
                                      </Button>
                                    </a>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <div>
                            <p className="text-xs text-dark-gray mb-2">Artwork</p>
                            <p className="text-sm text-dark-gray">No artwork files uploaded</p>
                          </div>
                        )}
                      </>
                    );
                  }
                  
                  // Check if this is Flyer Design form (has colorMode or flyerOrientation)
                  const isFlyerDesign = formData?.colorMode !== undefined || formData?.flyerOrientation !== undefined;
                  
                  if (isFlyerDesign) {
                    const artworkFiles = uploadedFiles?.uploadAssets || uploadedFiles?.artworkFile || [];
                    return (
                      <>
                        {/* Artwork */}
                        {artworkFiles.length > 0 ? (
                          <div>
                            <p className="text-xs text-dark-gray mb-2">Artwork</p>
                            <div className="flex flex-col gap-2">
                              {artworkFiles.map((file, index) => {
                                const fileName = file.name || file.fileName || 'Unknown file';
                                let fileUrl = file.url || file.objectPath || '';
                                if (file.objectPath && !file.objectPath.startsWith('http')) {
                                  fileUrl = `/objects/${file.objectPath}`;
                                }
                                if (!fileUrl) return null;
                                return (
                                  <div 
                                    key={`artwork-${index}`}
                                    className="flex items-center gap-3 p-3 bg-blue-lavender/30 rounded-lg w-full"
                                  >
                                    <ImagePreviewTooltip
                                      fileUrl={fileUrl}
                                      fileName={fileName}
                                      thumbnailSize="sm"
                                    />
                                    <span className="text-sm text-dark-blue-night flex-1 truncate">{fileName}</span>
                                    <a href={fileUrl} target="_blank" rel="noopener noreferrer">
                                      <Button size="sm" variant="default" data-testid={`button-download-artwork-${index}`}>
                                        <Download className="h-3 w-3 mr-1" />
                                        Download
                                      </Button>
                                    </a>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <div>
                            <p className="text-xs text-dark-gray mb-2">Artwork</p>
                            <p className="text-sm text-dark-gray">No artwork files uploaded</p>
                          </div>
                        )}
                        
                        {/* Width | Height */}
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs text-dark-gray mb-1">Width (inches)</p>
                            <p className="text-sm text-dark-blue-night font-medium" data-testid="text-formdata-widthInches">
                              {String(formData?.widthInches || "N/A")}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-dark-gray mb-1">Height (inches)</p>
                            <p className="text-sm text-dark-blue-night font-medium" data-testid="text-formdata-heightInches">
                              {String(formData?.heightInches || "N/A")}
                            </p>
                          </div>
                        </div>
                        
                        {/* Flyer Orientation (below Width) */}
                        {formData?.flyerOrientation && (
                          <div>
                            <p className="text-xs text-dark-gray mb-1">Flyer Orientation</p>
                            <p className="text-sm text-dark-blue-night font-medium" data-testid="text-formdata-flyerOrientation">
                              {String(formData?.flyerOrientation)}
                            </p>
                          </div>
                        )}
                        
                        {/* Output Format | Color Mode */}
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs text-dark-gray mb-1">Output Format</p>
                            <p className="text-sm text-dark-blue-night font-medium" data-testid="text-formdata-outputFormat">
                              {String(formData?.outputFormat || "N/A")}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-dark-gray mb-1">Color Mode</p>
                            <p className="text-sm text-dark-blue-night font-medium" data-testid="text-formdata-colorMode">
                              {String(formData?.colorMode || "N/A")}
                            </p>
                          </div>
                        </div>
                        
                        {/* Text Content (just above Job Notes) */}
                        {formData?.textContent && (
                          <div>
                            <p className="text-xs text-dark-gray mb-1">Text Content</p>
                            <p className="text-sm text-dark-blue-night font-medium" data-testid="text-formdata-textContent">
                              {String(formData?.textContent)}
                            </p>
                          </div>
                        )}
                      </>
                    );
                  }
                  
                  // Check if this is Store Banner Design form (has textContent + widthInches/heightInches but NO colorMode/flyerOrientation)
                  const isStoreBanner = formData?.textContent !== undefined && 
                    (formData?.widthInches !== undefined || formData?.heightInches !== undefined) &&
                    !formData?.colorMode && !formData?.flyerOrientation &&
                    !uploadedFiles?.brandGuidelines && !uploadedFiles?.inspirationFile;
                  
                  if (isStoreBanner) {
                    const artworkFiles = uploadedFiles?.uploadAssets || uploadedFiles?.artworkFile || [];
                    return (
                      <>
                        {/* Artwork */}
                        {artworkFiles.length > 0 ? (
                          <div>
                            <p className="text-xs text-dark-gray mb-2">Artwork</p>
                            <div className="flex flex-col gap-2">
                              {artworkFiles.map((file, index) => {
                                const fileName = file.name || file.fileName || 'Unknown file';
                                let fileUrl = file.url || file.objectPath || '';
                                if (file.objectPath && !file.objectPath.startsWith('http')) {
                                  fileUrl = `/objects/${file.objectPath}`;
                                }
                                if (!fileUrl) return null;
                                return (
                                  <div 
                                    key={`artwork-${index}`}
                                    className="flex items-center gap-3 p-3 bg-blue-lavender/30 rounded-lg w-full"
                                  >
                                    <ImagePreviewTooltip
                                      fileUrl={fileUrl}
                                      fileName={fileName}
                                      thumbnailSize="sm"
                                    />
                                    <span className="text-sm text-dark-blue-night flex-1 truncate">{fileName}</span>
                                    <a href={fileUrl} target="_blank" rel="noopener noreferrer">
                                      <Button size="sm" variant="default" data-testid={`button-download-artwork-${index}`}>
                                        <Download className="h-3 w-3 mr-1" />
                                        Download
                                      </Button>
                                    </a>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <div>
                            <p className="text-xs text-dark-gray mb-2">Artwork</p>
                            <p className="text-sm text-dark-gray">No artwork files uploaded</p>
                          </div>
                        )}
                        
                        {/* Width | Height */}
                        {(formData?.widthInches || formData?.heightInches) && (
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-xs text-dark-gray mb-1">Width (inches)</p>
                              <p className="text-sm text-dark-blue-night font-medium" data-testid="text-formdata-widthInches">
                                {String(formData?.widthInches || "N/A")}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-dark-gray mb-1">Height (inches)</p>
                              <p className="text-sm text-dark-blue-night font-medium" data-testid="text-formdata-heightInches">
                                {String(formData?.heightInches || "N/A")}
                              </p>
                            </div>
                          </div>
                        )}
                        
                        {/* Text Content */}
                        {formData?.textContent && (
                          <div>
                            <p className="text-xs text-dark-gray mb-1">Text Content</p>
                            <p className="text-sm text-dark-blue-night font-medium" data-testid="text-formdata-textContent">
                              {String(formData?.textContent)}
                            </p>
                          </div>
                        )}
                      </>
                    );
                  }
                  
                  // Check if this is Artwork Composition form (has specific fields)
                  const isArtworkComposition = uploadedFiles?.brandGuidelines || uploadedFiles?.inspirationFile;
                  
                  if (isArtworkComposition) {
                    return (
                      <>
                        {/* 1. Brand Guidelines */}
                        {renderFileSection("Brand Guidelines", "brandGuidelines", "brand-guidelines")}
                        
                        {/* 2. Width | Height */}
                        {(formData?.widthInches || formData?.heightInches) && (
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-xs text-dark-gray mb-1">Width (inches)</p>
                              <p className="text-sm text-dark-blue-night font-medium" data-testid="text-formdata-widthInches">
                                {String(formData?.widthInches || "N/A")}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-dark-gray mb-1">Height (inches)</p>
                              <p className="text-sm text-dark-blue-night font-medium" data-testid="text-formdata-heightInches">
                                {String(formData?.heightInches || "N/A")}
                              </p>
                            </div>
                          </div>
                        )}
                        
                        {/* 4. Output Format | Complexity */}
                        {(formData?.outputFormat || formData?.complexity) && (
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-xs text-dark-gray mb-1">Desired Output Format</p>
                              <p className="text-sm text-dark-blue-night font-medium" data-testid="text-formdata-outputFormat">
                                {String(formData?.outputFormat || "N/A")}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-dark-gray mb-1">Complexity</p>
                              <p className="text-sm text-dark-blue-night font-medium" data-testid="text-formdata-complexity">
                                {String(formData?.complexity || "N/A")}
                              </p>
                            </div>
                          </div>
                        )}
                        
                        {/* 5. Text Content (full width, left aligned) */}
                        {formData?.textContent && (
                          <div>
                            <p className="text-xs text-dark-gray mb-1">Text Content</p>
                            <p className="text-sm text-dark-blue-night font-medium" data-testid="text-formdata-textContent">
                              {String(formData?.textContent)}
                            </p>
                          </div>
                        )}
                        
                        {/* 5. Example / Inspiration */}
                        {renderFileSection("Example / Inspiration", "inspirationFile", "inspiration")}
                      </>
                    );
                  }
                  
                  // Default: show artworkFile for other form types
                  const artworkFiles = uploadedFiles?.artworkFile || [];
                  const garmentTemplates = uploadedFiles?.garmentTemplates || [];
                  
                  // Check if this is Dye Sublimation Template form (has garmentTemplates)
                  if (garmentTemplates.length > 0) {
                    return (
                      <>
                        {/* Artwork Files */}
                        {artworkFiles.length > 0 && (
                          <div>
                            <p className="text-xs text-dark-gray mb-2">Artwork Files</p>
                            <div className="flex flex-col gap-2">
                              {artworkFiles.map((file, index) => {
                                const fileName = file.name || file.fileName || 'Unknown file';
                                let fileUrl = file.url || file.objectPath || '';
                                if (file.objectPath && !file.objectPath.startsWith('http')) {
                                  fileUrl = `/objects/${file.objectPath}`;
                                }
                                if (!fileUrl) return null;
                                return (
                                  <div 
                                    key={`artwork-${index}`}
                                    className="flex items-center gap-3 p-3 bg-blue-lavender/30 rounded-lg w-full"
                                  >
                                    <ImagePreviewTooltip
                                      fileUrl={fileUrl}
                                      fileName={fileName}
                                      thumbnailSize="sm"
                                    />
                                    <span className="text-sm text-dark-blue-night flex-1 truncate">{fileName}</span>
                                    <a href={fileUrl} target="_blank" rel="noopener noreferrer">
                                      <Button size="sm" variant="default" data-testid={`button-download-artwork-${index}`}>
                                        <Download className="h-3 w-3 mr-1" />
                                        Download
                                      </Button>
                                    </a>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        
                        {/* Garment or Product Template by Size */}
                        <div>
                          <p className="text-xs text-dark-gray mb-2">Garment or Product Template by Size</p>
                          <div className="flex flex-col gap-2">
                            {garmentTemplates.map((file, index) => {
                              const fileName = file.name || file.fileName || 'Unknown file';
                              let fileUrl = file.url || file.objectPath || '';
                              if (file.objectPath && !file.objectPath.startsWith('http')) {
                                fileUrl = `/objects/${file.objectPath}`;
                              }
                              if (!fileUrl) return null;
                              return (
                                <div 
                                  key={`garment-${index}`}
                                  className="flex items-center gap-3 p-3 bg-blue-lavender/30 rounded-lg w-full"
                                >
                                  <ImagePreviewTooltip
                                    fileUrl={fileUrl}
                                    fileName={fileName}
                                    thumbnailSize="sm"
                                  />
                                  <span className="text-sm text-dark-blue-night flex-1 truncate">{fileName}</span>
                                  <a href={fileUrl} target="_blank" rel="noopener noreferrer">
                                    <Button size="sm" variant="default" data-testid={`button-download-garment-${index}`}>
                                      <Download className="h-3 w-3 mr-1" />
                                      Download
                                    </Button>
                                  </a>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </>
                    );
                  }
                  
                  if (artworkFiles.length > 0) {
                    return (
                      <div>
                        <p className="text-xs text-dark-gray mb-2">Artwork Files</p>
                        <div className="flex flex-col gap-2">
                          {artworkFiles.map((file, index) => {
                            const fileName = file.name || file.fileName || 'Unknown file';
                            let fileUrl = file.url || file.objectPath || '';
                            
                            if (file.objectPath && !file.objectPath.startsWith('http')) {
                              fileUrl = `/objects/${file.objectPath}`;
                            }
                            
                            if (!fileUrl) return null;
                            
                            return (
                              <div 
                                key={`artwork-${index}`}
                                className="flex items-center gap-3 p-3 bg-blue-lavender/30 rounded-lg w-full"
                              >
                                <ImagePreviewTooltip
                                  fileUrl={fileUrl}
                                  fileName={fileName}
                                  thumbnailSize="sm"
                                />
                                <span className="text-sm text-dark-blue-night flex-1 truncate">{fileName}</span>
                                <a 
                                  href={fileUrl} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                >
                                  <Button size="sm" variant="default" data-testid={`button-download-artwork-${index}`}>
                                    <Download className="h-3 w-3 mr-1" />
                                    Download
                                  </Button>
                                </a>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }
                  
                  // Fallback to requestAttachments
                  if (requestAttachments.length > 0) {
                    return (
                      <div>
                        <p className="text-xs text-dark-gray mb-2">Artwork Files</p>
                        <div className="flex flex-col gap-2">
                          {requestAttachments.map((attachment) => (
                            <div 
                              key={attachment.id}
                              className="flex items-center gap-3 p-3 bg-blue-lavender/30 rounded-lg w-full"
                            >
                              <ImagePreviewTooltip
                                fileUrl={attachment.fileUrl}
                                fileName={attachment.fileName}
                                thumbnailSize="sm"
                              />
                              <span className="text-sm text-dark-blue-night flex-1 truncate">{attachment.fileName}</span>
                              <a 
                                href={attachment.fileUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                              >
                                <Button size="sm" variant="default" data-testid={`button-download-${attachment.id}`}>
                                  <Download className="h-3 w-3 mr-1" />
                                  Download
                                </Button>
                              </a>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  }
                  
                  // Check if this is Blank Product - PSD form (has blankUrl or blankName) - don't show artwork section
                  const isBlankProductForm = formData?.blankUrl !== undefined || formData?.blankName !== undefined;
                  if (isBlankProductForm) {
                    return null;
                  }
                  
                  return (
                    <div>
                      <p className="text-xs text-dark-gray mb-2">Artwork Files</p>
                      <p className="text-sm text-dark-gray">No artwork files uploaded</p>
                    </div>
                  );
                })()}

                {/* Display all form specifications */}
                {(() => {
                  const formData = request.formData as Record<string, unknown> | null;
                  if (!formData) return null;
                  
                  // Build dynamic field labels from serviceFields (from database)
                  const dynamicLabels: Record<string, string> = {};
                  const generalInfoFieldKeys = new Set<string>();
                  const deliveryFieldKeys = new Set<string>();
                  
                  for (const sf of serviceFields) {
                    if (sf.inputField) {
                      // Only override if we have a valid label
                      if (sf.inputField.label) {
                        dynamicLabels[sf.inputField.fieldKey] = sf.inputField.label;
                      }
                      if (sf.uiGroup === "general_info") {
                        generalInfoFieldKeys.add(sf.inputField.fieldKey);
                      }
                      if (sf.inputField.inputFor === "delivery") {
                        deliveryFieldKeys.add(sf.inputField.fieldKey);
                      }
                    }
                  }
                  
                  // Define fallback field display names (for fields not in database)
                  const fallbackLabels: Record<string, string> = {
                    outputFormats: "Output Formats",
                    outputFormat: "Output Format",
                    widthInches: "Width (inches)",
                    heightInches: "Height (inches)",
                    widthPixels: "Width (pixels)",
                    heightPixels: "Height (pixels)",
                    fabricType: "Fabric Type",
                    threadColors: "Thread Colors",
                    vectorizationNeeded: "Vectorization Needed",
                    colorCount: "Color Count",
                    needColorSeparation: "Color Separation Needed",
                    printMethod: "Print Method",
                    colorMode: "Color Mode",
                    format: "Format",
                    designStyle: "Design Style",
                    complexity: "Complexity",
                    numberOfColors: "Number of Colors",
                    logoType: "Logo Type",
                    industry: "Industry",
                    preferredStyle: "Preferred Style",
                    includeBrandName: "Include Brand Name",
                    colorPreference: "Color Preference",
                    existingBrandColors: "Existing Brand Colors",
                    brandName: "Brand Name",
                    numberOfProducts: "Number of Products",
                    resolutionDPI: "Resolution (DPI)",
                    mockupType: "Mockup Type",
                    productType: "Product Type",
                    backgroundStyle: "Background Style",
                    includesPackaging: "Includes Packaging",
                    includesLabeling: "Includes Labeling",
                    pageCount: "Page Count",
                    paperSize: "Paper Size",
                    frontAndBack: "Front and Back",
                    foldType: "Fold Type",
                    specialFinishes: "Special Finishes",
                    quantity: "Quantity",
                  };
                  
                  // Merge: prefer dynamic labels, then fallbacks
                  const fieldLabels: Record<string, string> = { ...fallbackLabels, ...dynamicLabels };
                  
                  // Fields to skip (already shown elsewhere or internal)
                  // Base skip fields for all form types
                  // calculatedPrice is now shown in the top bar, so skip it from Info Details for all users
                  // selectedAddOns is only configured for Embroidery Digitizing, skip it for all other services
                  const baseSkipFields = ['uploadedFiles', 'artworkFile', 'notes', 'calculatedPrice', 'selectedAddOns'];
                  
                  // Check if this is Store Creation form (has storeName field)
                  const isStoreCreationForm = formData?.storeName !== undefined;
                  
                  // Check if this is Artwork Composition form (has specific fields)
                  const uploadedFiles = formData?.uploadedFiles as Record<string, unknown> | null;
                  const isArtworkCompositionForm = uploadedFiles?.brandGuidelines || uploadedFiles?.inspirationFile;
                  
                  // Check if this is Flyer Design form (has colorMode or flyerOrientation)
                  const isFlyerDesignForm = formData?.colorMode !== undefined || formData?.flyerOrientation !== undefined;
                  
                  // Check if this is Store Banner form
                  const isStoreBannerForm = formData?.textContent !== undefined && 
                    (formData?.widthInches !== undefined || formData?.heightInches !== undefined) &&
                    !formData?.colorMode && !formData?.flyerOrientation &&
                    !uploadedFiles?.brandGuidelines && !uploadedFiles?.inspirationFile;
                  
                  // Determine skip fields based on form type
                  let skipFields = baseSkipFields;
                  if (isStoreCreationForm) {
                    // Store Creation: skip uploadAssets (shown as "Artwork" in custom section)
                    skipFields = [...baseSkipFields, 'uploadAssets'];
                  } else if (isFlyerDesignForm) {
                    // Flyer Design: skip fields already rendered in custom layout
                    skipFields = [...baseSkipFields, 'uploadAssets', 'artworkFile', 'widthInches', 'heightInches', 'flyerOrientation', 'outputFormat', 'colorMode', 'textContent'];
                  } else if (isStoreBannerForm) {
                    // Store Banner: skip fields already rendered in custom layout
                    skipFields = [...baseSkipFields, 'uploadAssets', 'artworkFile', 'widthInches', 'heightInches', 'textContent'];
                  } else if (isArtworkCompositionForm) {
                    // Artwork Composition: skip fields already rendered in custom layout
                    skipFields = [...baseSkipFields, 'brandGuidelines', 'uploadAssets', 'artworkFile', 'inspirationFile', 'textContent', 'complexity', 'outputFormat', 'widthInches', 'heightInches'];
                  }
                  
                  // Only skip general_info and delivery fields when we have actual serviceFields data
                  // This ensures legacy requests without metadata still show all their fields in Info Details
                  if (serviceFields.length > 0) {
                    skipFields = [...skipFields, ...Array.from(generalInfoFieldKeys), ...Array.from(deliveryFieldKeys)];
                  }
                  
                  // Define preferred field order with paired fields (left, right) for side-by-side display
                  // Fields not in this list will appear at the end
                  const orderedPairs: [string, string | null][] = [
                    // Artwork Touch-ups and Vectorization form order
                    ['outputFormat', 'colorMode'],
                    ['widthInches', 'heightInches'],
                    ['numberOfColors', null],
                    // Embroidery Digitizing form order
                    ['fabricType', 'threadColors'],
                    ['outputFormats', 'vectorizationNeeded'],
                    // Other forms
                    ['colorCount', null],
                    ['needColorSeparation', null],
                    ['printMethod', null],
                    ['format', null],
                    ['designStyle', 'complexity'],
                    ['logoType', 'industry'],
                    ['preferredStyle', 'colorPreference'],
                    ['includeBrandName', 'brandName'],
                    ['existingBrandColors', null],
                    ['numberOfProducts', 'resolutionDPI'],
                    ['mockupType', 'productType'],
                    ['backgroundStyle', null],
                    ['includesPackaging', 'includesLabeling'],
                    ['pageCount', 'paperSize'],
                    ['frontAndBack', 'foldType'],
                    ['specialFinishes', 'quantity'],
                    ['widthPixels', 'heightPixels'],
                  ];
                  
                  // Build ordered fields from pairs
                  const processedFields = new Set<string>();
                  const renderField = (key: string) => {
                    const value = formData[key];
                    if (value === null || value === undefined || value === '') return null;
                    
                    let displayValue: string;
                    if (typeof value === 'boolean') {
                      displayValue = value ? 'Yes' : 'No';
                    } else if (Array.isArray(value)) {
                      displayValue = value.join(', ');
                    } else {
                      displayValue = String(value);
                    }
                    
                    return (
                      <div key={key}>
                        <p className="text-xs text-dark-gray mb-1">{fieldLabels[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}</p>
                        <p className="text-sm text-dark-blue-night font-medium" data-testid={`text-formdata-${key}`}>
                          {displayValue}
                        </p>
                      </div>
                    );
                  };
                  
                  const rows: JSX.Element[] = [];
                  
                  // First, render ordered pairs
                  for (const [leftKey, rightKey] of orderedPairs) {
                    const leftExists = formData[leftKey] !== undefined && formData[leftKey] !== null && formData[leftKey] !== '' && !skipFields.includes(leftKey);
                    const rightExists = rightKey && formData[rightKey] !== undefined && formData[rightKey] !== null && formData[rightKey] !== '' && !skipFields.includes(rightKey);
                    
                    if (leftExists || rightExists) {
                      if (leftExists) processedFields.add(leftKey);
                      if (rightKey && rightExists) processedFields.add(rightKey);
                      
                      if (leftExists && rightExists) {
                        rows.push(
                          <div key={`pair-${leftKey}-${rightKey}`} className="grid grid-cols-2 gap-4">
                            {renderField(leftKey)}
                            {rightKey && renderField(rightKey)}
                          </div>
                        );
                      } else if (leftExists && !rightKey) {
                        // Single field in its own row (full width)
                        rows.push(
                          <div key={`single-${leftKey}`}>
                            {renderField(leftKey)}
                          </div>
                        );
                      } else if (leftExists) {
                        rows.push(
                          <div key={`single-${leftKey}`} className="grid grid-cols-2 gap-4">
                            {renderField(leftKey)}
                            <div></div>
                          </div>
                        );
                      } else if (rightExists && rightKey) {
                        rows.push(
                          <div key={`single-${rightKey}`} className="grid grid-cols-2 gap-4">
                            <div></div>
                            {renderField(rightKey)}
                          </div>
                        );
                      }
                    }
                  }
                  
                  // Then, render any remaining fields not in the ordered list
                  const remainingEntries = Object.entries(formData)
                    .filter(([key]) => !skipFields.includes(key) && !processedFields.has(key))
                    .filter(([, value]) => value !== null && value !== undefined && value !== '');
                  
                  if (remainingEntries.length > 0) {
                    for (let i = 0; i < remainingEntries.length; i += 2) {
                      const [key1] = remainingEntries[i];
                      const second = remainingEntries[i + 1];
                      
                      if (second) {
                        const [key2] = second;
                        rows.push(
                          <div key={`remaining-${key1}-${key2}`} className="grid grid-cols-2 gap-4">
                            {renderField(key1)}
                            {renderField(key2)}
                          </div>
                        );
                      } else {
                        rows.push(
                          <div key={`remaining-${key1}`}>
                            {renderField(key1)}
                          </div>
                        );
                      }
                    }
                  }
                  
                  if (rows.length === 0) return null;
                  
                  return <div className="space-y-4">{rows}</div>;
                })()}

                {request.notes && (
                  <div>
                    <p className="text-xs text-dark-gray mb-1">Job Notes</p>
                    <p className="text-sm text-dark-blue-night font-medium" data-testid="text-job-notes">
                      {request.notes}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {!showDeliverablesAtTop && (canManageJobs || deliverableAttachments.length > 0) && (
              <DeliverablesSection />
            )}

            {request.status === "change-request" && request.changeRequestNote && (
              <Card className="border-orange-200 bg-orange-50">
                <CardHeader>
                  <CardTitle className="text-lg text-orange-800 flex items-center gap-2">
                    <AlertCircle className="h-5 w-5" />
                    Change Request Notes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-orange-900" data-testid="text-change-request-note">
                    {request.changeRequestNote}
                  </p>
                </CardContent>
              </Card>
            )}

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
                  <div className="relative">
                    <Textarea
                      ref={commentTextareaRef}
                      placeholder={commentTab === "internal" ? "Write an internal comment... Use @ to mention someone" : "Write a comment... Use @ to mention someone"}
                      value={commentText}
                      onChange={handleCommentChange}
                      className="mb-3"
                      data-testid="textarea-comment"
                    />
                    {showMentionDropdown && filteredMentionUsers.length > 0 && (
                      <div className="absolute left-0 right-0 bottom-full mb-1 bg-white border rounded-md shadow-lg max-h-48 overflow-y-auto z-50">
                        {filteredMentionUsers.map(user => (
                          <button
                            key={user.id}
                            onClick={() => insertMention(user)}
                            className="w-full text-left px-3 py-2 hover:bg-blue-lavender/30 flex items-center gap-2"
                            data-testid={`mention-user-${user.id}`}
                          >
                            <Avatar className="h-6 w-6">
                              <AvatarFallback className="bg-sky-blue-accent text-white text-xs">
                                {user.username.slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm">{user.username}</span>
                            <Badge variant="outline" className="text-xs ml-auto">
                              {user.role}
                            </Badge>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
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

          <div className="space-y-4">
            {canManageJobs && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {request.status === "pending" && canTakeJob && (
                    <Button
                      onClick={() => handleTakeJob()}
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
                        value={selectedDesignerId} 
                        onValueChange={setSelectedDesignerId}
                      >
                        <SelectTrigger data-testid="select-designer">
                          <SelectValue placeholder="Select a designer..." />
                        </SelectTrigger>
                        <SelectContent>
                          {designers.map((designer) => {
                            const roleLabel = designer.role === "internal_designer" ? "Internal Designer" 
                              : designer.role === "vendor_designer" ? "Vendor Designer"
                              : designer.role.charAt(0).toUpperCase() + designer.role.slice(1);
                            return (
                              <SelectItem 
                                key={designer.id} 
                                value={designer.id}
                                data-testid={`select-designer-${designer.id}`}
                              >
                                <span className="flex items-center gap-2">
                                  {designer.username}
                                  {designer.id === currentUser?.userId && " (You)"}
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
                        onClick={() => handleTakeJob(selectedDesignerId)}
                        disabled={!selectedDesignerId || assignMutation.isPending}
                        variant="outline"
                        className="w-full"
                        data-testid="button-assign-designer"
                      >
                        {assignMutation.isPending ? "Assigning..." : "Assign Selected Designer"}
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

                  {request.status === "change-request" && (
                    <Button
                      onClick={handleResume}
                      disabled={resumeMutation.isPending}
                      className="w-full bg-blue-600 hover:bg-blue-700"
                      data-testid="button-resume-work"
                    >
                      {resumeMutation.isPending ? "Resuming..." : "Resume Work"}
                    </Button>
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
                  {/* Show change request history from comments */}
                  {comments.filter(c => c.body.startsWith("[Change Request]")).map((changeComment, index) => {
                    const changeDate = new Date(changeComment.createdAt);
                    return (
                      <div key={`history-${changeComment.id}`}>
                        {/* Delivery before change request */}
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-2 h-2 rounded-full bg-green-500" />
                          <span className="text-sm text-dark-blue-night">Delivered</span>
                          <span className="text-xs text-dark-gray ml-auto">
                            {format(changeDate, "MMM dd, h:mm a")}
                          </span>
                        </div>
                        {/* Change Request */}
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-orange-500" />
                          <span className="text-sm text-dark-blue-night">Change Request</span>
                          <span className="text-xs text-dark-gray ml-auto">
                            {format(changeDate, "MMM dd, h:mm a")}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  {/* Final delivered state */}
                  {request.deliveredAt && request.status === "delivered" && (
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      <span className="text-sm text-dark-blue-night">Delivered</span>
                      <span className="text-xs text-dark-gray ml-auto">
                        {format(new Date(request.deliveredAt), "MMM dd, h:mm a")}
                      </span>
                    </div>
                  )}
                  {/* Current change request status */}
                  {request.status === "change-request" && (
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                      <span className="text-sm text-dark-blue-night">Change Requested</span>
                      <Badge variant="outline" className="text-xs ml-auto">Current</Badge>
                    </div>
                  )}
                  {/* In progress status */}
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
