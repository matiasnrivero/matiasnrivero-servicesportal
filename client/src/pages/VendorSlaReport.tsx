import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { format } from "date-fns";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  ChevronLeft,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Download,
  Timer,
  TrendingUp,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";

interface SlaJobRow {
  id: string;
  type: "service" | "bundle";
  serviceName: string;
  orderNumber: string | null;
  vendorName: string;
  vendorId: string;
  assignedAt: string | null;
  deliveredAt: string | null;
  slaTargetHours: number | null;
  actualHours: number | null;
  onTime: boolean | null;
  hadChangeRequest: boolean;
  changeRequestCount: number;
  status: string;
}

interface ServiceTypeBreakdown {
  name: string;
  total: number;
  onTime: number;
  overSla: number;
  pending: number;
}

interface VendorOption {
  id: string;
  username: string;
  companyName: string;
}

interface SlaReportData {
  vendors: VendorOption[];
  summary: {
    totalJobs: number;
    deliveredWithSla: number;
    onTime: number;
    overSla: number;
    onTimePercentage: number;
    overSlaPercentage: number;
    changeRequests: number;
    pending: number;
  };
  serviceTypes: ServiceTypeBreakdown[];
  jobs: SlaJobRow[];
}

const PIE_COLORS = ["#22c55e", "#ef4444"];

function formatHours(hours: number | null): string {
  if (hours === null) return "—";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  const days = Math.floor(hours / 24);
  const remainingHours = Math.round(hours % 24);
  if (days > 0) {
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
  }
  return `${remainingHours}h`;
}

