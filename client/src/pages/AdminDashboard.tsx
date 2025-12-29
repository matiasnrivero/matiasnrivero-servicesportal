import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { format, startOfMonth, subDays, subMonths } from "date-fns";
import { 
  Clock, 
  Building2, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  XCircle,
  AlertTriangle,
  DollarSign,
  TrendingUp,
  Users,
  Package,
  Layers
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Skeleton } from "@/components/ui/skeleton";
import type { User } from "@shared/schema";

type DatePreset = "current_month" | "last_month" | "last_7_days" | "custom";

interface DashboardSummary {
  jobCounts: {
    pendingAssignment: number;
    assignedToVendor: number;
    inProgress: number;
    delivered: number;
    changeRequest: number;
    canceled: number;
  };
  jobsOverSla: number;
  openJobs: number;
  financial: {
    totalSales: number;
    vendorCost: number;
    profit: number;
    marginPercent: number;
    aov: number;
  };
  totalOrders: number;
}

interface TopClient {
  userId: string;
  clientName: string;
  totalRequests: number;
  totalSales: number;
}

interface TopService {
  serviceId: string;
  serviceName: string;
  totalOrders: number;
  totalSales: number;
}

interface TopBundle {
  bundleId: string;
  bundleName: string;
  totalOrders: number;
  totalSales: number;
}

interface DailyData {
  date: string;
  sales?: number;
  orders?: number;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export default function AdminDashboard() {
  const [, setLocation] = useLocation();
  const [datePreset, setDatePreset] = useState<DatePreset>("current_month");
  
  const { startDate, endDate } = useMemo(() => {
    const today = new Date();
    switch (datePreset) {
      case "current_month":
        return {
          startDate: startOfMonth(today),
          endDate: today,
        };
      case "last_month":
        const lastMonth = subMonths(today, 1);
        return {
          startDate: startOfMonth(lastMonth),
          endDate: new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0),
        };
      case "last_7_days":
        return {
          startDate: subDays(today, 7),
          endDate: today,
        };
      default:
        return {
          startDate: startOfMonth(today),
          endDate: today,
        };
    }
  }, [datePreset]);

  const dateParams = useMemo(() => {
    return `start=${startDate.toISOString()}&end=${endDate.toISOString()}`;
  }, [startDate, endDate]);

  const { data: currentUser } = useQuery<User>({
    queryKey: ["/api/default-user"],
  });

  const { data: summary, isLoading: summaryLoading } = useQuery<DashboardSummary>({
    queryKey: [`/api/admin/dashboard/summary?${dateParams}`],
    enabled: currentUser?.role === "admin",
  });

  const { data: topClients, isLoading: clientsLoading } = useQuery<TopClient[]>({
    queryKey: [`/api/admin/dashboard/top-clients?${dateParams}`],
    enabled: currentUser?.role === "admin",
  });

  const { data: topServices, isLoading: servicesLoading } = useQuery<TopService[]>({
    queryKey: [`/api/admin/dashboard/top-services?${dateParams}`],
    enabled: currentUser?.role === "admin",
  });

  const { data: topBundles, isLoading: bundlesLoading } = useQuery<TopBundle[]>({
    queryKey: [`/api/admin/dashboard/top-bundles?${dateParams}`],
    enabled: currentUser?.role === "admin",
  });

  const { data: dailySales, isLoading: salesLoading } = useQuery<DailyData[]>({
    queryKey: [`/api/admin/dashboard/daily-sales?${dateParams}`],
    enabled: currentUser?.role === "admin",
  });

  const { data: dailyOrders, isLoading: ordersLoading } = useQuery<DailyData[]>({
    queryKey: [`/api/admin/dashboard/daily-orders?${dateParams}`],
    enabled: currentUser?.role === "admin",
  });

  const chartData = useMemo(() => {
    if (!dailySales || !dailyOrders) return [];
    
    const combined: Record<string, { date: string; sales: number; orders: number }> = {};
    
    dailySales.forEach(d => {
      combined[d.date] = { date: d.date, sales: d.sales || 0, orders: 0 };
    });
    
    dailyOrders.forEach(d => {
      if (combined[d.date]) {
        combined[d.date].orders = d.orders || 0;
      } else {
        combined[d.date] = { date: d.date, sales: 0, orders: d.orders || 0 };
      }
    });
    
    return Object.values(combined).sort((a, b) => a.date.localeCompare(b.date));
  }, [dailySales, dailyOrders]);

  const xAxisTicks = useMemo(() => {
    if (chartData.length <= 15) return chartData.map(d => d.date);
    const step = Math.ceil(chartData.length / 15);
    return chartData.filter((_, i) => i % step === 0).map(d => d.date);
  }, [chartData]);

