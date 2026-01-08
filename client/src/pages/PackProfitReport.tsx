import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { format } from "date-fns";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  ChevronLeft,
  DollarSign,
  TrendingUp,
  Package,
  Download,
} from "lucide-react";

interface CurrentUser {
  userId: string;
  role: string;
  username: string;
}

interface PackProfitRow {
  id: string;
  clientName: string;
  clientEmail: string;
  packName: string;
  vendorName: string;
  vendorId: string | null;
  retailPrice: number;
  vendorCost: number;
  profit: number;
  marginPercent: number;
  status: string;
  startDate: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
}

interface PackProfitSummary {
  totalSubscriptions: number;
  totalRetailPrice: number;
  totalVendorCost: number;
  totalProfit: number;
  averageMargin: number;
}

interface PackProfitFilters {
  packs: { id: string; name: string }[];
  vendors: { id: string; name: string }[];
}

interface PackProfitReportData {
  rows: PackProfitRow[];
  summary: PackProfitSummary;
  filters: PackProfitFilters;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export default function PackProfitReport() {
  const [filterVendor, setFilterVendor] = useState("all");
  const [filterPack, setFilterPack] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const { data: currentUser } = useQuery<CurrentUser>({
    queryKey: ["/api/default-user"],
  });

  const queryParams = new URLSearchParams();
  if (filterVendor !== "all") queryParams.set("vendorId", filterVendor);
  if (filterPack !== "all") queryParams.set("packId", filterPack);
  if (filterStatus !== "all") queryParams.set("status", filterStatus);

  const { data: reportData, isLoading } = useQuery<PackProfitReportData>({
    queryKey: ["/api/reports/pack-profit", filterVendor, filterPack, filterStatus],
    queryFn: async () => {
      const res = await fetch(`/api/reports/pack-profit?${queryParams.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch report");
      return res.json();
    },
    enabled: currentUser?.role === "admin",
  });

  const handleExportCSV = () => {
    if (!reportData?.rows) return;
    
    const headers = ["Client", "Pack", "Vendor", "Retail Price", "Vendor Cost", "Profit", "Margin %", "Status", "Start Date"];
    const csvRows = [
      headers.join(","),
      ...reportData.rows.map(row => [
        `"${row.clientName}"`,
        `"${row.packName}"`,
        `"${row.vendorName}"`,
        row.retailPrice.toFixed(2),
        row.vendorCost.toFixed(2),
        row.profit.toFixed(2),
        row.marginPercent.toFixed(1),
        row.status,
        format(new Date(row.startDate), "yyyy-MM-dd"),
      ].join(","))
    ];
    
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pack-profit-report-${format(new Date(), "yyyy-MM-dd")}.csv`;
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
              <h1 className="text-2xl font-bold" data-testid="text-report-title">Pack Profit Report</h1>
              <p className="text-muted-foreground mt-1">
                Analyze pack subscription revenue, vendor costs, and profit margins
              </p>
            </div>
            <Button onClick={handleExportCSV} variant="outline" data-testid="button-export">
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        {reportData?.summary && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium">Total Subscriptions</CardTitle>
                <Package className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-subscriptions">
                  {reportData.summary.totalSubscriptions}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-revenue">
                  {formatCurrency(reportData.summary.totalRetailPrice)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium">Vendor Cost</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-vendor-cost">
                  {formatCurrency(reportData.summary.totalVendorCost)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium">Total Profit</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600" data-testid="text-total-profit">
                  {formatCurrency(reportData.summary.totalProfit)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium">Avg Margin</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-avg-margin">
                  {reportData.summary.averageMargin.toFixed(1)}%
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium">Pack:</label>
                <Select value={filterPack} onValueChange={setFilterPack}>
                  <SelectTrigger className="w-[180px]" data-testid="select-pack-filter">
                    <SelectValue placeholder="All Packs" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Packs</SelectItem>
                    {reportData?.filters.packs.map(pack => (
                      <SelectItem key={pack.id} value={pack.id}>{pack.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium">Vendor:</label>
                <Select value={filterVendor} onValueChange={setFilterVendor}>
                  <SelectTrigger className="w-[180px]" data-testid="select-vendor-filter">
                    <SelectValue placeholder="All Vendors" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Vendors</SelectItem>
                    {reportData?.filters.vendors.map(vendor => (
                      <SelectItem key={vendor.id} value={vendor.id}>{vendor.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium">Status:</label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-[150px]" data-testid="select-status-filter">
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Data Table */}
        <Card>
          <CardContent className="pt-6">
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : !reportData?.rows.length ? (
              <div className="text-center py-8 text-muted-foreground">
                No pack subscriptions found matching the filters.
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Client</TableHead>
                      <TableHead>Pack</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead className="text-right">Retail Price</TableHead>
                      <TableHead className="text-right">Vendor Cost</TableHead>
                      <TableHead className="text-right">Profit</TableHead>
                      <TableHead className="text-right">Margin</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Start Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportData.rows.map(row => (
                      <TableRow key={row.id} data-testid={`row-subscription-${row.id}`}>
                        <TableCell>
                          <div className="font-medium">{row.clientName}</div>
                          <div className="text-sm text-muted-foreground">{row.clientEmail}</div>
                        </TableCell>
                        <TableCell>{row.packName}</TableCell>
                        <TableCell>{row.vendorName}</TableCell>
                        <TableCell className="text-right">{formatCurrency(row.retailPrice)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(row.vendorCost)}</TableCell>
                        <TableCell className="text-right font-medium text-green-600">
                          {formatCurrency(row.profit)}
                        </TableCell>
                        <TableCell className="text-right">{row.marginPercent.toFixed(1)}%</TableCell>
                        <TableCell>
                          <Badge variant={row.status === "active" ? "default" : "secondary"}>
                            {row.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{format(new Date(row.startDate), "MMM d, yyyy")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
