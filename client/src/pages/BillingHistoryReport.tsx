import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Download, Search, ArrowLeft, Receipt, RefreshCw, CalendarIcon } from "lucide-react";
import { Link } from "wouter";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import type { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";

interface BillingRecord {
  id: string;
  type: "upfront_payment" | "monthly_billing" | "refund";
  recordType: string;
  jobId: string | null;
  jobType: string | null;
  jobTitle: string;
  clientName: string;
  clientProfileId: string | null;
  date: string;
  billingPeriod?: string;
  amount: number;
  processingFee: number;
  netAmount: number;
  status: string;
  stripePaymentIntentId?: string;
  stripeRefundId?: string;
  paymentType: string;
  reason?: string;
}

interface BillingSummary {
  currentPaymentConfig: string;
  hasPayAsYouGo: boolean;
  hasMonthlyPayment: boolean;
  hasPackExceeded: boolean;
}

interface CurrentUser {
  userId: string;
  role: string;
  username: string;
  clientProfileId?: string;
}

interface ClientProfile {
  id: string;
  companyName: string;
}

export default function BillingHistoryReport() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<string>("");

  const { data: currentUser } = useQuery<CurrentUser>({
    queryKey: ["/api/auth/me"],
  });

  const { data: clientProfiles } = useQuery<ClientProfile[]>({
    queryKey: ["/api/client-profiles"],
    enabled: currentUser?.role === "admin",
  });

  const { data: billingSummary } = useQuery<BillingSummary>({
    queryKey: ["/api/reports/billing-summary", selectedClientId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedClientId) params.set("clientProfileId", selectedClientId);
      const url = `/api/reports/billing-summary${params.toString() ? `?${params}` : ""}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch billing summary");
      return res.json();
    },
    enabled: !!currentUser,
  });

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (selectedClientId) params.set("clientProfileId", selectedClientId);
    if (dateRange?.from) params.set("startDate", dateRange.from.toISOString());
    if (dateRange?.to) params.set("endDate", dateRange.to.toISOString());
    if (activeTab && activeTab !== "all") params.set("tab", activeTab);
    return params.toString();
  }, [selectedClientId, dateRange, activeTab]);

  const { data: billingRecords, isLoading } = useQuery<BillingRecord[]>({
    queryKey: ["/api/reports/billing-history", queryParams],
    queryFn: async () => {
      const url = `/api/reports/billing-history${queryParams ? `?${queryParams}` : ""}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch billing history");
      return res.json();
    },
  });

  const isAdmin = currentUser?.role === "admin";
  const isClient = currentUser?.role && ["client", "client_member"].includes(currentUser.role);

  const availableTabs = useMemo(() => {
    if (isAdmin) {
      return [
        { value: "pay_as_you_go", label: "Pay-as-you-go" },
        { value: "monthly_payment", label: "Monthly Payment" },
      ];
    }

    if (isClient && billingSummary) {
      const tabs: { value: string; label: string }[] = [];
      const currentConfig = billingSummary.currentPaymentConfig;

      if (currentConfig === "pay_as_you_go" || billingSummary.hasPayAsYouGo) {
        tabs.push({ value: "pay_as_you_go", label: "Pay-as-you-go" });
      }
      if (currentConfig === "monthly_payment" || billingSummary.hasMonthlyPayment) {
        tabs.push({ value: "monthly_payment", label: "Monthly Payment" });
      }

      if (tabs.length === 0) {
        tabs.push({ value: "pay_as_you_go", label: "Pay-as-you-go" });
      }

      const currentIndex = tabs.findIndex((t) => {
        if (currentConfig === "pay_as_you_go") return t.value === "pay_as_you_go";
        if (currentConfig === "monthly_payment") return t.value === "monthly_payment";
        return false;
      });
      if (currentIndex > 0) {
        const current = tabs.splice(currentIndex, 1)[0];
        tabs.unshift(current);
      }

      return tabs;
    }

    return [{ value: "pay_as_you_go", label: "Pay-as-you-go" }];
  }, [isAdmin, isClient, billingSummary]);

  const defaultTab = availableTabs[0]?.value || "pay_as_you_go";

  const filteredRecords = useMemo(() => {
    if (!billingRecords) return [];

    return billingRecords.filter((record) => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        record.jobTitle?.toLowerCase().includes(term) ||
        record.clientName?.toLowerCase().includes(term) ||
        record.id.toLowerCase().includes(term) ||
        record.jobId?.toLowerCase().includes(term)
      );
    });
  }, [billingRecords, searchTerm]);

  const totals = useMemo(() => {
    if (!filteredRecords.length) return { amount: 0, processingFee: 0, netAmount: 0 };

    return filteredRecords.reduce(
      (acc, record) => ({
        amount: acc.amount + record.amount,
        processingFee: acc.processingFee + record.processingFee,
        netAmount: acc.netAmount + record.netAmount,
      }),
      { amount: 0, processingFee: 0, netAmount: 0 }
    );
  }, [filteredRecords]);

  const handleExportCSV = () => {
    if (!filteredRecords.length) return;

    const headers = [
      "Date",
      "Type",
      "Job ID",
      "Description",
      isAdmin ? "Client" : null,
      "Amount",
      isAdmin ? "Processing Fee" : null,
      isAdmin ? "Net Amount" : null,
      "Status",
    ].filter(Boolean);

    const rows = filteredRecords.map((record) => {
      const row = [
        format(new Date(record.date), "yyyy-MM-dd HH:mm"),
        getRecordTypeLabel(record),
        record.jobId || "",
        record.jobTitle,
        isAdmin ? record.clientName : null,
        record.amount.toFixed(2),
        isAdmin ? record.processingFee.toFixed(2) : null,
        isAdmin ? record.netAmount.toFixed(2) : null,
        record.status,
      ].filter((val) => val !== null);
      return row.join(",");
    });

    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `billing-history-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  function getRecordTypeLabel(record: BillingRecord): string {
    if (record.type === "refund") return "Refund";
    if (record.type === "monthly_billing") {
      if (record.recordType === "pack_exceeded") return "Pack Exceeded";
      return "Monthly Services";
    }
    return record.recordType === "service" ? "Service Payment" : "Bundle Payment";
  }

  function formatCurrency(amount: number): string {
    const isNegative = amount < 0;
    return `${isNegative ? "-" : ""}$${Math.abs(amount).toFixed(2)}`;
  }

  if (!currentUser) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-6">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/reports">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">
              Stripe Billing History
            </h1>
            <p className="text-muted-foreground">
              {isAdmin
                ? "View all client billing history and payment details"
                : "View your billing history and payment details"}
            </p>
          </div>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4 items-end">
              {isAdmin && (
                <div className="w-64">
                  <label className="text-sm font-medium mb-2 block">Client</label>
                  <Select
                    value={selectedClientId}
                    onValueChange={setSelectedClientId}
                  >
                    <SelectTrigger data-testid="select-client">
                      <SelectValue placeholder="All Clients" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Clients</SelectItem>
                      {clientProfiles?.map((cp) => (
                        <SelectItem key={cp.id} value={cp.id}>
                          {cp.companyName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="w-80">
                <label className="text-sm font-medium mb-2 block">Date Range</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !dateRange && "text-muted-foreground"
                      )}
                      data-testid="button-date-range"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateRange?.from ? (
                        dateRange.to ? (
                          <>
                            {format(dateRange.from, "LLL dd, y")} - {format(dateRange.to, "LLL dd, y")}
                          </>
                        ) : (
                          format(dateRange.from, "LLL dd, y")
                        )
                      ) : (
                        <span>Pick a date range</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <div className="flex gap-2 p-2 border-b">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDateRange({
                          from: startOfMonth(new Date()),
                          to: endOfMonth(new Date()),
                        })}
                        data-testid="button-this-month"
                      >
                        This Month
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDateRange({
                          from: startOfMonth(subMonths(new Date(), 1)),
                          to: endOfMonth(subMonths(new Date(), 1)),
                        })}
                        data-testid="button-last-month"
                      >
                        Last Month
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDateRange(undefined)}
                        data-testid="button-clear-dates"
                      >
                        Clear
                      </Button>
                    </div>
                    <Calendar
                      initialFocus
                      mode="range"
                      defaultMonth={dateRange?.from}
                      selected={dateRange}
                      onSelect={setDateRange}
                      numberOfMonths={2}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="flex-1 min-w-64">
                <label className="text-sm font-medium mb-2 block">Search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by job name or ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                    data-testid="input-search"
                  />
                </div>
              </div>

              <Button onClick={handleExportCSV} variant="outline" data-testid="button-export-csv">
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </div>
          </CardContent>
        </Card>

        <Tabs
          value={activeTab || defaultTab}
          onValueChange={setActiveTab}
          className="space-y-4"
        >
          <TabsList data-testid="tabs-payment-type">
            {availableTabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} data-testid={`tab-${tab.value}`}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {availableTabs.map((tab) => (
            <TabsContent key={tab.value} value={tab.value}>
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <CardTitle>{tab.label} Transactions</CardTitle>
                    <div className="flex gap-4 text-sm">
                      <span>
                        Total: <strong className="text-primary">{formatCurrency(totals.amount)}</strong>
                      </span>
                      {isAdmin && (
                        <>
                          <span>
                            Fees: <strong className="text-muted-foreground">{formatCurrency(totals.processingFee)}</strong>
                          </span>
                          <span>
                            Net: <strong className="text-green-600">{formatCurrency(totals.netAmount)}</strong>
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <RefreshCw className="h-6 w-6 animate-spin" />
                      <span className="ml-2">Loading billing history...</span>
                    </div>
                  ) : filteredRecords.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No billing records found
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Description</TableHead>
                          {isAdmin && <TableHead>Client</TableHead>}
                          <TableHead className="text-right">Amount</TableHead>
                          {isAdmin && <TableHead className="text-right">Processing Fee</TableHead>}
                          {isAdmin && <TableHead className="text-right">Net Amount</TableHead>}
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredRecords.map((record) => (
                          <TableRow
                            key={record.id}
                            className={record.type === "refund" ? "bg-red-50 dark:bg-red-950/20" : ""}
                            data-testid={`row-billing-${record.id}`}
                          >
                            <TableCell className="whitespace-nowrap">
                              {format(new Date(record.date), "MMM dd, yyyy")}
                              <br />
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(record.date), "h:mm a")}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span
                                className={`inline-flex items-center gap-1 ${
                                  record.type === "refund" ? "text-red-600" : ""
                                }`}
                              >
                                {record.type === "refund" && <RefreshCw className="h-3 w-3" />}
                                {getRecordTypeLabel(record)}
                              </span>
                            </TableCell>
                            <TableCell>
                              <div className="max-w-xs truncate" title={record.jobTitle}>
                                {record.jobTitle}
                              </div>
                              {record.jobId && (
                                <div className="text-xs text-muted-foreground">
                                  ID: {record.jobId.slice(0, 8)}...
                                </div>
                              )}
                            </TableCell>
                            {isAdmin && (
                              <TableCell>{record.clientName}</TableCell>
                            )}
                            <TableCell
                              className={`text-right font-medium ${
                                record.amount < 0 ? "text-red-600" : ""
                              }`}
                            >
                              {formatCurrency(record.amount)}
                            </TableCell>
                            {isAdmin && (
                              <TableCell className="text-right text-muted-foreground">
                                {formatCurrency(record.processingFee)}
                              </TableCell>
                            )}
                            {isAdmin && (
                              <TableCell
                                className={`text-right font-medium ${
                                  record.netAmount < 0 ? "text-red-600" : "text-green-600"
                                }`}
                              >
                                {formatCurrency(record.netAmount)}
                              </TableCell>
                            )}
                            <TableCell>
                              <span
                                className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                                  record.status === "Paid"
                                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                    : record.status === "Refunded"
                                    ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                                    : "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400"
                                }`}
                              >
                                {record.status}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      </main>
    </div>
  );
}
