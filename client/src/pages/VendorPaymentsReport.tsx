import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format, startOfMonth, subMonths } from "date-fns";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Download,
  FileText,
  DollarSign,
  CheckCircle2,
  Clock,
  ChevronLeft,
  Building2,
} from "lucide-react";
import { Link } from "wouter";

interface CurrentUser {
  userId: string;
  role: string;
  username: string;
}

interface VendorJob {
  id: string;
  type: "adhoc" | "bundle";
  serviceName: string;
  vendorCost: number;
  paymentStatus: string;
  deliveredAt: Date | null;
  customerName: string | null;
}

interface ServiceBreakdown {
  count: number;
  unitCost: number;
  totalCost: number;
}

interface VendorSummary {
  vendorId: string;
  vendorName: string;
  adhocJobs: {
    count: number;
    totalCost: number;
    services: Record<string, ServiceBreakdown>;
  };
  bundleJobs: {
    count: number;
    totalCost: number;
    bundles: Record<string, ServiceBreakdown>;
  };
  totalEarnings: number;
  pendingCount: number;
  paidCount: number;
  jobs: VendorJob[];
}

interface VendorPaymentReportData {
  period: string;
  vendors: VendorSummary[];
}

interface JobDetail {
  id: string;
  jobId: string;
  type: "Ad-hoc" | "Bundle";
  serviceName: string;
  vendorName: string;
  customerName: string | null;
  deliveredAt: Date | null;
  vendorCost: number;
  paymentStatus: string;
}

interface JobsResponse {
  period: string;
  jobs: JobDetail[];
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

export default function VendorPaymentsReport() {
  const { toast } = useToast();
  const [selectedPeriod, setSelectedPeriod] = useState(
    format(new Date(), "yyyy-MM")
  );
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set());
  const [expandedVendor, setExpandedVendor] = useState<string | null>(null);

  const paymentPeriods = useMemo(() => generatePaymentPeriods(), []);

  const { data: currentUser } = useQuery<CurrentUser>({
    queryKey: ["/api/default-user"],
  });

  const isAdmin = currentUser?.role === "admin";

  const {
    data: reportData,
    isLoading,
    error,
  } = useQuery<VendorPaymentReportData>({
    queryKey: ["/api/reports/vendor-payments", selectedPeriod],
    queryFn: async () => {
      const response = await fetch(
        `/api/reports/vendor-payments?period=${selectedPeriod}`
      );
      if (!response.ok) throw new Error("Failed to fetch report");
      return response.json();
    },
  });

  const { data: jobsData } = useQuery<JobsResponse>({
    queryKey: ["/api/reports/vendor-payments/jobs", selectedPeriod],
    queryFn: async () => {
      const response = await fetch(
        `/api/reports/vendor-payments/jobs?period=${selectedPeriod}`
      );
      if (!response.ok) throw new Error("Failed to fetch jobs");
      return response.json();
    },
    enabled: !!currentUser,
  });