export default function VendorSlaReport() {
  const [selectedVendor, setSelectedVendor] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [jobType, setJobType] = useState<string>("all");
  const [serviceTypeFilter, setServiceTypeFilter] = useState<string>("all");

  const queryUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (selectedVendor !== "all") params.set("vendorId", selectedVendor);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (jobType !== "all") params.set("jobType", jobType);
    const qs = params.toString();
    return qs ? `/api/reports/vendor-sla?${qs}` : "/api/reports/vendor-sla";
  }, [selectedVendor, dateFrom, dateTo, jobType]);

  const { data, isLoading } = useQuery<SlaReportData>({
    queryKey: [queryUrl],
  });

  const filteredJobs = useMemo(() => {
    if (!data) return [];
    if (serviceTypeFilter === "all") return data.jobs;
    return data.jobs.filter(j => j.serviceName === serviceTypeFilter);
  }, [data, serviceTypeFilter]);

  const filteredSummary = useMemo(() => {
    if (!data) return null;
    if (serviceTypeFilter === "all") return data.summary;
    const jobs = filteredJobs;
    const totalJobs = jobs.length;
    const deliveredJobs = jobs.filter(j => j.deliveredAt !== null && j.slaTargetHours !== null);
    const onTimeJobs = deliveredJobs.filter(j => j.onTime === true);
    const overSlaJobs = deliveredJobs.filter(j => j.onTime === false);
    return {
      totalJobs,
      deliveredWithSla: deliveredJobs.length,
      onTime: onTimeJobs.length,
      overSla: overSlaJobs.length,
      onTimePercentage: deliveredJobs.length > 0 ? Math.round((onTimeJobs.length / deliveredJobs.length) * 100) : 0,
      overSlaPercentage: deliveredJobs.length > 0 ? Math.round((overSlaJobs.length / deliveredJobs.length) * 100) : 0,
      changeRequests: jobs.filter(j => j.hadChangeRequest).length,
      pending: jobs.filter(j => j.deliveredAt === null).length,
    };
  }, [data, filteredJobs, serviceTypeFilter]);

  const filteredServiceTypes = useMemo(() => {
    if (!data) return [];
    if (serviceTypeFilter === "all") return data.serviceTypes;
    return data.serviceTypes.filter(s => s.name === serviceTypeFilter);
  }, [data, serviceTypeFilter]);

  const pieData = useMemo(() => {
    if (!filteredSummary || filteredSummary.deliveredWithSla === 0) return [];
    return [
      { name: "On Time", value: filteredSummary.onTime },
      { name: "Over SLA", value: filteredSummary.overSla },
    ];
  }, [filteredSummary]);

  const allServiceTypeNames = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.jobs.map(j => j.serviceName))).sort();
  }, [data]);

  const handleExportCSV = () => {
    if (!filteredJobs.length) return;
    const headers = ["Job ID", "Type", "Service/Bundle", "Order #", "Vendor", "Assigned At", "Delivered At", "SLA Target", "Actual Time", "Status", "On Time", "Change Request", "CR Count"];
    const rows = filteredJobs.map(j => [
      j.id,
      j.type,
      j.serviceName,
      j.orderNumber || "",
      j.vendorName,
      j.assignedAt ? format(new Date(j.assignedAt), "yyyy-MM-dd HH:mm") : "",
      j.deliveredAt ? format(new Date(j.deliveredAt), "yyyy-MM-dd HH:mm") : "",
      formatHours(j.slaTargetHours),
      formatHours(j.actualHours),
      j.status,
      j.onTime === null ? "N/A" : j.onTime ? "Yes" : "No",
      j.hadChangeRequest ? "Yes" : "No",
      j.changeRequestCount.toString(),
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vendor-sla-report-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <Link href="/reports">
            <Button variant="ghost" size="icon" data-testid="button-back-reports">
              <ChevronLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Timer className="h-6 w-6 text-sky-blue-accent" />
            <h1 className="text-2xl font-bold text-foreground" data-testid="text-vendor-sla-title">
              Vendor SLA Report
            </h1>
          </div>
          <div className="ml-auto">
            <Button variant="outline" onClick={handleExportCSV} disabled={!filteredJobs.length} data-testid="button-export-csv">
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </div>

        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div>
                <Label className="text-sm text-muted-foreground mb-1.5 block">Vendor</Label>
                <Select value={selectedVendor} onValueChange={setSelectedVendor}>
                  <SelectTrigger data-testid="select-vendor">
                    <SelectValue placeholder="All Vendors" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Vendors</SelectItem>
                    {data?.vendors.map(v => (
                      <SelectItem key={v.id} value={v.id}>{v.companyName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm text-muted-foreground mb-1.5 block">Date From</Label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  data-testid="input-date-from"
                />
              </div>
              <div>
                <Label className="text-sm text-muted-foreground mb-1.5 block">Date To</Label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  data-testid="input-date-to"
                />
              </div>
              <div>
                <Label className="text-sm text-muted-foreground mb-1.5 block">Job Type</Label>
                <Select value={jobType} onValueChange={setJobType}>
                  <SelectTrigger data-testid="select-job-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Jobs</SelectItem>
                    <SelectItem value="services">Services Only</SelectItem>
                    <SelectItem value="bundles">Bundles Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm text-muted-foreground mb-1.5 block">Service Type</Label>
                <Select value={serviceTypeFilter} onValueChange={setServiceTypeFilter}>
                  <SelectTrigger data-testid="select-service-type">
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {allServiceTypeNames.map(name => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[1, 2, 3, 4].map(i => (
              <Card key={i}>
                <CardContent className="pt-6">
                  <Skeleton className="h-4 w-20 mb-2" />
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredSummary ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground" data-testid="label-total-jobs">Total Jobs</p>
                  </div>
                  <p className="text-2xl font-bold" data-testid="text-total-jobs">{filteredSummary.totalJobs}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <p className="text-sm text-muted-foreground" data-testid="label-on-time">On Time</p>
                  </div>
                  <p className="text-2xl font-bold text-green-600" data-testid="text-on-time">
                    {filteredSummary.onTime}
                    <span className="text-sm font-normal text-muted-foreground ml-1">
                      ({filteredSummary.onTimePercentage}%)
                    </span>
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                    <p className="text-sm text-muted-foreground" data-testid="label-over-sla">Over SLA</p>
                  </div>
                  <p className="text-2xl font-bold text-red-600" data-testid="text-over-sla">
                    {filteredSummary.overSla}
                    <span className="text-sm font-normal text-muted-foreground ml-1">
                      ({filteredSummary.overSlaPercentage}%)
                    </span>
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 mb-1">
                    <RefreshCw className="h-4 w-4 text-amber-600" />
                    <p className="text-sm text-muted-foreground" data-testid="label-change-requests">Change Requests</p>
                  </div>
                  <p className="text-2xl font-bold text-amber-600" data-testid="text-change-requests">{filteredSummary.changeRequests}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground" data-testid="label-pending">Pending</p>
                  </div>
                  <p className="text-2xl font-bold" data-testid="text-pending">{filteredSummary.pending}</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">SLA Performance</CardTitle>
                </CardHeader>
                <CardContent>
                  {pieData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={70}
                          outerRadius={110}
                          dataKey="value"
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        >
                          {pieData.map((_, index) => (
                            <Cell key={index} fill={PIE_COLORS[index]} />
                          ))}
                        </Pie>
                        <RechartsTooltip />
                        <Legend verticalAlign="top" height={36} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[280px] flex items-center justify-center text-muted-foreground">
                      No delivered jobs with SLA data available
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">By Service Type</CardTitle>
                </CardHeader>
                <CardContent>
                  {filteredServiceTypes.length > 0 ? (
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={filteredServiceTypes} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 11 }}
                          interval={0}
                          angle={-30}
                          textAnchor="end"
                          height={60}
                        />
                        <YAxis allowDecimals={false} />
                        <RechartsTooltip />
                        <Legend verticalAlign="top" height={36} />
                        <Bar dataKey="onTime" name="On Time" fill="#22c55e" stackId="a" />
                        <Bar dataKey="overSla" name="Over SLA" fill="#ef4444" stackId="a" />
                        <Bar dataKey="pending" name="Pending" fill="#94a3b8" stackId="a" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[280px] flex items-center justify-center text-muted-foreground">
                      No data available for the selected filters
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <CardTitle className="text-base">Job Details</CardTitle>
                <Badge variant="secondary">{filteredJobs.length} jobs</Badge>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Service / Bundle</TableHead>
                        <TableHead>Order #</TableHead>
                        <TableHead>Vendor</TableHead>
                        <TableHead>Assigned</TableHead>
                        <TableHead>Delivered</TableHead>
                        <TableHead>SLA Target</TableHead>
                        <TableHead>Actual</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>CR</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredJobs.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                            No jobs found for the selected filters
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredJobs.map(job => (
                          <TableRow key={`${job.type}-${job.id}`} data-testid={`row-sla-job-${job.id}`}>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {job.type === "service" ? "Service" : "Bundle"}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-medium">{job.serviceName}</TableCell>
                            <TableCell className="text-muted-foreground">{job.orderNumber || "—"}</TableCell>
                            <TableCell>{job.vendorName}</TableCell>
                            <TableCell className="text-sm">
                              {job.assignedAt ? format(new Date(job.assignedAt), "MMM dd, yyyy HH:mm") : "—"}
                            </TableCell>
                            <TableCell className="text-sm">
                              {job.deliveredAt ? format(new Date(job.deliveredAt), "MMM dd, yyyy HH:mm") : "—"}
                            </TableCell>
                            <TableCell>{formatHours(job.slaTargetHours)}</TableCell>
                            <TableCell>
                              <span className={
                                job.onTime === true ? "text-green-600 font-medium" :
                                job.onTime === false ? "text-red-600 font-medium" : ""
                              }>
                                {formatHours(job.actualHours)}
                              </span>
                            </TableCell>
                            <TableCell>
                              {job.onTime === true && (
                                <Badge className="bg-green-100 text-green-700 border-green-200 whitespace-nowrap no-default-hover-elevate no-default-active-elevate">
                                  <CheckCircle2 className="h-3 w-3 mr-1 shrink-0" />
                                  On Time
                                </Badge>
                              )}
                              {job.onTime === false && (
                                <Badge className="bg-red-100 text-red-700 border-red-200 whitespace-nowrap no-default-hover-elevate no-default-active-elevate">
                                  <AlertTriangle className="h-3 w-3 mr-1 shrink-0" />
                                  Over SLA
                                </Badge>
                              )}
                              {job.onTime === null && job.deliveredAt && (
                                <Badge variant="secondary">No SLA</Badge>
                              )}
                              {!job.deliveredAt && (
                                <Badge variant="outline">Pending</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {job.hadChangeRequest ? (
                                <Badge variant="outline" className="text-amber-600 border-amber-300">
                                  <RefreshCw className="h-3 w-3 mr-1" />
                                  {job.changeRequestCount}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </>
        ) : null}
      </main>
    </div>
  );
}
