import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { format, startOfMonth, subMonths } from "date-fns";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  ChevronLeft,
  DollarSign,
  CheckCircle2,
  Clock,
  Download,
  Package,
  FileText,
} from "lucide-react";

interface CurrentUser {
  userId: string;
  role: string;
  username: string;
}

interface ServiceRow {
  id: string;
  jobId: string;
  clientName: string;
  serviceName: string;
  amount: number;
  deliveredAt: string | null;
  paymentStatus: string;
}

interface PackRow {
  id: string;
  subscriptionId: string;
  clientName: string;
  packName: string;
  amount: number;
  periodStart: string;
  periodEnd: string | null;
  paymentStatus: string;
}

interface ReportSummary {
  totalItems: number;
  totalAmount: number;
  pendingCount: number;
  paidCount: number;
}

interface ReportFilters {
  clients: { id: string; name: string }[];
}

interface RoyaltiesReportData {
  tab: "services" | "packs";
  period: string;
  rows: ServiceRow[] | PackRow[];
  summary: ReportSummary;
  filters: ReportFilters;
}

function generatePaymentPeriods(): { value: string; label: string }[] {
  const periods = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const date = subMonths(startOfMonth(now), i);
    const value = format(date, "yyyy-MM");
    const label = format(date, "MMMM yyyy");
    periods.push({ value, label });
  }
  return periods;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export default function RoyaltiesDeductionReport() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"services" | "packs">("services");
  const [selectedPeriod, setSelectedPeriod] = useState(format(new Date(), "yyyy-MM"));
  const [filterClient, setFilterClient] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const periods = useMemo(() => generatePaymentPeriods(), []);

  const { data: currentUser } = useQuery<CurrentUser>({
    queryKey: ["/api/default-user"],
  });

  const queryParams = new URLSearchParams();
  queryParams.set("tab", activeTab);
  queryParams.set("period", selectedPeriod);
  if (filterClient !== "all") queryParams.set("clientId", filterClient);
  if (filterStatus !== "all") queryParams.set("status", filterStatus);

  const { data: reportData, isLoading } = useQuery<RoyaltiesReportData>({
    queryKey: ["/api/reports/royalties-deduction", activeTab, selectedPeriod, filterClient, filterStatus],
    queryFn: async () => {
      const res = await fetch(`/api/reports/royalties-deduction?${queryParams.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch report");
      return res.json();
    },
    enabled: currentUser?.role === "admin",
  });

  const markPaidMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await apiRequest("POST", "/api/reports/royalties-deduction/mark-paid", {
        tab: activeTab,
        ids,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: `${selectedIds.length} items marked as paid`,
      });
      setSelectedIds([]);
      queryClient.invalidateQueries({ queryKey: ["/api/reports/royalties-deduction"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to mark as paid",
        variant: "destructive",
      });
    },
  });

  const handleSelectAll = (checked: boolean) => {
    if (checked && reportData?.rows) {
      const pendingIds = (reportData.rows as any[])
        .filter(row => row.paymentStatus === "pending")
        .map(row => row.id);
      setSelectedIds(pendingIds);
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedIds([...selectedIds, id]);
    } else {
      setSelectedIds(selectedIds.filter(i => i !== id));
    }
  };

  const handleMarkPaid = () => {
    if (selectedIds.length === 0) return;
    markPaidMutation.mutate(selectedIds);
  };

  const handleExportCSV = () => {
    if (!reportData?.rows) return;
    
    let headers: string[];
    let csvRows: string[];
    
    if (activeTab === "services") {
      headers = ["Job ID", "Client", "Service", "Amount", "Delivered", "Status"];
      csvRows = [
        headers.join(","),
        ...(reportData.rows as ServiceRow[]).map(row => [
          row.jobId,
          `"${row.clientName}"`,
          `"${row.serviceName}"`,
          row.amount.toFixed(2),
          row.deliveredAt ? format(new Date(row.deliveredAt), "yyyy-MM-dd") : "",
          row.paymentStatus,
        ].join(","))
      ];
    } else {
      headers = ["Subscription ID", "Client", "Pack", "Amount", "Period Start", "Status"];
      csvRows = [
        headers.join(","),
        ...(reportData.rows as PackRow[]).map(row => [
          row.subscriptionId,
          `"${row.clientName}"`,
          `"${row.packName}"`,
          row.amount.toFixed(2),
          format(new Date(row.periodStart), "yyyy-MM-dd"),
          row.paymentStatus,
        ].join(","))
      ];
    }
    
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `royalties-${activeTab}-${selectedPeriod}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!currentUser || currentUser.role !== "admin") {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">Access denied. Admin access required.</p>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  const pendingRows = (reportData?.rows as any[])?.filter(row => row.paymentStatus === "pending") || [];
  const allPendingSelected = pendingRows.length > 0 && selectedIds.length === pendingRows.length;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <Link href="/reports">
            <Button variant="ghost" size="sm" className="mb-4" data-testid="button-back">
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back to Reports
            </Button>
          </Link>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-bold" data-testid="text-report-title">Deduct from Royalties</h1>
              <p className="text-muted-foreground mt-1">
                Track and manage royalty deductions for clients
              </p>
            </div>
            <div className="flex items-center gap-2">
              {selectedIds.length > 0 && (
                <Button 
                  onClick={handleMarkPaid} 
                  disabled={markPaidMutation.isPending}
                  data-testid="button-mark-paid"
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Mark as Paid ({selectedIds.length})
                </Button>
              )}
              <Button onClick={handleExportCSV} variant="outline" data-testid="button-export">
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        {reportData?.summary && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium">Total Items</CardTitle>
                {activeTab === "services" ? (
                  <FileText className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Package className="h-4 w-4 text-muted-foreground" />
                )}
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-items">
                  {reportData.summary.totalItems}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium">Total Amount</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-amount">
                  {formatCurrency(reportData.summary.totalAmount)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium">Pending</CardTitle>
                <Clock className="h-4 w-4 text-yellow-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-600" data-testid="text-pending-count">
                  {reportData.summary.pendingCount}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium">Paid</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600" data-testid="text-paid-count">
                  {reportData.summary.paidCount}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Tabs and Filters */}
        <Card>
          <CardContent className="pt-6">
            <Tabs value={activeTab} onValueChange={(v) => {
              setActiveTab(v as "services" | "packs");
              setSelectedIds([]);
            }}>
              <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                <TabsList>
                  <TabsTrigger value="services" data-testid="tab-services">
                    <FileText className="w-4 h-4 mr-2" />
                    Services
                  </TabsTrigger>
                  <TabsTrigger value="packs" data-testid="tab-packs">
                    <Package className="w-4 h-4 mr-2" />
                    Packs
                  </TabsTrigger>
                </TabsList>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium">Period:</label>
                    <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                      <SelectTrigger className="w-[180px]" data-testid="select-period">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {periods.map(p => (
                          <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium">Client:</label>
                    <Select value={filterClient} onValueChange={setFilterClient}>
                      <SelectTrigger className="w-[180px]" data-testid="select-client">
                        <SelectValue placeholder="All Clients" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Clients</SelectItem>
                        {reportData?.filters.clients.map(client => (
                          <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium">Status:</label>
                    <Select value={filterStatus} onValueChange={setFilterStatus}>
                      <SelectTrigger className="w-[150px]" data-testid="select-status">
                        <SelectValue placeholder="All Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="paid">Paid</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {isLoading ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : !reportData?.rows.length ? (
                <div className="text-center py-8 text-muted-foreground">
                  No items found for this period.
                </div>
              ) : (
                <>
                  <TabsContent value="services">
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[50px]">
                              <Checkbox
                                checked={allPendingSelected}
                                onCheckedChange={handleSelectAll}
                                disabled={pendingRows.length === 0}
                                data-testid="checkbox-select-all"
                              />
                            </TableHead>
                            <TableHead>Job ID</TableHead>
                            <TableHead>Client</TableHead>
                            <TableHead>Service</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead>Delivered</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(reportData.rows as ServiceRow[]).map(row => (
                            <TableRow key={row.id} data-testid={`row-service-${row.id}`}>
                              <TableCell>
                                <Checkbox
                                  checked={selectedIds.includes(row.id)}
                                  onCheckedChange={(checked) => handleSelectOne(row.id, !!checked)}
                                  disabled={row.paymentStatus === "paid"}
                                  data-testid={`checkbox-${row.id}`}
                                />
                              </TableCell>
                              <TableCell className="font-medium">{row.jobId}</TableCell>
                              <TableCell>{row.clientName}</TableCell>
                              <TableCell>{row.serviceName}</TableCell>
                              <TableCell className="text-right">{formatCurrency(row.amount)}</TableCell>
                              <TableCell>
                                {row.deliveredAt ? format(new Date(row.deliveredAt), "MMM d, yyyy") : "-"}
                              </TableCell>
                              <TableCell>
                                <Badge variant={row.paymentStatus === "paid" ? "default" : "secondary"}>
                                  {row.paymentStatus === "paid" ? (
                                    <><CheckCircle2 className="w-3 h-3 mr-1" />Paid</>
                                  ) : (
                                    <><Clock className="w-3 h-3 mr-1" />Pending</>
                                  )}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>

                  <TabsContent value="packs">
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[50px]">
                              <Checkbox
                                checked={allPendingSelected}
                                onCheckedChange={handleSelectAll}
                                disabled={pendingRows.length === 0}
                                data-testid="checkbox-select-all"
                              />
                            </TableHead>
                            <TableHead>Subscription ID</TableHead>
                            <TableHead>Client</TableHead>
                            <TableHead>Pack</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead>Period</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(reportData.rows as PackRow[]).map(row => (
                            <TableRow key={row.id} data-testid={`row-pack-${row.id}`}>
                              <TableCell>
                                <Checkbox
                                  checked={selectedIds.includes(row.id)}
                                  onCheckedChange={(checked) => handleSelectOne(row.id, !!checked)}
                                  disabled={row.paymentStatus === "paid"}
                                  data-testid={`checkbox-${row.id}`}
                                />
                              </TableCell>
                              <TableCell className="font-medium">{row.subscriptionId}</TableCell>
                              <TableCell>{row.clientName}</TableCell>
                              <TableCell>{row.packName}</TableCell>
                              <TableCell className="text-right">{formatCurrency(row.amount)}</TableCell>
                              <TableCell>
                                {format(new Date(row.periodStart), "MMM d")}
                                {row.periodEnd && ` - ${format(new Date(row.periodEnd), "MMM d, yyyy")}`}
                              </TableCell>
                              <TableCell>
                                <Badge variant={row.paymentStatus === "paid" ? "default" : "secondary"}>
                                  {row.paymentStatus === "paid" ? (
                                    <><CheckCircle2 className="w-3 h-3 mr-1" />Paid</>
                                  ) : (
                                    <><Clock className="w-3 h-3 mr-1" />Pending</>
                                  )}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>
                </>
              )}
            </Tabs>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
