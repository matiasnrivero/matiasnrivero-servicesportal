import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useRoute, Link } from "wouter";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { FileUploader } from "@/components/FileUploader";
import { apiRequest } from "@/lib/queryClient";
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
  X
} from "lucide-react";
import type { ServiceRequest, Service, User as UserType, ServiceAttachment, Comment } from "@shared/schema";

interface CurrentUser {
  userId: string;
  role: string;
  username: string;
}

const statusConfig: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  "pending": { label: "Pending", color: "bg-yellow-100 text-yellow-800 border-yellow-200", icon: Clock },
  "in-progress": { label: "In Progress", color: "bg-blue-100 text-blue-800 border-blue-200", icon: RefreshCw },
  "delivered": { label: "Delivered", color: "bg-green-100 text-green-800 border-green-200", icon: CheckCircle2 },
  "change-request": { label: "Change Request", color: "bg-orange-100 text-orange-800 border-orange-200", icon: AlertCircle },
};

export default function JobDetailView() {
  const [, params] = useRoute("/jobs/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [changeNote, setChangeNote] = useState("");
  const [commentText, setCommentText] = useState("");
  const [commentTab, setCommentTab] = useState<"public" | "internal">("public");
  const [deliverableUrls, setDeliverableUrls] = useState<{ url: string; name: string }[]>([]);
  const [selectedDesignerId, setSelectedDesignerId] = useState<string>("");
  const [changeRequestModalOpen, setChangeRequestModalOpen] = useState(false);
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


  const { data: attachments = [] } = useQuery<ServiceAttachment[]>({
    queryKey: ["/api/service-requests", requestId, "attachments"],
    enabled: !!requestId,
  });

  const { data: comments = [], refetch: refetchComments } = useQuery<Comment[]>({
    queryKey: ["/api/service-requests", requestId, "comments"],
    enabled: !!requestId && !!currentUser,
  });

  const { data: allUsers = [] } = useQuery<UserType[]>({
    queryKey: ["/api/users"],
  });

  const requestAttachments = attachments.filter(a => a.kind === "request");
  const deliverableAttachments = attachments.filter(a => a.kind === "deliverable");

  const isDesigner = currentUser?.role === "designer";
  const isClient = currentUser?.role === "client" || currentUser?.role === "distributor";

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

  const deliverMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/service-requests/${requestId}/deliver`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-requests", requestId] });
      queryClient.invalidateQueries({ queryKey: ["/api/service-requests"] });
      toast({ title: "Deliverables submitted", description: "The job has been marked as delivered." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to submit deliverables.", variant: "destructive" });
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

  const designers = allUsers.filter(user => user.role === "designer");

  const handleDeliver = () => {
    deliverMutation.mutate();
  };

  const handleRequestChange = () => {
    if (changeNote.trim()) {
      changeRequestMutation.mutate(changeNote);
    }
  };

  const handleResume = () => {
    resumeMutation.mutate();
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
          <Link href="/service-requests">
            <Button variant="outline">Back to Requests</Button>
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

  const DeliverablesSection = () => (
    <Card className={showDeliverablesAtTop ? "border-green-200 bg-green-50/30" : ""}>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          {showDeliverablesAtTop && <CheckCircle2 className="h-5 w-5 text-green-600" />}
          Deliverables
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {deliverableAttachments.length > 0 && (
          <div className="space-y-2">
            {deliverableAttachments.map((attachment) => (
              <div 
                key={attachment.id}
                className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <FileText className="h-4 w-4 text-dark-gray" />
                  <span className="text-sm text-dark-blue-night">{attachment.fileName}</span>
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

        {deliverableAttachments.length === 0 && !isDesigner && (
          <p className="text-sm text-dark-gray">No deliverables uploaded yet</p>
        )}

        {isDesigner && (request.status === "in-progress" || request.status === "change-request") && (
          <div>
            <p className="text-sm font-medium text-dark-blue-night mb-2">Upload File*</p>
            <FileUploader onUploadComplete={handleDeliverableUpload} />
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
                <h1 className="text-2xl font-bold text-dark-blue-night" data-testid="text-job-title">
                  {service?.title || "Service Request"}
                </h1>
                <Badge variant="outline" className="text-sm" data-testid="text-job-id">
                  A-{request.id.slice(0, 5).toUpperCase()}
                </Badge>
                <Badge className={`${statusConfig[request.status]?.color || ""}`} data-testid="text-job-status">
                  <StatusIcon className="h-3 w-3 mr-1" />
                  {statusConfig[request.status]?.label || request.status}
                </Badge>
              </div>
              <p className="text-sm text-dark-gray mt-1" data-testid="text-created-date">
                Created on {format(new Date(request.createdAt), "MMMM do, yyyy")}
                {request.deliveredAt && (
                  <span className="ml-2">
                    • Delivered on {format(new Date(request.deliveredAt), "MMMM do, yyyy")}
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {request.status === "pending" && (
              <>
                <Button 
                  variant="outline" 
                  className="border-red-300 text-red-600"
                  data-testid="button-cancel-request"
                >
                  Cancel Request
                </Button>
                <Button 
                  className="bg-sky-blue-accent hover:bg-sky-blue-accent/90"
                  data-testid="button-save"
                >
                  Save
                </Button>
              </>
            )}

            {request.status === "in-progress" && isDesigner && (
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

            {request.status === "change-request" && isDesigner && (
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
                {/* Row 1: Client (left) / Due Date (right) */}
                <div className="p-3 bg-blue-lavender/30 rounded-lg">
                  <p className="text-xs text-dark-gray mb-1">Client</p>
                  <p className="text-sm font-medium text-dark-blue-night" data-testid="text-client">
                    {request.customerName || "N/A"}
                  </p>
                </div>

                <div className="p-3 bg-blue-lavender/30 rounded-lg flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-dark-gray" />
                  <div>
                    <p className="text-xs text-dark-gray">Due Date</p>
                    <p className="text-sm font-medium text-dark-blue-night" data-testid="text-due-date">
                      {request.dueDate ? format(new Date(request.dueDate), "MM/dd/yyyy") : "Not set"}
                    </p>
                  </div>
                </div>

                {/* Row 2: Order Reference (left) / Assignee (right - designer only) */}
                <div className="p-3 bg-blue-lavender/30 rounded-lg">
                  <p className="text-xs text-dark-gray mb-1">Order Reference</p>
                  <p className="text-sm font-medium text-dark-blue-night" data-testid="text-order-ref">
                    {request.orderNumber || "N/A"}
                  </p>
                </div>

                {isDesigner && (
                  <div className="p-3 bg-blue-lavender/30 rounded-lg">
                    <p className="text-xs text-dark-gray mb-1">Assignee</p>
                    <p className="text-sm font-medium text-dark-blue-night" data-testid="text-assignee">
                      {assignedDesigner?.username || "Unassigned"}
                    </p>
                  </div>
                )}
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
                                className="flex items-center gap-2 p-3 bg-blue-lavender/30 rounded-lg w-full"
                              >
                                <FileText className="h-4 w-4 text-dark-gray flex-shrink-0" />
                                <span className="text-sm text-dark-blue-night flex-1">{fileName}</span>
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
                                    className="flex items-center gap-2 p-3 bg-blue-lavender/30 rounded-lg w-full"
                                  >
                                    <FileText className="h-4 w-4 text-dark-gray flex-shrink-0" />
                                    <span className="text-sm text-dark-blue-night flex-1">{fileName}</span>
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
                                    className="flex items-center gap-2 p-3 bg-blue-lavender/30 rounded-lg w-full"
                                  >
                                    <FileText className="h-4 w-4 text-dark-gray flex-shrink-0" />
                                    <span className="text-sm text-dark-blue-night flex-1">{fileName}</span>
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
                                    className="flex items-center gap-2 p-3 bg-blue-lavender/30 rounded-lg w-full"
                                  >
                                    <FileText className="h-4 w-4 text-dark-gray flex-shrink-0" />
                                    <span className="text-sm text-dark-blue-night flex-1">{fileName}</span>
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
                                    className="flex items-center gap-2 p-3 bg-blue-lavender/30 rounded-lg w-full"
                                  >
                                    <FileText className="h-4 w-4 text-dark-gray flex-shrink-0" />
                                    <span className="text-sm text-dark-blue-night flex-1">{fileName}</span>
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
                                  className="flex items-center gap-2 p-3 bg-blue-lavender/30 rounded-lg w-full"
                                >
                                  <FileText className="h-4 w-4 text-dark-gray flex-shrink-0" />
                                  <span className="text-sm text-dark-blue-night flex-1">{fileName}</span>
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
                                className="flex items-center gap-2 p-3 bg-blue-lavender/30 rounded-lg w-full"
                              >
                                <FileText className="h-4 w-4 text-dark-gray flex-shrink-0" />
                                <span className="text-sm text-dark-blue-night flex-1">{fileName}</span>
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
                              className="flex items-center gap-2 p-3 bg-blue-lavender/30 rounded-lg w-full"
                            >
                              <FileText className="h-4 w-4 text-dark-gray flex-shrink-0" />
                              <span className="text-sm text-dark-blue-night flex-1">{attachment.fileName}</span>
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
                  
                  // Define field display names
                  const fieldLabels: Record<string, string> = {
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
                    calculatedPrice: "Estimated Price",
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
                  
                  // Fields to skip (already shown elsewhere or internal)
                  // Base skip fields for all form types (calculatedPrice hidden from designers)
                  const baseSkipFields = ['uploadedFiles', 'artworkFile', 'notes', 'calculatedPrice'];
                  
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
                    } else if (key === 'calculatedPrice') {
                      displayValue = `$${value}`;
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

            {!showDeliverablesAtTop && (isDesigner || deliverableAttachments.length > 0) && (
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
            {isDesigner && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {request.status === "pending" && (
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
                          {designers.map((designer) => (
                            <SelectItem 
                              key={designer.id} 
                              value={designer.id}
                              data-testid={`select-designer-${designer.id}`}
                            >
                              {designer.username}
                              {designer.id === currentUser?.userId && " (You)"}
                            </SelectItem>
                          ))}
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
                      {format(new Date(request.createdAt), "MMM dd")}
                    </span>
                  </div>
                  {request.assigneeId && (
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                      <span className="text-sm text-dark-blue-night">Assigned</span>
                    </div>
                  )}
                  {request.deliveredAt && (
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      <span className="text-sm text-dark-blue-night">Delivered</span>
                      <span className="text-xs text-dark-gray ml-auto">
                        {format(new Date(request.deliveredAt), "MMM dd")}
                      </span>
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
