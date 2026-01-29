import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Users, Package, Clock, X, UserPlus, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import type { User, ServicePack, VendorProfile } from "@shared/schema";

interface EnrichedPackSubscription {
  id: string;
  userId: string | null;
  clientProfileId: string | null;
  packId: string;
  startDate: string;
  endDate: string | null;
  priceAtSubscription: string | null;
  isActive: boolean;
  stripeSubscriptionId: string | null;
  stripeStatus: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  vendorAssigneeId: string | null;
  vendorAssignedAt: string | null;
  pendingVendorAssigneeId: string | null;
  pendingVendorEffectiveAt: string | null;
  pendingPackId: string | null;
  pendingChangeType: string | null;
  pendingChangeEffectiveAt: string | null;
  cancelAt: string | null;
  clientProfile: { id: string; companyName: string } | null;
  clientUser: { id: string; username: string; email: string } | null;
  pack: ServicePack | null;
  vendorAssignee: { id: string; username: string; email: string } | null;
  pendingVendorAssignee: { id: string; username: string; email: string } | null;
  pendingPack: ServicePack | null;
  totalIncluded: number;
  totalUsed: number;
}

async function getDefaultUser(): Promise<User | null> {
  const res = await fetch("/api/default-user");
  if (!res.ok) return null;
  return res.json();
}

