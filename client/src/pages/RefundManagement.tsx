import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { useLocation } from "wouter";
import { ArrowLeft, DollarSign, RefreshCw, Plus, Search, X, CheckCircle, Clock, AlertCircle, XCircle } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

type RefundStatus = "pending" | "processing" | "completed" | "failed";
type RefundType = "full" | "partial" | "manual";

interface Refund {
  id: string;
  requestType: string;
  serviceRequestId: string | null;
  bundleRequestId: string | null;
  clientId: string;
  refundType: RefundType;
  originalAmount: string;
  refundAmount: string;
  reason: string;
  notes: string | null;
  status: RefundStatus;
  errorMessage: string | null;
  stripeRefundId: string | null;
  stripePaymentIntentId: string | null;
  requestedBy: string;
  processedBy: string | null;
  processedAt: string | null;
  createdAt: string;
  client?: any;
  requestedByUser?: any;
  processedByUser?: any;
  serviceRequest?: any;
  bundleRequest?: any;
  service?: any;
  bundle?: any;
}

interface RefundableJob {
  id: string;
  finalPrice: string;
  status: string;
  createdAt: string;
  stripePaymentIntentId?: string;
  service?: any;
  bundle?: any;
  existingRefunds: Refund[];
  totalRefunded: number;
  remainingRefundable: number;
}

interface Client {
  id: string;
  username: string;
  email: string | null;
}