  const markPaidMutation = useMutation({
    mutationFn: async (jobIds: string[]) => {
      return apiRequest("POST", "/api/reports/vendor-payments/mark-paid", {
        jobIds,
        period: selectedPeriod,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/reports/vendor-payments"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/reports/vendor-payments/jobs"],
      });
      setSelectedJobs(new Set());
      toast({
        title: "Jobs Marked as Paid",
        description: `Successfully marked ${selectedJobs.size} job(s) as paid.`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to mark jobs as paid.",
        variant: "destructive",
      });
    },
  });

  const handleMarkPaid = () => {
    if (selectedJobs.size === 0) return;
    markPaidMutation.mutate(Array.from(selectedJobs));
  };

  const handleJobSelection = (jobId: string, checked: boolean) => {
    const newSelected = new Set(selectedJobs);
    if (checked) {
      newSelected.add(jobId);
    } else {
      newSelected.delete(jobId);
    }
    setSelectedJobs(newSelected);
  };

  const handleSelectAllPending = (vendorJobs: VendorJob[]) => {
    const pendingJobs = vendorJobs.filter((j) => j.paymentStatus === "pending");
    const newSelected = new Set(selectedJobs);
    pendingJobs.forEach((j) => newSelected.add(j.id));
    setSelectedJobs(newSelected);
  };

  const exportToCSV = () => {
    if (!jobsData?.jobs) return;

    const headers = [
      "Job ID",
      "Type",
      "Service/Bundle",
      "Vendor",
      "Customer",
      "Delivered Date",
      "Vendor Cost",
      "Payment Status",
    ];
    const rows = jobsData.jobs.map((job) => [
      job.jobId,
      job.type,
      job.serviceName,
      job.vendorName,
      job.customerName || "",
      job.deliveredAt ? format(new Date(job.deliveredAt), "MM/dd/yyyy") : "",
      `$${job.vendorCost.toFixed(2)}`,
      job.paymentStatus,
    ]);

    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `vendor-payments-${selectedPeriod}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportToPDF = () => {
    if (!jobsData?.jobs || !reportData?.vendors) return;

    const periodLabel =
      paymentPeriods.find((p) => p.value === selectedPeriod)?.label ||
      selectedPeriod;

    let htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Vendor Payment Report - ${periodLabel}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h1 { color: #1e3a5f; margin-bottom: 5px; }
          h2 { color: #1e3a5f; margin-top: 30px; }
          .period { color: #666; margin-bottom: 30px; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f5f5f5; }
          .summary { background: #f9f9f9; padding: 15px; border-radius: 8px; margin-bottom: 30px; }
          .summary-item { display: inline-block; margin-right: 30px; }
          .amount { font-weight: bold; color: #1e3a5f; }
          .pending { color: #d97706; }
          .paid { color: #059669; }
        </style>
      </head>
      <body>
        <h1>Vendor Payment Report</h1>
        <p class="period">Period: ${periodLabel}</p>
    `;

    for (const vendor of reportData.vendors) {
      const vendorJobs = jobsData.jobs.filter(
        (j) => j.vendorName === vendor.vendorName
      );

      htmlContent += `
        <h2>${vendor.vendorName}</h2>
        <div class="summary">
          <div class="summary-item">Total Jobs: <span class="amount">${vendor.adhocJobs.count + vendor.bundleJobs.count}</span></div>
          <div class="summary-item">Total Earnings: <span class="amount">$${vendor.totalEarnings.toFixed(2)}</span></div>
          <div class="summary-item">Pending: <span class="pending">${vendor.pendingCount}</span></div>
          <div class="summary-item">Paid: <span class="paid">${vendor.paidCount}</span></div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Job ID</th>
              <th>Type</th>
              <th>Service/Bundle</th>
              <th>Customer</th>
              <th>Delivered</th>
              <th>Cost</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
      `;

      for (const job of vendorJobs) {
        htmlContent += `
          <tr>
            <td>${job.jobId}</td>
            <td>${job.type}</td>
            <td>${job.serviceName}</td>
            <td>${job.customerName || "-"}</td>
            <td>${job.deliveredAt ? format(new Date(job.deliveredAt), "MM/dd/yyyy") : "-"}</td>
            <td>$${job.vendorCost.toFixed(2)}</td>
            <td class="${job.paymentStatus === "paid" ? "paid" : "pending"}">${job.paymentStatus === "paid" ? "Paid" : "Pending"}</td>
          </tr>
        `;
      }

      htmlContent += `
          </tbody>
        </table>
      `;
    }

    htmlContent += `
      </body>
      </html>
    `;

    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      printWindow.print();
    }
  };

  const totalPendingAmount =
    reportData?.vendors.reduce(
      (sum, v) =>
        sum +
        v.jobs.filter((j) => j.paymentStatus === "pending").reduce((s, j) => s + j.vendorCost, 0),
      0
    ) || 0;

  const totalPaidAmount =
    reportData?.vendors.reduce(
      (sum, v) =>
        sum +
        v.jobs.filter((j) => j.paymentStatus === "paid").reduce((s, j) => s + j.vendorCost, 0),
      0
    ) || 0;

  const totalJobs =
    reportData?.vendors.reduce(
      (sum, v) => sum + v.adhocJobs.count + v.bundleJobs.count,
      0
    ) || 0;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <Link href="/reports">
            <Button variant="ghost" size="sm" className="mb-2">
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back to Reports
            </Button>
          </Link>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1
                className="text-2xl font-bold text-dark-blue-night"
                data-testid="text-vendor-payments-title"
              >
                Vendor Payments Report
              </h1>
              <p className="text-dark-gray mt-1">
                {isAdmin
                  ? "Manage vendor payments and mark jobs as paid"
                  : "View your payment history and pending earnings"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger
                  className="w-[180px]"
                  data-testid="select-payment-period"
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
              <Button
                variant="outline"
                size="sm"
                onClick={exportToCSV}
                disabled={!jobsData?.jobs?.length}
                data-testid="button-export-csv"
              >
                <Download className="h-4 w-4 mr-2" />
                CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={exportToPDF}
                disabled={!jobsData?.jobs?.length}
                data-testid="button-export-pdf"
              >
                <FileText className="h-4 w-4 mr-2" />
                PDF
              </Button>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Card key={i}>
                  <CardContent className="pt-6">
                    <Skeleton className="h-8 w-24 mb-2" />
                    <Skeleton className="h-4 w-32" />
                  </CardContent>
                </Card>
              ))}
            </div>
            <Card>
              <CardContent className="pt-6">
                <Skeleton className="h-64 w-full" />
              </CardContent>
            </Card>
          </div>
        ) : error ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-destructive">
                Failed to load report data. Please try again.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className={`grid grid-cols-1 gap-4 mb-6 ${isAdmin ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
              {isAdmin && (
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-md bg-sky-blue-accent/10">
                        <Building2 className="h-5 w-5 text-sky-blue-accent" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-dark-blue-night">
                          {reportData?.vendors.length || 0}
                        </p>
                        <p className="text-sm text-dark-gray">Vendors</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-md bg-sky-blue-accent/10">
                      <FileText className="h-5 w-5 text-sky-blue-accent" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-dark-blue-night">
                        {totalJobs}
                      </p>
                      <p className="text-sm text-dark-gray">Total Jobs</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-md bg-yellow-100">
                      <Clock className="h-5 w-5 text-yellow-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-yellow-600">
                        ${totalPendingAmount.toFixed(2)}
                      </p>
                      <p className="text-sm text-dark-gray">Pending Payment</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-md bg-green-100">
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-green-600">
                        ${totalPaidAmount.toFixed(2)}
                      </p>
                      <p className="text-sm text-dark-gray">Paid</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {isAdmin && selectedJobs.size > 0 && (
              <Card className="mb-6 border-sky-blue-accent">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <p className="text-dark-blue-night">
                      <span className="font-semibold">{selectedJobs.size}</span>{" "}
                      job(s) selected
                    </p>
                    <Button
                      onClick={handleMarkPaid}
                      disabled={markPaidMutation.isPending}
                      data-testid="button-mark-paid"
                    >
                      <DollarSign className="h-4 w-4 mr-2" />
                      {markPaidMutation.isPending
                        ? "Processing..."
                        : "Mark as Paid"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {reportData?.vendors.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <FileText className="w-12 h-12 mx-auto text-dark-gray mb-4" />
                  <p className="text-dark-gray">
                    No vendor jobs found for this period.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>
                    {isAdmin ? "Vendor Breakdown" : `${reportData?.vendors[0]?.vendorName || "Your"} Payment Breakdown`}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {isAdmin ? (
                    /* Admin view: Accordion for multiple vendors */
                    <Accordion
                      type="single"
                      collapsible
                      value={expandedVendor || undefined}
                      onValueChange={(value) => setExpandedVendor(value || null)}
                    >
                      {reportData?.vendors.map((vendor) => (
                        <AccordionItem
                          key={vendor.vendorId}
                          value={vendor.vendorId}
                        >
                          <AccordionTrigger className="hover:no-underline">
                            <div className="flex items-center justify-between w-full pr-4">
                              <div className="flex items-center gap-3">
                                <Building2 className="h-5 w-5 text-sky-blue-accent" />
                                <span className="font-semibold">
                                  {vendor.vendorName}
                                </span>
                              </div>
                              <div className="flex items-center gap-6 text-sm">
                                <span>
                                  <span className="text-dark-gray">Jobs:</span>{" "}
                                  <span className="font-medium">
                                    {vendor.adhocJobs.count +
                                      vendor.bundleJobs.count}
                                  </span>
                                </span>
                                <span>
                                  <span className="text-dark-gray">Total:</span>{" "}
                                  <span className="font-medium text-dark-blue-night">
                                    ${vendor.totalEarnings.toFixed(2)}
                                  </span>
                                </span>
                                <Badge
                                  variant="outline"
                                  className={
                                    vendor.pendingCount > 0
                                      ? "bg-yellow-50 text-yellow-700 border-yellow-300"
                                      : "bg-green-50 text-green-700 border-green-300"
                                  }
                                >
                                  {vendor.pendingCount > 0
                                    ? `${vendor.pendingCount} Pending`
                                    : "All Paid"}
                                </Badge>
                              </div>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="pt-4">
                              {/* Grouped Service Breakdown Table */}
                              {(Object.keys(vendor.adhocJobs.services).length > 0 || 
                                Object.keys(vendor.bundleJobs.bundles).length > 0) && (
                                <div className="mb-6">
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead>Type</TableHead>
                                        <TableHead>Service/Bundle</TableHead>
                                        <TableHead className="text-right">Unit Cost</TableHead>
                                        <TableHead className="text-right">Quantity</TableHead>
                                        <TableHead className="text-right">Total Cost</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {Object.entries(vendor.adhocJobs.services).map(([serviceName, breakdown]) => (
                                        <TableRow key={`adhoc-${serviceName}`}>
                                          <TableCell>
                                            <Badge variant="outline" className="text-xs">Ad-hoc</Badge>
                                          </TableCell>
                                          <TableCell>{serviceName}</TableCell>
                                          <TableCell className="text-right">${breakdown.unitCost.toFixed(2)}</TableCell>
                                          <TableCell className="text-right">{breakdown.count}</TableCell>
                                          <TableCell className="text-right font-medium">${breakdown.totalCost.toFixed(2)}</TableCell>
                                        </TableRow>
                                      ))}
                                      {Object.entries(vendor.bundleJobs.bundles).map(([bundleName, breakdown]) => (
                                        <TableRow key={`bundle-${bundleName}`}>
                                          <TableCell>
                                            <Badge variant="outline" className="text-xs">Bundle</Badge>
                                          </TableCell>
                                          <TableCell>{bundleName}</TableCell>
                                          <TableCell className="text-right">${breakdown.unitCost.toFixed(2)}</TableCell>
                                          <TableCell className="text-right">{breakdown.count}</TableCell>
                                          <TableCell className="text-right font-medium">${breakdown.totalCost.toFixed(2)}</TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
                              )}

                            {/* Admin: Individual Jobs for Mark as Paid */}
                            {isAdmin && vendor.pendingCount > 0 && (
                              <div className="mt-4 pt-4 border-t">
                                <div className="flex items-center justify-between mb-3">
                                  <h4 className="text-sm font-medium text-dark-gray">Individual Jobs (for payment marking)</h4>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      handleSelectAllPending(vendor.jobs)
                                    }
                                    data-testid={`button-select-all-${vendor.vendorId}`}
                                  >
                                    Select All Pending ({vendor.pendingCount})
                                  </Button>
                                </div>
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead className="w-[40px]"></TableHead>
                                      <TableHead>Job ID</TableHead>
                                      <TableHead>Type</TableHead>
                                      <TableHead>Service/Bundle</TableHead>
                                      <TableHead>Delivered</TableHead>
                                      <TableHead>Cost</TableHead>
                                      <TableHead>Status</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {vendor.jobs.map((job) => (
                                      <TableRow
                                        key={job.id}
                                        data-testid={`row-job-${job.id}`}
                                      >
                                        <TableCell>
                                          {job.paymentStatus === "pending" && (
                                            <Checkbox
                                              checked={selectedJobs.has(job.id)}
                                              onCheckedChange={(checked) =>
                                                handleJobSelection(
                                                  job.id,
                                                  checked as boolean
                                                )
                                              }
                                              data-testid={`checkbox-job-${job.id}`}
                                            />
                                          )}
                                        </TableCell>
                                        <TableCell className="font-medium">
                                          <Link
                                            href={
                                              job.type === "adhoc"
                                                ? `/jobs/${job.id}`
                                                : `/bundle-jobs/${job.id}`
                                            }
                                          >
                                            <span className="text-sky-blue-accent hover:underline cursor-pointer">
                                              {job.type === "adhoc" ? "A" : "B"}-
                                              {job.id.slice(0, 5).toUpperCase()}
                                            </span>
                                          </Link>
                                        </TableCell>
                                        <TableCell>
                                          <Badge variant="outline" className="text-xs">
                                            {job.type === "adhoc"
                                              ? "Ad-hoc"
                                              : "Bundle"}
                                          </Badge>
                                        </TableCell>
                                        <TableCell>{job.serviceName}</TableCell>
                                        <TableCell className="whitespace-nowrap">
                                          {job.deliveredAt
                                            ? format(
                                                new Date(job.deliveredAt),
                                                "MMM dd, yyyy"
                                              )
                                            : "-"}
                                        </TableCell>
                                        <TableCell className="font-medium">
                                          ${job.vendorCost.toFixed(2)}
                                        </TableCell>
                                        <TableCell>
                                          <Badge
                                            className={
                                              job.paymentStatus === "paid"
                                                ? "bg-green-100 text-green-700"
                                                : "bg-yellow-100 text-yellow-700"
                                            }
                                          >
                                            {job.paymentStatus === "paid" ? (
                                              <>
                                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                                Paid
                                              </>
                                            ) : (
                                              <>
                                                <Clock className="h-3 w-3 mr-1" />
                                                Pending
                                              </>
                                            )}
                                          </Badge>
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            )}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                  ) : (
                    /* Vendor view: Single vendor, no accordion, labels use "Price" */
                    reportData?.vendors.map((vendor) => (
                      <div key={vendor.vendorId}>
                        {/* Service Breakdown Table with "Price" labels for vendor */}
                        {(Object.keys(vendor.adhocJobs.services).length > 0 || 
                          Object.keys(vendor.bundleJobs.bundles).length > 0) && (
                          <div className="mb-6">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Type</TableHead>
                                  <TableHead>Service/Bundle</TableHead>
                                  <TableHead className="text-right">Unit Price</TableHead>
                                  <TableHead className="text-right">Quantity</TableHead>
                                  <TableHead className="text-right">Total Price</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {Object.entries(vendor.adhocJobs.services).map(([serviceName, breakdown]) => (
                                  <TableRow key={`adhoc-${serviceName}`}>
                                    <TableCell>
                                      <Badge variant="outline" className="text-xs">Ad-hoc</Badge>
                                    </TableCell>
                                    <TableCell>{serviceName}</TableCell>
                                    <TableCell className="text-right">${breakdown.unitCost.toFixed(2)}</TableCell>
                                    <TableCell className="text-right">{breakdown.count}</TableCell>
                                    <TableCell className="text-right font-medium">${breakdown.totalCost.toFixed(2)}</TableCell>
                                  </TableRow>
                                ))}
                                {Object.entries(vendor.bundleJobs.bundles).map(([bundleName, breakdown]) => (
                                  <TableRow key={`bundle-${bundleName}`}>
                                    <TableCell>
                                      <Badge variant="outline" className="text-xs">Bundle</Badge>
                                    </TableCell>
                                    <TableCell>{bundleName}</TableCell>
                                    <TableCell className="text-right">${breakdown.unitCost.toFixed(2)}</TableCell>
                                    <TableCell className="text-right">{breakdown.count}</TableCell>
                                    <TableCell className="text-right font-medium">${breakdown.totalCost.toFixed(2)}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                              <TableFooter className="bg-muted sticky bottom-0">
                                <TableRow>
                                  <TableCell colSpan={4} className="font-semibold text-dark-blue-night">
                                    Total Price
                                  </TableCell>
                                  <TableCell className="text-right text-lg font-bold text-dark-blue-night">
                                    ${vendor.totalEarnings.toFixed(2)}
                                  </TableCell>
                                </TableRow>
                              </TableFooter>
                            </Table>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </main>
    </div>
  );
}