export default function PackAssignment() {
  const { toast } = useToast();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedVendorId, setSelectedVendorId] = useState<string>("");
  const [assignmentType, setAssignmentType] = useState<"immediate" | "scheduled">("scheduled");
  const [filterVendor, setFilterVendor] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [singleAssignId, setSingleAssignId] = useState<string | null>(null);

  const { data: currentUser } = useQuery<User | null>({
    queryKey: ["/api/default-user"],
    queryFn: getDefaultUser,
  });

  const { data: subscriptions = [], isLoading } = useQuery<EnrichedPackSubscription[]>({
    queryKey: ["/api/admin/pack-subscriptions"],
  });

  const { data: vendorProfiles = [] } = useQuery<VendorProfile[]>({
    queryKey: ["/api/vendor-profiles"],
  });

  const bulkAssignMutation = useMutation({
    mutationFn: async (data: { subscriptionIds: string[]; vendorAssigneeId: string; assignmentType: string }) => {
      const res = await apiRequest("POST", "/api/admin/pack-subscriptions/bulk-assign", data);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pack-subscriptions"] });
      toast({
        title: "Vendor assigned",
        description: `Successfully assigned ${data.successCount} subscriptions. ${data.failCount > 0 ? `${data.failCount} failed.` : ""}`,
      });
      setAssignModalOpen(false);
      setSelectedIds([]);
      setSelectedVendorId("");
      setSingleAssignId(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to assign vendor",
        variant: "destructive",
      });
    },
  });

  const cancelPendingVendorMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/admin/pack-subscriptions/${id}/cancel-pending-vendor`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pack-subscriptions"] });
      toast({
        title: "Pending assignment canceled",
        description: "The pending vendor assignment has been canceled.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to cancel pending assignment",
        variant: "destructive",
      });
    },
  });

  if (!currentUser || !["admin", "internal_designer"].includes(currentUser.role)) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto py-6 px-4">
          <Card>
            <CardContent className="p-6">
              <p>Access denied. Admin or Internal Designer access required.</p>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  const filteredSubscriptions = subscriptions.filter((sub) => {
    if (!sub.isActive) return false;
    
    if (filterVendor === "unassigned" && sub.vendorAssigneeId) return false;
    if (filterVendor !== "all" && filterVendor !== "unassigned" && sub.vendorAssigneeId !== filterVendor) return false;
    
    if (filterStatus === "active" && sub.stripeStatus !== "active") return false;
    if (filterStatus === "pending" && !sub.pendingVendorAssigneeId) return false;
    if (filterStatus === "canceled" && !sub.cancelAt) return false;
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const clientName = sub.clientProfile?.companyName?.toLowerCase() || "";
      const packName = sub.pack?.name?.toLowerCase() || "";
      const vendorProfile = vendorProfiles.find(vp => vp.userId === sub.vendorAssigneeId);
      const vendorName = vendorProfile?.companyName?.toLowerCase() || sub.vendorAssignee?.username?.toLowerCase() || "";
      if (!clientName.includes(query) && !packName.includes(query) && !vendorName.includes(query)) {
        return false;
      }
    }
    
    return true;
  });

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(filteredSubscriptions.map((s) => s.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedIds([...selectedIds, id]);
    } else {
      setSelectedIds(selectedIds.filter((i) => i !== id));
    }
  };

  const openAssignModal = (singleId?: string) => {
    if (singleId) {
      setSingleAssignId(singleId);
    }
    setAssignModalOpen(true);
  };

  const handleAssign = () => {
    const idsToAssign = singleAssignId ? [singleAssignId] : selectedIds;
    if (idsToAssign.length === 0 || !selectedVendorId) return;
    
    bulkAssignMutation.mutate({
      subscriptionIds: idsToAssign,
      vendorAssigneeId: selectedVendorId,
      assignmentType,
    });
  };

  const allSelected = filteredSubscriptions.length > 0 && selectedIds.length === filteredSubscriptions.length;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto py-6 px-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Pack Vendor Assignment
            </CardTitle>
            <CardDescription>
              Assign vendors to manage client pack subscriptions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-4 mb-6">
              <div className="flex-1 min-w-[200px]">
                <Input
                  placeholder="Search by client, pack, or vendor..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  data-testid="input-search"
                />
              </div>
              <Select value={filterVendor} onValueChange={setFilterVendor}>
                <SelectTrigger className="w-[180px]" data-testid="select-vendor-filter">
                  <SelectValue placeholder="Filter by vendor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Vendors</SelectItem>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {vendorProfiles.map((vp) => (
                    <SelectItem key={vp.id} value={vp.userId}>{vp.companyName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[180px]" data-testid="select-status-filter">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active Only</SelectItem>
                  <SelectItem value="pending">Pending Change</SelectItem>
                  <SelectItem value="canceled">Canceling</SelectItem>
                </SelectContent>
              </Select>
              {selectedIds.length > 0 && (
                <Button
                  onClick={() => openAssignModal()}
                  data-testid="button-bulk-assign"
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  Assign Vendor ({selectedIds.length})
                </Button>
              )}
            </div>

            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading subscriptions...</div>
            ) : filteredSubscriptions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No pack subscriptions found.</div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]">
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={handleSelectAll}
                          data-testid="checkbox-select-all"
                        />
                      </TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Pack</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Pending Changes</TableHead>
                      <TableHead>Usage</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSubscriptions.map((sub) => (
                      <TableRow
                        key={sub.id}
                        className={sub.pendingVendorAssigneeId ? "bg-yellow-50 dark:bg-yellow-950/20" : ""}
                        data-testid={`row-subscription-${sub.id}`}
                      >
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.includes(sub.id)}
                            onCheckedChange={(checked) => handleSelectOne(sub.id, !!checked)}
                            data-testid={`checkbox-select-${sub.id}`}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{sub.clientProfile?.companyName || "Unknown"}</div>
                          <div className="text-sm text-muted-foreground">{sub.clientUser?.email || ""}</div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{sub.pack?.name || "Unknown Pack"}</div>
                          {currentUser?.role === "admin" && (
                            <div className="text-sm text-muted-foreground">
                              ${sub.priceAtSubscription || sub.pack?.price || "0"}/mo
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={sub.stripeStatus === "active" || (!sub.stripeStatus && sub.isActive) ? "default" : "secondary"}>
                            {sub.stripeStatus || (sub.isActive ? "active" : "inactive")}
                          </Badge>
                          {sub.cancelAt && (
                            <Badge variant="destructive" className="ml-1">
                              Canceling
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {sub.vendorAssignee ? (
                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4 text-muted-foreground" />
                              <span>{vendorProfiles.find(vp => vp.userId === sub.vendorAssigneeId)?.companyName || sub.vendorAssignee.username}</span>
                            </div>
                          ) : (
                            <Badge variant="outline">Unassigned</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {sub.pendingVendorAssignee && (
                            <div className="flex items-center gap-2 text-sm">
                              <Clock className="h-4 w-4 text-yellow-600" />
                              <div>
                                <div className="flex items-center gap-1">
                                  <span className="text-muted-foreground">
                                    {vendorProfiles.find(vp => vp.userId === sub.vendorAssigneeId)?.companyName || sub.vendorAssignee?.username || "None"}
                                  </span>
                                  <ArrowRight className="h-3 w-3" />
                                  <span className="font-medium text-yellow-700 dark:text-yellow-400">
                                    {vendorProfiles.find(vp => vp.userId === sub.pendingVendorAssigneeId)?.companyName || sub.pendingVendorAssignee.username}
                                  </span>
                                </div>
                                {sub.pendingVendorEffectiveAt && (
                                  <div className="text-xs text-muted-foreground">
                                    Effective: {format(new Date(sub.pendingVendorEffectiveAt), "MMM d, yyyy")}
                                  </div>
                                )}
                              </div>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
                                onClick={() => cancelPendingVendorMutation.mutate(sub.id)}
                                data-testid={`button-cancel-pending-${sub.id}`}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                          {sub.pendingPack && (
                            <div className="flex items-center gap-2 text-sm mt-1">
                              <Package className="h-4 w-4 text-blue-600" />
                              <span className="text-blue-700 dark:text-blue-400">
                                {sub.pendingChangeType}: {sub.pendingPack.name}
                              </span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm whitespace-nowrap">
                            {sub.totalUsed} / {sub.totalIncluded}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openAssignModal(sub.id)}
                            data-testid={`button-assign-${sub.id}`}
                          >
                            <UserPlus className="h-4 w-4 mr-1" />
                            {sub.vendorAssigneeId ? "Reassign" : "Assign"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={assignModalOpen} onOpenChange={(open) => {
          setAssignModalOpen(open);
          if (!open) {
            setSingleAssignId(null);
            setSelectedVendorId("");
          }
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Assign Vendor</DialogTitle>
              <DialogDescription>
                {singleAssignId
                  ? "Select a vendor to assign to this pack subscription."
                  : `Assign a vendor to ${selectedIds.length} selected pack subscription(s).`}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Select Vendor</label>
                <Select value={selectedVendorId} onValueChange={setSelectedVendorId}>
                  <SelectTrigger data-testid="select-assign-vendor">
                    <SelectValue placeholder="Choose a vendor" />
                  </SelectTrigger>
                  <SelectContent>
                    {vendorProfiles.map((vp) => (
                      <SelectItem key={vp.id} value={vp.userId}>{vp.companyName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Assignment Type</label>
                <Select value={assignmentType} onValueChange={(v: "immediate" | "scheduled") => setAssignmentType(v)}>
                  <SelectTrigger data-testid="select-assignment-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scheduled">
                      Scheduled (Next Billing Period)
                    </SelectItem>
                    <SelectItem value="immediate">
                      Immediate
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {assignmentType === "scheduled"
                    ? "The vendor change will take effect at the start of the next billing cycle."
                    : "The vendor will be assigned immediately."}
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setAssignModalOpen(false)} data-testid="button-cancel-assign">
                Cancel
              </Button>
              <Button
                onClick={handleAssign}
                disabled={!selectedVendorId || bulkAssignMutation.isPending}
                data-testid="button-confirm-assign"
              >
                {bulkAssignMutation.isPending ? "Assigning..." : "Assign Vendor"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
