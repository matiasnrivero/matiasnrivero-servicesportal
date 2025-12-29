import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { format, startOfMonth, subDays, subMonths, endOfMonth, startOfYear, endOfYear, subYears, startOfDay, endOfDay } from "date-fns";
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
  TrendingDown,
  Users,
  Package,
  Layers,
  CalendarIcon,
  ArrowUpRight,
  ArrowDownRight,
  Minus
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
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
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import type { User } from "@shared/schema";

type DatePreset = "today" | "yesterday" | "last_7_days" | "last_30_days" | "last_90_days" | "last_365_days" | "this_month" | "last_month" | "this_year" | "last_year" | "custom";

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
  const [datePreset, setDatePreset] = useState<DatePreset>("this_month");
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(undefined);
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>(undefined);
  const [startCalendarOpen, setStartCalendarOpen] = useState(false);
  const [endCalendarOpen, setEndCalendarOpen] = useState(false);
  
  const { startDate, endDate } = useMemo(() => {
    const today = new Date();
    switch (datePreset) {
      case "today":
        return {
          startDate: startOfDay(today),
          endDate: endOfDay(today),
        };
      case "yesterday":
        const yesterday = subDays(today, 1);
        return {
          startDate: startOfDay(yesterday),
          endDate: endOfDay(yesterday),
        };
      case "last_7_days":
        return {
          startDate: startOfDay(subDays(today, 6)),
          endDate: endOfDay(today),
        };
      case "last_30_days":
        return {
          startDate: startOfDay(subDays(today, 29)),
          endDate: endOfDay(today),
        };
      case "last_90_days":
        return {
          startDate: startOfDay(subDays(today, 89)),
          endDate: endOfDay(today),
        };
      case "last_365_days":
        return {
          startDate: startOfDay(subDays(today, 364)),
          endDate: endOfDay(today),
        };
      case "this_month":
        return {
          startDate: startOfMonth(today),
          endDate: today,
        };
      case "last_month":
        const lastMonth = subMonths(today, 1);
        return {
          startDate: startOfMonth(lastMonth),
          endDate: endOfMonth(lastMonth),
        };
      case "this_year":
        return {
          startDate: startOfYear(today),
          endDate: today,
        };
      case "last_year":
        const lastYear = subYears(today, 1);
        return {
          startDate: startOfYear(lastYear),
          endDate: endOfYear(lastYear),
        };
      case "custom":
        return {
          startDate: customStartDate || startOfMonth(today),
          endDate: customEndDate || today,
        };
      default:
        return {
          startDate: startOfMonth(today),
          endDate: today,
        };
    }
  }, [datePreset, customStartDate, customEndDate]);

  // Calculate comparison period (same duration, immediately before)
  const { comparisonStartDate, comparisonEndDate } = useMemo(() => {
    const duration = endDate.getTime() - startDate.getTime();
    const compEnd = new Date(startDate.getTime() - 1); // Day before start
    const compStart = new Date(compEnd.getTime() - duration);
    return {
      comparisonStartDate: compStart,
      comparisonEndDate: compEnd,
    };
  }, [startDate, endDate]);

  const dateParams = useMemo(() => {
    return `start=${startDate.toISOString()}&end=${endDate.toISOString()}`;
  }, [startDate, endDate]);

  const comparisonDateParams = useMemo(() => {
    return `start=${comparisonStartDate.toISOString()}&end=${comparisonEndDate.toISOString()}`;
  }, [comparisonStartDate, comparisonEndDate]);

  const { data: currentUser } = useQuery<User>({
    queryKey: ["/api/default-user"],
  });

  // Role-based access configuration
  const allowedRoles = ["admin", "internal_designer", "vendor", "vendor_designer"];
  const isAllowedRole = Boolean(currentUser?.role && allowedRoles.includes(currentUser.role));
  const showFinancials = currentUser?.role === "admin";
  const showTopDrivers = currentUser?.role === "admin";
  const showDailySales = currentUser?.role === "admin";

  // Use role-based API endpoints
  const { data: summary, isLoading: summaryLoading } = useQuery<DashboardSummary>({
    queryKey: [`/api/dashboard/summary?${dateParams}`],
    enabled: isAllowedRole,
  });

  // Comparison period summary for period-over-period calculations (admin only)
  const { data: comparisonSummary } = useQuery<DashboardSummary>({
    queryKey: [`/api/dashboard/summary?${comparisonDateParams}`],
    enabled: showFinancials,
  });

  const { data: topClients, isLoading: clientsLoading } = useQuery<TopClient[]>({
    queryKey: [`/api/admin/dashboard/top-clients?${dateParams}`],
    enabled: showTopDrivers,
  });

  const { data: topServices, isLoading: servicesLoading } = useQuery<TopService[]>({
    queryKey: [`/api/admin/dashboard/top-services?${dateParams}`],
    enabled: showTopDrivers,
  });

  const { data: topBundles, isLoading: bundlesLoading } = useQuery<TopBundle[]>({
    queryKey: [`/api/admin/dashboard/top-bundles?${dateParams}`],
    enabled: showTopDrivers,
  });

  const { data: dailySales, isLoading: salesLoading } = useQuery<DailyData[]>({
    queryKey: [`/api/admin/dashboard/daily-sales?${dateParams}`],
    enabled: showDailySales,
  });

  const { data: dailyOrders, isLoading: ordersLoading } = useQuery<DailyData[]>({
    queryKey: [`/api/dashboard/daily-orders?${dateParams}`],
    enabled: isAllowedRole,
  });

  const chartData = useMemo(() => {
    if (!dailyOrders) return [];
    
    const combined: Record<string, { date: string; sales: number; orders: number }> = {};
    
    // Add sales data if available (admin only)
    if (dailySales) {
      dailySales.forEach(d => {
        combined[d.date] = { date: d.date, sales: d.sales || 0, orders: 0 };
      });
    }
    
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

  // Calculate period-over-period change
  const calculateChange = useCallback((current: number, previous: number): { value: number; direction: 'up' | 'down' | 'neutral' } => {
    if (previous === 0) {
      if (current > 0) return { value: 100, direction: 'up' };
      return { value: 0, direction: 'neutral' };
    }
    const change = ((current - previous) / previous) * 100;
    return {
      value: Math.abs(change),
      direction: change > 0.5 ? 'up' : change < -0.5 ? 'down' : 'neutral',
    };
  }, []);

  // Comparison metrics
  const salesChange = useMemo(() => {
    return calculateChange(summary?.financial.totalSales || 0, comparisonSummary?.financial.totalSales || 0);
  }, [summary, comparisonSummary, calculateChange]);

  const ordersChange = useMemo(() => {
    return calculateChange(summary?.totalOrders || 0, comparisonSummary?.totalOrders || 0);
  }, [summary, comparisonSummary, calculateChange]);

  const profitChange = useMemo(() => {
    return calculateChange(summary?.financial.profit || 0, comparisonSummary?.financial.profit || 0);
  }, [summary, comparisonSummary, calculateChange]);

  const aovChange = useMemo(() => {
    return calculateChange(summary?.financial.aov || 0, comparisonSummary?.financial.aov || 0);
  }, [summary, comparisonSummary, calculateChange]);

  // CSV Export functionality
  const exportToCsv = useCallback(() => {
    const rows: string[][] = [];
    
    // Header section
    rows.push(['Dashboard Report']);
    rows.push([`Period: ${format(startDate, "MMM d, yyyy")} - ${format(endDate, "MMM d, yyyy")}`]);
    rows.push([]);
    
    // Financial Summary
    rows.push(['Financial Summary']);
    rows.push(['Metric', 'Value', 'vs Previous Period']);
    rows.push(['Total Sales', formatCurrency(summary?.financial.totalSales || 0), `${salesChange.direction === 'up' ? '+' : salesChange.direction === 'down' ? '-' : ''}${salesChange.value.toFixed(1)}%`]);
    rows.push(['Vendor Cost', formatCurrency(summary?.financial.vendorCost || 0), '']);
    rows.push(['Profit', formatCurrency(summary?.financial.profit || 0), `${profitChange.direction === 'up' ? '+' : profitChange.direction === 'down' ? '-' : ''}${profitChange.value.toFixed(1)}%`]);
    rows.push(['Margin', formatPercent(summary?.financial.marginPercent || 0), '']);
    rows.push(['Total Orders', String(summary?.totalOrders || 0), `${ordersChange.direction === 'up' ? '+' : ordersChange.direction === 'down' ? '-' : ''}${ordersChange.value.toFixed(1)}%`]);
    rows.push(['AOV', formatCurrency(summary?.financial.aov || 0), `${aovChange.direction === 'up' ? '+' : aovChange.direction === 'down' ? '-' : ''}${aovChange.value.toFixed(1)}%`]);
    rows.push([]);
    
    // Job Counts
    rows.push(['Job Counts by Status']);
    rows.push(['Status', 'Count']);
    rows.push(['Pending Assignment', String(summary?.jobCounts.pendingAssignment || 0)]);
    rows.push(['Assigned to Vendor', String(summary?.jobCounts.assignedToVendor || 0)]);
    rows.push(['In Progress', String(summary?.jobCounts.inProgress || 0)]);
    rows.push(['Delivered', String(summary?.jobCounts.delivered || 0)]);
    rows.push(['Change Request', String(summary?.jobCounts.changeRequest || 0)]);
    rows.push(['Canceled', String(summary?.jobCounts.canceled || 0)]);
    rows.push(['Jobs Over SLA', String(summary?.jobsOverSla || 0)]);
    rows.push([]);
    
    // Top Clients
    if (topClients && topClients.length > 0) {
      rows.push(['Top Clients']);
      rows.push(['Client', 'Orders', 'Sales']);
      topClients.forEach(c => {
        rows.push([c.clientName, String(c.totalRequests), formatCurrency(c.totalSales)]);
      });
      rows.push([]);
    }
    
    // Top Services
    if (topServices && topServices.length > 0) {
      rows.push(['Top Services']);
      rows.push(['Service', 'Orders', 'Sales']);
      topServices.forEach(s => {
        rows.push([s.serviceName, String(s.totalOrders), formatCurrency(s.totalSales)]);
      });
      rows.push([]);
    }
    
    // Top Bundles
    if (topBundles && topBundles.length > 0) {
      rows.push(['Top Bundles']);
      rows.push(['Bundle', 'Orders', 'Sales']);
      topBundles.forEach(b => {
        rows.push([b.bundleName, String(b.totalOrders), formatCurrency(b.totalSales)]);
      });
      rows.push([]);
    }
    
    // Daily Data
    if (chartData.length > 0) {
      rows.push(['Daily Trends']);
      rows.push(['Date', 'Sales', 'Orders']);
      chartData.forEach(d => {
        rows.push([d.date, formatCurrency(d.sales), String(d.orders)]);
      });
    }
    
    // Convert to CSV
    const csvContent = rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');
    
    // Download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `dashboard-report-${format(startDate, 'yyyy-MM-dd')}-to-${format(endDate, 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [startDate, endDate, summary, topClients, topServices, topBundles, chartData, salesChange, ordersChange, profitChange, aovChange]);

  // Change indicator component
  const ChangeIndicator = ({ change, invertColors = false }: { change: { value: number; direction: 'up' | 'down' | 'neutral' }; invertColors?: boolean }) => {
    const isPositive = invertColors ? change.direction === 'down' : change.direction === 'up';
    const isNegative = invertColors ? change.direction === 'up' : change.direction === 'down';
    
    if (change.direction === 'neutral') {
      return (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Minus className="h-3 w-3" />
          <span>0%</span>
        </span>
      );
    }
    
    return (
      <span className={`flex items-center gap-1 text-xs ${isPositive ? 'text-green-600 dark:text-green-400' : isNegative ? 'text-red-600 dark:text-red-400' : ''}`}>
        {change.direction === 'up' ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
        <span>{change.value.toFixed(1)}%</span>
      </span>
    );
  };

  const navigateToJobs = (status?: string, overSla?: boolean) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (overSla) params.set("overSla", "true");
    params.set("start", startDate.toISOString());
    params.set("end", endDate.toISOString());
    setLocation(`/jobs?${params.toString()}`);
  };

  if (!isAllowedRole) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto p-6">
          <Card>
            <CardContent className="p-6">
              <p className="text-muted-foreground">Dashboard access is not available for your role.</p>
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
          <div className="flex flex-wrap items-center gap-2">
            <Select value={datePreset} onValueChange={(v) => setDatePreset(v as DatePreset)}>
              <SelectTrigger className="w-44" data-testid="select-date-preset">
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="last_7_days">Last 7 Days</SelectItem>
                <SelectItem value="last_30_days">Last 30 Days</SelectItem>
                <SelectItem value="last_90_days">Last 90 Days</SelectItem>
                <SelectItem value="last_365_days">Last 365 Days</SelectItem>
                <SelectItem value="this_month">This Month</SelectItem>
                <SelectItem value="last_month">Last Month</SelectItem>
                <SelectItem value="this_year">This Year</SelectItem>
                <SelectItem value="last_year">Last Year</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>
            
            {datePreset === "custom" && (
              <>
                <Popover open={startCalendarOpen} onOpenChange={setStartCalendarOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-36 justify-start text-left font-normal" data-testid="button-start-date">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {customStartDate ? format(customStartDate, "MMM d, yyyy") : "Start date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={customStartDate}
                      onSelect={(date) => {
                        setCustomStartDate(date);
                        setStartCalendarOpen(false);
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <span className="text-muted-foreground">to</span>
                <Popover open={endCalendarOpen} onOpenChange={setEndCalendarOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-36 justify-start text-left font-normal" data-testid="button-end-date">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {customEndDate ? format(customEndDate, "MMM d, yyyy") : "End date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={customEndDate}
                      onSelect={(date) => {
                        setCustomEndDate(date);
                        setEndCalendarOpen(false);
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>Showing data from {format(startDate, "MMM d, yyyy")} to {format(endDate, "MMM d, yyyy")}</span>
          <Badge variant="secondary" className="text-xs">
            vs {format(comparisonStartDate, "MMM d")} - {format(comparisonEndDate, "MMM d")}
          </Badge>
        </div>

        {/* Section 1: Job Operations */}
        <section className="space-y-4">
          <h2 className="text-lg font-medium">Job Operations</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            <Card 
              className="cursor-pointer hover-elevate" 
              onClick={() => navigateToJobs("pending-assignment")}
              data-testid="card-pending-assignment"
            >
              <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2 h-[72px]">
                <CardTitle className="text-sm font-medium text-muted-foreground">Pending Assignment</CardTitle>
                <Clock className="h-4 w-4 text-yellow-500 shrink-0" />
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
              <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2 h-[72px]">
                <CardTitle className="text-sm font-medium text-muted-foreground">Assigned to Vendor</CardTitle>
                <Building2 className="h-4 w-4 text-yellow-600 shrink-0" />
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
              <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2 h-[72px]">
                <CardTitle className="text-sm font-medium text-muted-foreground">In Progress</CardTitle>
                <RefreshCw className="h-4 w-4 text-blue-500 shrink-0" />
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
              <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2 h-[72px]">
                <CardTitle className="text-sm font-medium text-muted-foreground">Delivered</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
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
              <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2 h-[72px]">
                <CardTitle className="text-sm font-medium text-muted-foreground">Change Request</CardTitle>
                <AlertCircle className="h-4 w-4 text-orange-500 shrink-0" />
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
              <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2 h-[72px]">
                <CardTitle className="text-sm font-medium text-muted-foreground">Canceled</CardTitle>
                <XCircle className="h-4 w-4 text-gray-500 shrink-0" />
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
              <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2 h-[72px]">
                <CardTitle className="text-sm font-medium text-destructive">Jobs Over SLA</CardTitle>
                <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
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

        {/* Section 2: Financial Performance (Admin only) */}
        {showFinancials && (
        <section className="space-y-4">
          <h2 className="text-lg font-medium">Financial Performance</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <Card data-testid="card-total-sales">
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Sales</CardTitle>
                <DollarSign className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                {summaryLoading ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <div className="space-y-1">
                    <div className="text-2xl font-bold" data-testid="text-total-sales">
                      {formatCurrency(summary?.financial.totalSales || 0)}
                    </div>
                    <ChangeIndicator change={salesChange} />
                  </div>
                )}
              </CardContent>
            </Card>

            <Card data-testid="card-total-orders">
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Orders</CardTitle>
                <Package className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                {summaryLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="space-y-1">
                    <div className="text-2xl font-bold" data-testid="text-total-orders">
                      {summary?.totalOrders || 0}
                    </div>
                    <ChangeIndicator change={ordersChange} />
                  </div>
                )}
              </CardContent>
            </Card>

            <Card data-testid="card-aov">
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Avg Order Value</CardTitle>
                <TrendingUp className="h-4 w-4 text-indigo-500" />
              </CardHeader>
              <CardContent>
                {summaryLoading ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <div className="space-y-1">
                    <div className="text-2xl font-bold" data-testid="text-aov">
                      {formatCurrency(summary?.financial.aov || 0)}
                    </div>
                    <ChangeIndicator change={aovChange} />
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
                <TrendingUp className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                {summaryLoading ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <div className="space-y-1">
                    <div className="text-2xl font-bold" data-testid="text-profit">
                      {formatCurrency(summary?.financial.profit || 0)}
                    </div>
                    <ChangeIndicator change={profitChange} />
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
        )}

        {/* Section 3: Top Drivers (Admin only) */}
        {showTopDrivers && (
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
        )}

        {/* Section 4: Daily Trends */}
        <section className="space-y-4">
          <h2 className="text-lg font-medium">Daily Trends</h2>
          <div className={`grid gap-4 ${showDailySales ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
            {/* Daily Sales Chart (Admin only) */}
            {showDailySales && (
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
                        <RechartsTooltip 
                          formatter={(value: number) => [formatCurrency(value), "Sales"]}
                          labelFormatter={(label: string) => format(new Date(label), "MMM d, yyyy")}
                          contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '6px' }}
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
            )}

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
                        <RechartsTooltip 
                          formatter={(value: number) => [value, "Orders"]}
                          labelFormatter={(label: string) => format(new Date(label), "MMM d, yyyy")}
                          contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '6px' }}
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
