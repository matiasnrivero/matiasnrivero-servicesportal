import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, startOfMonth, subMonths } from "date-fns";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  Download,
  Users,
  ChevronLeft,
  RefreshCw,
  Briefcase,
  Package,
} from "lucide-react";
import { Link } from "wouter";

interface CurrentUser {
  userId: string;
  role: string;
  username: string;
}

interface TeamMember {
  id: string;
  username: string;
  role: string;
}

interface WorkloadJob {
  id: string;
  jobId: string;
  type: "Ad-hoc" | "Bundle";
  serviceName: string;
  userName: string;
  userId: string;
  userRole: string;
  deliveredAt: Date | null;
}

interface WorkloadReportData {
  period: string;
  jobs: WorkloadJob[];
  teamMembers: TeamMember[];
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

export default function VendorDesignerWorkloadReport() {
  const { toast } = useToast();
  const [selectedPeriod, setSelectedPeriod] = useState(
    format(new Date(), "yyyy-MM")
  );
  const [selectedUserId, setSelectedUserId] = useState<string>("all");

  const paymentPeriods = useMemo(() => generatePaymentPeriods(), []);

  const { data: currentUser } = useQuery<CurrentUser>({
    queryKey: ["/api/default-user"],
  });

  const {
    data: reportData,
    isLoading,
    error,
    refetch: refetchReport,
    isFetching: isRefetching,
  } = useQuery<WorkloadReportData>({
    queryKey: ["/api/reports/vendor-designer-workload", selectedPeriod, selectedUserId],
    queryFn: async () => {
      let url = `/api/reports/vendor-designer-workload?period=${selectedPeriod}`;
      if (selectedUserId && selectedUserId !== "all") {
        url += `&userId=${selectedUserId}`;
      }
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to fetch report");
      return response.json();
    },
    enabled: currentUser?.role === "vendor",
    staleTime: 0,
    refetchOnMount: "always",
    gcTime: 0,
  });

  const handleRefresh = () => {
    refetchReport();
  };

  const exportToCSV = () => {
    if (!reportData?.jobs) return;

    const periodLabel =
      paymentPeriods.find((p) => p.value === selectedPeriod)?.label ||
      selectedPeriod;

    const headers = ["Job ID", "Service/Bundle", "Method", "Delivered", "User Name"];

    const rows = reportData.jobs.map((job) => [
      job.jobId,
      job.serviceName,
      job.type,
      job.deliveredAt ? format(new Date(job.deliveredAt), "MMM dd, yyyy") : "",
      job.userName,
    ]);

    const escapeCell = (cell: string) => {
      const escaped = String(cell).replace(/"/g, '""');
      return `"${escaped}"`;
    };

    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => escapeCell(String(cell))).join(","))
      .join("\r\n");

    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `vendor-designer-workload-${selectedPeriod}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (currentUser?.role !== "vendor") {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-6">
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground">
                Access denied. This report is only available for vendors.
              </p>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-6">
        <div className="flex items-center gap-2 mb-6">
          <Link href="/reports">
            <Button variant="ghost" size="sm" data-testid="button-back-reports">
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back to Reports
            </Button>
          </Link>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-dark-blue-night">
              Vendor Designer Workload
            </h1>
            <p className="text-muted-foreground mt-1">
              View delivered jobs by team members in your organization
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefetching}
              data-testid="button-refresh-report"
            >
              <RefreshCw
                className={`w-4 h-4 mr-1 ${isRefetching ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          </div>
        </div>

        <Card className="mb-6">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  Period
                </label>
                <Select
                  value={selectedPeriod}
                  onValueChange={setSelectedPeriod}
                >
                  <SelectTrigger
                    className="w-full"
                    data-testid="select-period"
                  >
                    <SelectValue placeholder="Select period" />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentPeriods.map((period) => (
                      <SelectItem key={period.value} value={period.value}>
                        {period.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  Team Member
                </label>
                <Select
                  value={selectedUserId}
                  onValueChange={setSelectedUserId}
                >
                  <SelectTrigger
                    className="w-full"
                    data-testid="select-user"
                  >
                    <SelectValue placeholder="All Team Members" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Team Members</SelectItem>
                    {reportData?.teamMembers?.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.username} ({member.role === "vendor" ? "Vendor" : "Designer"})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <Card>
            <CardContent className="py-8">
              <div className="space-y-4">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-64 w-full" />
              </div>
            </CardContent>
          </Card>
        ) : error ? (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-destructive">
                Error loading report. Please try again.
              </p>
            </CardContent>
          </Card>
        ) : !reportData?.jobs?.length ? (
          <Card>
            <CardContent className="py-8 text-center">
              <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                No delivered jobs found for this period.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Total Jobs</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {reportData.jobs.length}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>
                    <Briefcase className="w-4 h-4 inline mr-1" />
                    Ad-hoc Jobs
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {reportData.jobs.filter((j) => j.type === "Ad-hoc").length}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>
                    <Package className="w-4 h-4 inline mr-1" />
                    Bundle Jobs
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {reportData.jobs.filter((j) => j.type === "Bundle").length}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4 pb-4">
                <CardTitle className="text-lg">Individual Jobs by User Breakdown</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportToCSV}
                  data-testid="button-export-csv"
                >
                  <Download className="w-4 h-4 mr-1" />
                  Export CSV
                </Button>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Job ID</TableHead>
                        <TableHead>Service/Bundle</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Delivered</TableHead>
                        <TableHead>User Name</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reportData.jobs.map((job) => (
                        <TableRow key={job.id} data-testid={`row-job-${job.id}`}>
                          <TableCell className="font-mono text-sm">
                            {job.jobId}
                          </TableCell>
                          <TableCell>{job.serviceName}</TableCell>
                          <TableCell>
                            <Badge
                              variant={job.type === "Ad-hoc" ? "outline" : "secondary"}
                              className="text-xs"
                            >
                              {job.type}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {job.deliveredAt
                              ? format(new Date(job.deliveredAt), "MMM dd, yyyy")
                              : "-"}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span>{job.userName}</span>
                              <Badge
                                variant="outline"
                                className="text-xs"
                              >
                                {job.userRole === "vendor" ? "Vendor" : "Designer"}
                              </Badge>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