export default function RefundManagement() {
  const { toast } = useToast();
  const [location, navigate] = useLocation();
  const [selectedClient, setSelectedClient] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedJob, setSelectedJob] = useState<RefundableJob | null>(null);
  const [selectedJobType, setSelectedJobType] = useState<"service_request" | "bundle_request">("service_request");
  const [refundType, setRefundType] = useState<RefundType>("full");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refundNotes, setRefundNotes] = useState("");
  const [urlParamsProcessed, setUrlParamsProcessed] = useState(false);

  const urlParams = new URLSearchParams(window.location.search);
  const preselectedClientId = urlParams.get("clientId");
  const preselectedJobId = urlParams.get("jobId");
  const preselectedJobType = urlParams.get("jobType") as "service_request" | "bundle_request" | null;

  const { data: refunds = [], isLoading: loadingRefunds } = useQuery<Refund[]>({
    queryKey: ["/api/refunds"],
  });

  const { data: users = [] } = useQuery<any[]>({
    queryKey: ["/api/users"],
  });

  const clients = users.filter(u => u.role === "client");

  const { data: refundableJobs, isLoading: loadingJobs } = useQuery<{
    serviceRequests: RefundableJob[];
    bundleRequests: RefundableJob[];
  }>({
    queryKey: ["/api/refunds/refundable", selectedClient],
    enabled: !!selectedClient,
  });

  useEffect(() => {
    if (preselectedClientId && !urlParamsProcessed) {
      setSelectedClient(preselectedClientId);
      if (preselectedJobType) {
        setSelectedJobType(preselectedJobType);
      }
    }
  }, [preselectedClientId, preselectedJobType, urlParamsProcessed]);

  useEffect(() => {
    if (preselectedJobId && refundableJobs && !urlParamsProcessed) {
      const jobList = preselectedJobType === "bundle_request" 
        ? refundableJobs.bundleRequests 
        : refundableJobs.serviceRequests;
      
      const job = jobList?.find(j => j.id === preselectedJobId);
      if (job) {
        setSelectedJob(job);
        setSelectedJobType(preselectedJobType || "service_request");
        setRefundAmount(job.remainingRefundable.toFixed(2));
        setShowCreateModal(true);
        setUrlParamsProcessed(true);
        navigate("/reports/refunds", { replace: true });
      }
    }
  }, [preselectedJobId, preselectedJobType, refundableJobs, urlParamsProcessed, navigate]);

  const createRefundMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/refunds", data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Refund created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/refunds"] });
      queryClient.invalidateQueries({ queryKey: ["/api/refunds/refundable", selectedClient] });
      closeCreateModal();
    },
    onError: (error: any) => {
      toast({ title: "Failed to create refund", description: error.message, variant: "destructive" });
    },
  });

  const processRefundMutation = useMutation({
    mutationFn: async (refundId: string) => {
      const response = await apiRequest("POST", `/api/refunds/${refundId}/process`, {});
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Refund processed successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/refunds"] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to process refund", description: error.message, variant: "destructive" });
    },
  });

  const filteredRefunds = refunds.filter((refund) => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      refund.client?.username?.toLowerCase().includes(searchLower) ||
      refund.client?.email?.toLowerCase().includes(searchLower) ||
      refund.reason?.toLowerCase().includes(searchLower) ||
      refund.service?.title?.toLowerCase().includes(searchLower) ||
      refund.bundle?.name?.toLowerCase().includes(searchLower)
    );
  });

  const closeCreateModal = () => {
    setShowCreateModal(false);
    setSelectedJob(null);
    setRefundType("full");
    setRefundAmount("");
    setRefundReason("");
    setRefundNotes("");
  };

  const handleJobSelect = (job: RefundableJob, type: "service_request" | "bundle_request") => {
    setSelectedJob(job);
    setSelectedJobType(type);
    setRefundAmount(job.remainingRefundable.toFixed(2));
  };

  const handleCreateRefund = () => {
    if (!selectedJob || !selectedClient) return;

    const amount = refundType === "full" ? selectedJob.remainingRefundable : parseFloat(refundAmount);

    if (amount <= 0 || amount > selectedJob.remainingRefundable) {
      toast({ title: "Invalid refund amount", variant: "destructive" });
      return;
    }

    createRefundMutation.mutate({
      requestType: selectedJobType,
      serviceRequestId: selectedJobType === "service_request" ? selectedJob.id : null,
      bundleRequestId: selectedJobType === "bundle_request" ? selectedJob.id : null,
      clientId: selectedClient,
      refundType,
      refundAmount: amount,
      reason: refundReason,
      notes: refundNotes || null,
    });
  };

  const getStatusBadge = (status: RefundStatus) => {
    switch (status) {
      case "completed":
        return <Badge variant="default" className="gap-1"><CheckCircle className="h-3 w-3" /> Completed</Badge>;
      case "pending":
        return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" /> Pending</Badge>;
      case "processing":
        return <Badge variant="outline" className="gap-1"><RefreshCw className="h-3 w-3 animate-spin" /> Processing</Badge>;
      case "failed":
        return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Failed</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getTypeBadge = (type: RefundType) => {
    switch (type) {
      case "full":
        return <Badge variant="default">Full</Badge>;
      case "partial":
        return <Badge variant="outline">Partial</Badge>;
      case "manual":
        return <Badge variant="secondary">Manual</Badge>;
      default:
        return <Badge>{type}</Badge>;
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/reports">
          <Button variant="outline" size="icon" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <DollarSign className="h-6 w-6" />
            Refund Management
          </h1>
          <p className="text-muted-foreground">Manage refunds for ad-hoc jobs and bundles</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search refunds..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 w-[300px]"
              data-testid="input-search-refunds"
            />
          </div>
        </div>
        <Button onClick={() => setShowCreateModal(true)} data-testid="button-create-refund">
          <Plus className="h-4 w-4 mr-2" />
          Create Refund
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Refund History</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingRefunds ? (
            <div className="text-center py-8 text-muted-foreground">Loading refunds...</div>
          ) : filteredRefunds.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No refunds found. Click "Create Refund" to issue a new refund.
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Job</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRefunds.map((refund) => (
                    <TableRow key={refund.id} data-testid={`row-refund-${refund.id}`}>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(refund.createdAt), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{refund.client?.username || "Unknown"}</div>
                        <div className="text-sm text-muted-foreground">{refund.client?.email}</div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">
                          {refund.service?.title || refund.bundle?.name || "Unknown"}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {refund.requestType === "service_request" ? "Service" : "Bundle"}
                        </div>
                      </TableCell>
                      <TableCell>{getTypeBadge(refund.refundType)}</TableCell>
                      <TableCell className="text-right font-medium">
                        ${parseFloat(refund.refundAmount).toFixed(2)}
                        {refund.refundType === "partial" && (
                          <div className="text-sm text-muted-foreground">
                            of ${parseFloat(refund.originalAmount).toFixed(2)}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate" title={refund.reason}>
                        {refund.reason}
                      </TableCell>
                      <TableCell>{getStatusBadge(refund.status)}</TableCell>
                      <TableCell>
                        {refund.status === "pending" && refund.refundType !== "manual" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => processRefundMutation.mutate(refund.id)}
                            disabled={processRefundMutation.isPending}
                            data-testid={`button-process-refund-${refund.id}`}
                          >
                            <RefreshCw className={`h-4 w-4 mr-1 ${processRefundMutation.isPending ? "animate-spin" : ""}`} />
                            Process
                          </Button>
                        )}
                        {refund.status === "failed" && refund.errorMessage && (
                          <div className="text-sm text-destructive" title={refund.errorMessage}>
                            <AlertCircle className="h-4 w-4 inline mr-1" />
                            Error
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Refund</DialogTitle>
            <DialogDescription>
              Issue a refund for a service request or bundle
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Select Client</Label>
              <Select value={selectedClient} onValueChange={setSelectedClient}>
                <SelectTrigger data-testid="select-client">
                  <SelectValue placeholder="Choose a client..." />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.username} {client.email ? `(${client.email})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedClient && (
              <>
                {loadingJobs ? (
                  <div className="text-center py-4 text-muted-foreground">Loading jobs...</div>
                ) : (
                  <div className="space-y-4">
                    {refundableJobs?.serviceRequests && refundableJobs.serviceRequests.length > 0 && (
                      <div>
                        <Label className="mb-2 block">Service Requests</Label>
                        <div className="space-y-2 max-h-[200px] overflow-y-auto border rounded-md p-2">
                          {refundableJobs.serviceRequests.map((sr) => (
                            <div
                              key={sr.id}
                              className={`p-3 border rounded-md cursor-pointer hover-elevate ${
                                selectedJob?.id === sr.id && selectedJobType === "service_request"
                                  ? "border-primary bg-primary/5"
                                  : ""
                              }`}
                              onClick={() => handleJobSelect(sr, "service_request")}
                              data-testid={`job-service-${sr.id}`}
                            >
                              <div className="flex justify-between items-start">
                                <div>
                                  <div className="font-medium">{sr.service?.title || "Unknown Service"}</div>
                                  <div className="text-sm text-muted-foreground">
                                    {format(new Date(sr.createdAt), "MMM d, yyyy")} • {sr.status}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="font-medium">${parseFloat(sr.finalPrice).toFixed(2)}</div>
                                  {sr.totalRefunded > 0 && (
                                    <div className="text-sm text-muted-foreground">
                                      Refunded: ${sr.totalRefunded.toFixed(2)}
                                    </div>
                                  )}
                                  <div className="text-sm text-green-600">
                                    Available: ${sr.remainingRefundable.toFixed(2)}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {refundableJobs?.bundleRequests && refundableJobs.bundleRequests.length > 0 && (
                      <div>
                        <Label className="mb-2 block">Bundle Requests</Label>
                        <div className="space-y-2 max-h-[200px] overflow-y-auto border rounded-md p-2">
                          {refundableJobs.bundleRequests.map((br) => (
                            <div
                              key={br.id}
                              className={`p-3 border rounded-md cursor-pointer hover-elevate ${
                                selectedJob?.id === br.id && selectedJobType === "bundle_request"
                                  ? "border-primary bg-primary/5"
                                  : ""
                              }`}
                              onClick={() => handleJobSelect(br, "bundle_request")}
                              data-testid={`job-bundle-${br.id}`}
                            >
                              <div className="flex justify-between items-start">
                                <div>
                                  <div className="font-medium">{br.bundle?.name || "Unknown Bundle"}</div>
                                  <div className="text-sm text-muted-foreground">
                                    {format(new Date(br.createdAt), "MMM d, yyyy")} • {br.status}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="font-medium">${parseFloat(br.finalPrice).toFixed(2)}</div>
                                  {br.totalRefunded > 0 && (
                                    <div className="text-sm text-muted-foreground">
                                      Refunded: ${br.totalRefunded.toFixed(2)}
                                    </div>
                                  )}
                                  <div className="text-sm text-green-600">
                                    Available: ${br.remainingRefundable.toFixed(2)}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {(!refundableJobs?.serviceRequests?.length && !refundableJobs?.bundleRequests?.length) && (
                      <div className="text-center py-4 text-muted-foreground">
                        No refundable jobs found for this client.
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {selectedJob && (
              <>
                <div>
                  <Label>Refund Type</Label>
                  <Select value={refundType} onValueChange={(v: RefundType) => {
                    setRefundType(v);
                    if (v === "full") {
                      setRefundAmount(selectedJob.remainingRefundable.toFixed(2));
                    }
                  }}>
                    <SelectTrigger data-testid="select-refund-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full">Full Refund (${selectedJob.remainingRefundable.toFixed(2)})</SelectItem>
                      <SelectItem value="partial">Partial Refund</SelectItem>
                      <SelectItem value="manual">Manual Refund (Non-Stripe)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {refundType === "partial" && (
                  <div>
                    <Label>Refund Amount</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                      <Input
                        type="number"
                        step="0.01"
                        min="0.01"
                        max={selectedJob.remainingRefundable}
                        value={refundAmount}
                        onChange={(e) => setRefundAmount(e.target.value)}
                        className="pl-7"
                        data-testid="input-refund-amount"
                      />
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Maximum: ${selectedJob.remainingRefundable.toFixed(2)}
                    </p>
                  </div>
                )}

                <div>
                  <Label>Reason for Refund *</Label>
                  <Textarea
                    value={refundReason}
                    onChange={(e) => setRefundReason(e.target.value)}
                    placeholder="Enter the reason for this refund..."
                    data-testid="input-refund-reason"
                  />
                </div>

                <div>
                  <Label>Internal Notes (Optional)</Label>
                  <Textarea
                    value={refundNotes}
                    onChange={(e) => setRefundNotes(e.target.value)}
                    placeholder="Add any internal notes..."
                    data-testid="input-refund-notes"
                  />
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeCreateModal} data-testid="button-cancel-refund">
              Cancel
            </Button>
            <Button
              onClick={handleCreateRefund}
              disabled={!selectedJob || !refundReason || createRefundMutation.isPending}
              data-testid="button-submit-refund"
            >
              {createRefundMutation.isPending ? "Creating..." : "Create Refund"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