  const navigateToJobs = (status?: string, overSla?: boolean) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (overSla) params.set("overSla", "true");
    params.set("start", startDate.toISOString());
    params.set("end", endDate.toISOString());
    setLocation(`/jobs?${params.toString()}`);
  };

  if (currentUser?.role !== "admin") {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto p-6">
          <Card>
            <CardContent className="p-6">
              <p className="text-muted-foreground">Admin access required to view the dashboard.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold" data-testid="text-dashboard-title">Dashboard</h1>
          <Select value={datePreset} onValueChange={(v) => setDatePreset(v as DatePreset)}>
            <SelectTrigger className="w-48" data-testid="select-date-preset">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current_month">Current Month</SelectItem>
              <SelectItem value="last_month">Last Month</SelectItem>
              <SelectItem value="last_7_days">Last 7 Days</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <p className="text-sm text-muted-foreground">
          Showing data from {format(startDate, "MMM d, yyyy")} to {format(endDate, "MMM d, yyyy")}
        </p>

        {/* Section 1: Job Operations */}
        <section className="space-y-4">
          <h2 className="text-lg font-medium">Job Operations</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            <Card 
              className="cursor-pointer hover-elevate" 
              onClick={() => navigateToJobs("pending-assignment")}
              data-testid="card-pending-assignment"
            >
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Pending Assignment</CardTitle>
                <Clock className="h-4 w-4 text-yellow-500" />
              </CardHeader>
              <CardContent>
                {summaryLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="text-2xl font-bold" data-testid="text-pending-assignment-count">
                    {summary?.jobCounts.pendingAssignment || 0}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card 
              className="cursor-pointer hover-elevate" 
              onClick={() => navigateToJobs("assigned-to-vendor")}
              data-testid="card-assigned-to-vendor"
            >
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Assigned to Vendor</CardTitle>
                <Building2 className="h-4 w-4 text-yellow-600" />
              </CardHeader>
              <CardContent>
                {summaryLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="text-2xl font-bold" data-testid="text-assigned-vendor-count">
                    {summary?.jobCounts.assignedToVendor || 0}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card 
              className="cursor-pointer hover-elevate" 
              onClick={() => navigateToJobs("in-progress")}
              data-testid="card-in-progress"
            >
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">In Progress</CardTitle>
                <RefreshCw className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                {summaryLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="text-2xl font-bold" data-testid="text-in-progress-count">
                    {summary?.jobCounts.inProgress || 0}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card 
              className="cursor-pointer hover-elevate" 
              onClick={() => navigateToJobs("delivered")}
              data-testid="card-delivered"
            >
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Delivered</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                {summaryLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="text-2xl font-bold" data-testid="text-delivered-count">
                    {summary?.jobCounts.delivered || 0}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card 
              className="cursor-pointer hover-elevate" 
              onClick={() => navigateToJobs("change-request")}
              data-testid="card-change-request"
            >
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Change Request</CardTitle>
                <AlertCircle className="h-4 w-4 text-orange-500" />
              </CardHeader>
              <CardContent>
                {summaryLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="text-2xl font-bold" data-testid="text-change-request-count">
                    {summary?.jobCounts.changeRequest || 0}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card 
              className="cursor-pointer hover-elevate" 
              onClick={() => navigateToJobs("canceled")}
              data-testid="card-canceled"
            >
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Canceled</CardTitle>
                <XCircle className="h-4 w-4 text-gray-500" />
              </CardHeader>
              <CardContent>
                {summaryLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="text-2xl font-bold" data-testid="text-canceled-count">
                    {summary?.jobCounts.canceled || 0}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card 
              className="cursor-pointer hover-elevate border-destructive/50" 
              onClick={() => navigateToJobs(undefined, true)}
              data-testid="card-over-sla"
            >
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium text-destructive">Jobs Over SLA</CardTitle>
                <AlertTriangle className="h-4 w-4 text-destructive" />
              </CardHeader>
              <CardContent>
                {summaryLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="text-2xl font-bold text-destructive" data-testid="text-over-sla-count">
                    {summary?.jobsOverSla || 0}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Section 2: Financial Performance */}
        <section className="space-y-4">
          <h2 className="text-lg font-medium">Financial Performance</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card data-testid="card-total-sales">
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Sales</CardTitle>
                <DollarSign className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                {summaryLoading ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <div className="text-2xl font-bold" data-testid="text-total-sales">
                    {formatCurrency(summary?.financial.totalSales || 0)}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card data-testid="card-vendor-cost">
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Vendor Cost</CardTitle>
                <DollarSign className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent>
                {summaryLoading ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <div className="text-2xl font-bold" data-testid="text-vendor-cost">
                    {formatCurrency(summary?.financial.vendorCost || 0)}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card data-testid="card-profit">
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Profit</CardTitle>
                <TrendingUp className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                {summaryLoading ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <div className="text-2xl font-bold" data-testid="text-profit">
                    {formatCurrency(summary?.financial.profit || 0)}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card data-testid="card-margin">
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Margin</CardTitle>
                <TrendingUp className="h-4 w-4 text-purple-600" />
              </CardHeader>
              <CardContent>
                {summaryLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="text-2xl font-bold" data-testid="text-margin">
                    {summary?.financial.totalSales ? formatPercent(summary.financial.marginPercent) : "—"}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Section 3: Top Drivers */}
        <section className="space-y-4">
          <h2 className="text-lg font-medium">Top Drivers</h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Top Clients */}
            <Card data-testid="card-top-clients">
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-base font-medium flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Top Clients
                </CardTitle>
              </CardHeader>
              <CardContent>
                {clientsLoading ? (
                  <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-8 w-full" />
                    ))}
                  </div>
                ) : topClients && topClients.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Client</TableHead>
                        <TableHead className="text-right">Orders</TableHead>
                        <TableHead className="text-right">Sales</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topClients.slice(0, 5).map((client) => (
                        <TableRow 
                          key={client.userId}
                          className="cursor-pointer hover-elevate"
                          onClick={() => setLocation(`/jobs?clientId=${client.userId}`)}
                          data-testid={`row-client-${client.userId}`}
                        >
                          <TableCell className="font-medium">{client.clientName}</TableCell>
                          <TableCell className="text-right">{client.totalRequests}</TableCell>
                          <TableCell className="text-right">{formatCurrency(client.totalSales)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">No data available</p>
                )}
              </CardContent>
            </Card>

            {/* Top Services */}
            <Card data-testid="card-top-services">
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-base font-medium flex items-center gap-2">
                  <Layers className="h-4 w-4" />
                  Top Services
                </CardTitle>
              </CardHeader>
              <CardContent>
                {servicesLoading ? (
                  <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-8 w-full" />
                    ))}
                  </div>
                ) : topServices && topServices.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Service</TableHead>
                        <TableHead className="text-right">Orders</TableHead>
                        <TableHead className="text-right">Sales</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topServices.slice(0, 5).map((service) => (
                        <TableRow 
                          key={service.serviceId}
                          data-testid={`row-service-${service.serviceId}`}
                        >
                          <TableCell className="font-medium">{service.serviceName}</TableCell>
                          <TableCell className="text-right">{service.totalOrders}</TableCell>
                          <TableCell className="text-right">{formatCurrency(service.totalSales)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">No data available</p>
                )}
              </CardContent>
            </Card>

            {/* Top Bundles */}
            <Card data-testid="card-top-bundles">
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-base font-medium flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Top Bundles
                </CardTitle>
              </CardHeader>
              <CardContent>
                {bundlesLoading ? (
                  <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-8 w-full" />
                    ))}
                  </div>
                ) : topBundles && topBundles.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Bundle</TableHead>
                        <TableHead className="text-right">Orders</TableHead>
                        <TableHead className="text-right">Sales</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topBundles.slice(0, 5).map((bundle) => (
                        <TableRow 
                          key={bundle.bundleId}
                          data-testid={`row-bundle-${bundle.bundleId}`}
                        >
                          <TableCell className="font-medium">{bundle.bundleName}</TableCell>
                          <TableCell className="text-right">{bundle.totalOrders}</TableCell>
                          <TableCell className="text-right">{formatCurrency(bundle.totalSales)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">No data available</p>
                )}
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Section 4: Daily Trends */}
        <section className="space-y-4">
          <h2 className="text-lg font-medium">Daily Trends</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Daily Sales Chart */}
            <Card data-testid="card-daily-sales-chart">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium">Daily Sales ($)</CardTitle>
              </CardHeader>
              <CardContent>
                {salesLoading ? (
                  <Skeleton className="h-64 w-full" />
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis 
                          dataKey="date" 
                          ticks={xAxisTicks}
                          tickFormatter={(value) => format(new Date(value), "MMM d")}
                          className="text-xs"
                        />
                        <YAxis 
                          tickFormatter={(value) => `$${value}`}
                          className="text-xs"
                        />
                        <Tooltip 
                          formatter={(value: number) => [formatCurrency(value), "Sales"]}
                          labelFormatter={(label) => format(new Date(label), "MMM d, yyyy")}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="sales" 
                          stroke="hsl(var(--primary))" 
                          strokeWidth={2}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Daily Orders Chart */}
            <Card data-testid="card-daily-orders-chart">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium">Daily Orders</CardTitle>
              </CardHeader>
              <CardContent>
                {ordersLoading ? (
                  <Skeleton className="h-64 w-full" />
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis 
                          dataKey="date" 
                          ticks={xAxisTicks}
                          tickFormatter={(value) => format(new Date(value), "MMM d")}
                          className="text-xs"
                        />
                        <YAxis className="text-xs" />
                        <Tooltip 
                          formatter={(value: number) => [value, "Orders"]}
                          labelFormatter={(label) => format(new Date(label), "MMM d, yyyy")}
                        />
                        <Bar 
                          dataKey="orders" 
                          fill="hsl(var(--primary))" 
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </div>
  );
}
