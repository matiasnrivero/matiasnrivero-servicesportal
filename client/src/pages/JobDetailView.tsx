import { useState, useEffect } from "react";
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
import { useToast } from "@/hooks/use-toast";
import { FileUploader } from "@/components/FileUploader";
import { apiRequest } from "@/lib/queryClient";
import { 
  ArrowLeft, 
  Download, 
  Calendar, 
  User, 
  FileText, 
  Send,
  AlertCircle,
  CheckCircle2,
  Clock,
  RefreshCw,
  Users
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
  const isClient = currentUser?.role === "client";

  // Sync selectedDesignerId with current assignee when request loads
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
      setChangeNote("");
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
      });
    },
    onSuccess: () => {
      refetchComments();
      setCommentText("");
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

  // Filter designers from all users
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

  return (
    <div className="min-h-screen bg-off-white-cream">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4 flex-wrap">
            <Link href="/service-requests">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-5 w-5" />
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
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isClient && request.status === "delivered" && (
              <Button 
                variant="outline" 
                className="border-orange-400 text-orange-600"
                onClick={() => document.getElementById("change-request-section")?.scrollIntoView({ behavior: "smooth" })}
                data-testid="button-request-changes"
              >
                Request Changes
              </Button>
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
                <div className="p-3 bg-blue-lavender/30 rounded-lg">
                  <p className="text-xs text-dark-gray mb-1">Workspace</p>
                  <p className="text-sm font-medium text-dark-blue-night" data-testid="text-workspace">
                    {request.customerName || "Default Workspace"}
                  </p>
                </div>

                <div className="p-3 bg-blue-lavender/30 rounded-lg">
                  <p className="text-xs text-dark-gray mb-1">Assignee</p>
                  <p className="text-sm font-medium text-dark-blue-night" data-testid="text-assignee">
                    {assignedDesigner?.username || "Unassigned"}
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

                <div className="p-3 bg-blue-lavender/30 rounded-lg">
                  <p className="text-xs text-dark-gray mb-1">Order Reference</p>
                  <p className="text-sm font-medium text-dark-blue-night" data-testid="text-order-ref">
                    {request.orderNumber || "N/A"}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Info Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-xs text-dark-gray mb-2">Upload Artwork File*</p>
                  <div className="flex flex-wrap gap-2">
                    {requestAttachments.map((attachment) => (
                      <div 
                        key={attachment.id}
                        className="flex items-center gap-2 p-2 bg-blue-lavender/30 rounded-lg"
                      >
                        <FileText className="h-4 w-4 text-dark-gray" />
                        <span className="text-sm text-dark-blue-night">{attachment.fileName}</span>
                        <a 
                          href={attachment.fileUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="ml-2"
                        >
                          <Button size="sm" variant="default" data-testid={`button-download-${attachment.id}`}>
                            <Download className="h-3 w-3 mr-1" />
                            Download File
                          </Button>
                        </a>
                      </div>
                    ))}
                    {requestAttachments.length === 0 && (
                      <p className="text-sm text-dark-gray">No artwork files uploaded</p>
                    )}
                  </div>
                </div>

                {request.requirements && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-blue-lavender/30 rounded-lg">
                      <p className="text-xs text-dark-gray mb-1">Desired Output Format</p>
                      <p className="text-sm text-dark-blue-night" data-testid="text-output-format">
                        {request.requirements}
                      </p>
                    </div>
                  </div>
                )}

                {request.notes && (
                  <div className="p-3 bg-blue-lavender/30 rounded-lg">
                    <p className="text-xs text-dark-gray mb-1">Job Notes</p>
                    <p className="text-sm text-dark-blue-night" data-testid="text-job-notes">
                      {request.notes}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {(isDesigner || deliverableAttachments.length > 0) && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Deliverables</CardTitle>
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
                            <Button size="sm" variant="outline" data-testid={`button-download-deliverable-${attachment.id}`}>
                              <Download className="h-3 w-3 mr-1" />
                              Download
                            </Button>
                          </a>
                        </div>
                      ))}
                    </div>
                  )}

                  {isDesigner && (request.status === "in-progress" || request.status === "change-request") && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm font-medium text-dark-blue-night mb-2">Upload File*</p>
                        <FileUploader onUploadComplete={handleDeliverableUpload} />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
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

            {isClient && request.status === "delivered" && (
              <Card id="change-request-section">
                <CardHeader>
                  <CardTitle className="text-lg">Request Changes</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea
                    placeholder="Describe the changes you need..."
                    value={changeNote}
                    onChange={(e) => setChangeNote(e.target.value)}
                    className="min-h-[100px]"
                    data-testid="textarea-change-note"
                  />
                  <p className="text-xs text-dark-gray">
                    Please provide detailed notes about the changes required. This is mandatory.
                  </p>
                  <Button
                    onClick={handleRequestChange}
                    disabled={!changeNote.trim() || changeRequestMutation.isPending}
                    className="bg-orange-500 hover:bg-orange-600"
                    data-testid="button-submit-change-request"
                  >
                    Submit Change Request
                  </Button>
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
                      <TabsTrigger value="internal" data-testid="tab-comments-internal">Internal Chat</TabsTrigger>
                    )}
                  </TabsList>

                  <TabsContent value="public" className="space-y-4">
                    <div className="space-y-4 max-h-96 overflow-y-auto">
                      {comments
                        .filter(c => c.visibility === "public")
                        .map((comment) => {
                          const author = getUserById(comment.authorId);
                          return (
                            <div key={comment.id} className="flex gap-3">
                              <Avatar className="h-8 w-8">
                                <AvatarFallback className="bg-sky-blue-accent text-white text-xs">
                                  {author?.username?.slice(0, 2).toUpperCase() || "NS"}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-medium text-dark-blue-night">
                                    {author?.username || "Unknown"}
                                  </span>
                                  <Badge variant="outline" className="text-xs">
                                    {author?.role === "designer" ? "Designer" : "Client"}
                                  </Badge>
                                  <span className="text-xs text-dark-gray">
                                    {format(new Date(comment.createdAt), "MMM dd, yyyy")}
                                  </span>
                                </div>
                                <p className="text-sm text-dark-gray mt-1" data-testid={`text-comment-${comment.id}`}>
                                  {comment.body}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      {comments.filter(c => c.visibility === "public").length === 0 && (
                        <p className="text-sm text-dark-gray text-center py-4">No comments yet</p>
                      )}
                    </div>
                  </TabsContent>

                  {isDesigner && (
                    <TabsContent value="internal" className="space-y-4">
                      <div className="space-y-4 max-h-96 overflow-y-auto">
                        {comments
                          .filter(c => c.visibility === "internal")
                          .map((comment) => {
                            const author = getUserById(comment.authorId);
                            return (
                              <div key={comment.id} className="flex gap-3">
                                <Avatar className="h-8 w-8">
                                  <AvatarFallback className="bg-purple-500 text-white text-xs">
                                    {author?.username?.slice(0, 2).toUpperCase() || "NS"}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-medium text-dark-blue-night">
                                      {author?.username || "Unknown"}
                                    </span>
                                    <Badge variant="outline" className="text-xs bg-purple-50">
                                      Designer
                                    </Badge>
                                    <span className="text-xs text-dark-gray">
                                      {format(new Date(comment.createdAt), "MMM dd, yyyy")}
                                    </span>
                                  </div>
                                  <p className="text-sm text-dark-gray mt-1" data-testid={`text-internal-comment-${comment.id}`}>
                                    {comment.body}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        {comments.filter(c => c.visibility === "internal").length === 0 && (
                          <p className="text-sm text-dark-gray text-center py-4">No internal chat messages yet</p>
                        )}
                      </div>
                    </TabsContent>
                  )}
                </Tabs>

                <div className="border-t pt-4">
                  <Textarea
                    placeholder={commentTab === "internal" ? "Write an internal message..." : "Write a comment..."}
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

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {isDesigner && request.status === "pending" && (
                  <Button
                    onClick={() => handleTakeJob()}
                    disabled={assignMutation.isPending}
                    className="w-full bg-sky-blue-accent hover:bg-sky-blue-accent/90"
                    data-testid="button-take-job"
                  >
                    {assignMutation.isPending ? "Taking job..." : "Take This Job"}
                  </Button>
                )}

                {isDesigner && (request.status === "pending" || request.status === "in-progress") && (
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

                {isDesigner && request.status === "change-request" && (
                  <Button
                    onClick={handleResume}
                    disabled={resumeMutation.isPending}
                    className="w-full bg-blue-600 hover:bg-blue-700"
                    data-testid="button-resume-work"
                  >
                    {resumeMutation.isPending ? "Resuming..." : "Resume Work"}
                  </Button>
                )}

                {isDesigner && (request.status === "in-progress" || request.status === "change-request") && (
                  <Button
                    onClick={handleDeliver}
                    disabled={deliverMutation.isPending}
                    className="w-full bg-green-600 hover:bg-green-700"
                    data-testid="button-save-deliver"
                  >
                    {deliverMutation.isPending ? "Saving..." : "Save & Deliver"}
                  </Button>
                )}

                <Button
                  variant="outline"
                  className="w-full border-red-300 text-red-600"
                  data-testid="button-cancel-job"
                >
                  Cancel Job
                </Button>
              </CardContent>
            </Card>

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
