import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { format } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Header } from "@/components/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, Search, DollarSign, Package, FileText, Download, Eye, CreditCard, Calendar, Receipt } from "lucide-react";

interface CurrentUser {
  userId: string;
  role: string;
  username: string;
}

interface InvoiceSummary {
  clientId: string;
  clientName: string;
  clientEmail: string | null;
  paymentMethod: string;
  adHocCount: number;
  adHocTotal: number;
  bundleCount: number;
  bundleTotal: number;
  packCount: number;
  packTotal: number;
  grandTotal: number;
  serviceRequestIds: string[];
  bundleRequestIds: string[];
  packSubscriptionIds: string[];
}

interface InvoiceReportData {
  month: number;
  year: number;
  invoices: InvoiceSummary[];
  totals: {
    adHocTotal: number;
    bundleTotal: number;
    packTotal: number;
    grandTotal: number;
  };
}

interface InvoiceDetailItem {
  id: string;
  type: "ad_hoc" | "bundle" | "pack";
  serviceName: string;
  date: string;
  status: string;
  amount: number;
  isRenewal?: boolean;
}

interface InvoiceDetail {
  client: {
    id: string;
    name: string;
    email: string | null;
    paymentMethod: string;
    companyName?: string;
    billingAddress?: any;
  };
  billingPeriod: {
    month: number;
    year: number;
  };
  items: InvoiceDetailItem[];
  totals: {
    adHocCount: number;
    adHocTotal: number;
    bundleCount: number;
    bundleTotal: number;
    packCount: number;
    packTotal: number;
    grandTotal: number;
  };
}

const paymentMethodLabels: Record<string, string> = {
  pay_as_you_go: "Pay as you Go",
  monthly_payment: "Monthly Payment",
  deduct_from_royalties: "Deduct from Royalties",
};

const paymentMethodColors: Record<string, string> = {
  pay_as_you_go: "bg-green-100 text-green-800",
  monthly_payment: "bg-blue-100 text-blue-800",
  deduct_from_royalties: "bg-purple-100 text-purple-800",
};

const typeLabels: Record<string, string> = {
  ad_hoc: "Ad-hoc Service",
  bundle: "Bundle Service",
  pack: "Monthly Pack",
};

const typeColors: Record<string, string> = {
  ad_hoc: "bg-sky-100 text-sky-800",
  bundle: "bg-amber-100 text-amber-800",
  pack: "bg-violet-100 text-violet-800",
};

function getMonthOptions() {
  const options = [];
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    options.push({
      month: date.getMonth() + 1,
      year: date.getFullYear(),
      label: format(date, "MMMM yyyy"),
    });
  }
  return options;
}

export default function ClientInvoicingReport() {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [paymentMethodFilter, setPaymentMethodFilter] = useState("all");
  const [searchClient, setSearchClient] = useState("");
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceSummary | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  const monthOptions = useMemo(() => getMonthOptions(), []);

  const { data: currentUser } = useQuery<CurrentUser>({
    queryKey: ["/api/default-user"],
  });

  const isAdmin = currentUser?.role === "admin";

  const { data: reportData, isLoading } = useQuery<InvoiceReportData>({
    queryKey: ["/api/reports/client-invoicing", selectedMonth, selectedYear],
    queryFn: async () => {
      const res = await fetch(`/api/reports/client-invoicing?month=${selectedMonth}&year=${selectedYear}`);
      if (!res.ok) throw new Error("Failed to fetch report");
      return res.json();
    },
    enabled: isAdmin,
  });

  const { data: invoiceDetail, isLoading: loadingDetail } = useQuery<InvoiceDetail>({
    queryKey: ["/api/reports/client-invoicing", selectedInvoice?.clientId, "detail", selectedMonth, selectedYear],
    queryFn: async () => {
      const res = await fetch(`/api/reports/client-invoicing/${selectedInvoice?.clientId}/detail?month=${selectedMonth}&year=${selectedYear}`);
      if (!res.ok) throw new Error("Failed to fetch invoice detail");
      return res.json();
    },
    enabled: !!selectedInvoice && detailModalOpen,
  });

  const filteredInvoices = useMemo(() => {
    if (!reportData?.invoices) return [];
    
    return reportData.invoices.filter(invoice => {
      if (paymentMethodFilter !== "all" && invoice.paymentMethod !== paymentMethodFilter) {
        return false;
      }
      if (searchClient && !invoice.clientName.toLowerCase().includes(searchClient.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [reportData?.invoices, paymentMethodFilter, searchClient]);

  const filteredTotals = useMemo(() => {
    return {
      adHocTotal: filteredInvoices.reduce((sum, inv) => sum + inv.adHocTotal, 0),
      bundleTotal: filteredInvoices.reduce((sum, inv) => sum + inv.bundleTotal, 0),
      packTotal: filteredInvoices.reduce((sum, inv) => sum + inv.packTotal, 0),
      grandTotal: filteredInvoices.reduce((sum, inv) => sum + inv.grandTotal, 0),
    };
  }, [filteredInvoices]);

  const handleViewDetails = (invoice: InvoiceSummary) => {
    setSelectedInvoice(invoice);
    setDetailModalOpen(true);
  };

  const exportToCSV = () => {
    if (!filteredInvoices.length) return;

    const headers = ["Client Name", "Email", "Payment Method", "Ad-hoc Count", "Ad-hoc Total", "Bundle Count", "Bundle Total", "Pack Count", "Pack Total", "Grand Total"];
    const rows = filteredInvoices.map(inv => [
      inv.clientName,
      inv.clientEmail || "",
      paymentMethodLabels[inv.paymentMethod] || inv.paymentMethod,
      inv.adHocCount.toString(),
      `$${inv.adHocTotal.toFixed(2)}`,
      inv.bundleCount.toString(),
      `$${inv.bundleTotal.toFixed(2)}`,
      inv.packCount.toString(),
      `$${inv.packTotal.toFixed(2)}`,
      `$${inv.grandTotal.toFixed(2)}`,
    ]);

    const csvContent = [headers.join(","), ...rows.map(row => row.map(cell => `"${cell}"`).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `client-invoicing-${selectedYear}-${String(selectedMonth).padStart(2, "0")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const generateInvoicePDF = () => {
    if (!invoiceDetail) return;

    const { client, billingPeriod, items, totals } = invoiceDetail;
    const periodLabel = format(new Date(billingPeriod.year, billingPeriod.month - 1), "MMMM yyyy");
    const invoiceNumber = `INV-${billingPeriod.year}${String(billingPeriod.month).padStart(2, "0")}-${client.id.substring(0, 8).toUpperCase()}`;
    const invoiceDate = format(new Date(), "MMMM d, yyyy");

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFontSize(24);
    doc.setFont("helvetica", "bold");
    doc.text("INVOICE", pageWidth / 2, 25, { align: "center" });

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(`Invoice #: ${invoiceNumber}`, pageWidth - 20, 15, { align: "right" });
    doc.text(`Date: ${invoiceDate}`, pageWidth - 20, 21, { align: "right" });

    doc.setDrawColor(200);
    doc.line(20, 35, pageWidth - 20, 35);

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0);
    doc.text("Bill To:", 20, 45);

    doc.setFont("helvetica", "normal");
    let yPos = 52;
    doc.text(client.companyName || client.name, 20, yPos);
    yPos += 6;
    if (client.email) {
      doc.text(client.email, 20, yPos);
      yPos += 6;
    }
    if (client.billingAddress) {
      const addr = client.billingAddress;
      if (addr.street) { doc.text(addr.street, 20, yPos); yPos += 6; }
      if (addr.city || addr.state || addr.zip) {
        doc.text(`${addr.city || ""} ${addr.state || ""} ${addr.zip || ""}`.trim(), 20, yPos);
        yPos += 6;
      }
    }

    doc.setFont("helvetica", "bold");
    doc.text("Billing Period:", pageWidth - 80, 45);
    doc.setFont("helvetica", "normal");
    doc.text(periodLabel, pageWidth - 80, 52);

    doc.text("Payment Method:", pageWidth - 80, 62);
    doc.text(paymentMethodLabels[client.paymentMethod] || client.paymentMethod, pageWidth - 80, 69);

    const tableData = items.map(item => [
      typeLabels[item.type] || item.type,
      item.serviceName,
      format(new Date(item.date), "MMM d, yyyy"),
      `$${item.amount.toFixed(2)}`
    ]);

    autoTable(doc, {
      startY: Math.max(yPos + 10, 85),
      head: [["Type", "Service/Pack", "Date", "Amount"]],
      body: tableData,
      theme: "striped",
      headStyles: {
        fillColor: [41, 65, 148],
        textColor: 255,
        fontStyle: "bold",
        halign: "left"
      },
      columnStyles: {
        0: { cellWidth: 35 },
        1: { cellWidth: 80 },
        2: { cellWidth: 35 },
        3: { cellWidth: 30, halign: "right" }
      },
      styles: {
        fontSize: 9,
        cellPadding: 4
      },
      alternateRowStyles: {
        fillColor: [245, 245, 250]
      }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 15;

    doc.setDrawColor(200);
    doc.line(pageWidth - 100, finalY, pageWidth - 20, finalY);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    let summaryY = finalY + 8;

    doc.text(`Ad-hoc Services (${totals.adHocCount}):`, pageWidth - 100, summaryY);
    doc.text(`$${totals.adHocTotal.toFixed(2)}`, pageWidth - 20, summaryY, { align: "right" });
    summaryY += 7;

    doc.text(`Bundle Services (${totals.bundleCount}):`, pageWidth - 100, summaryY);
    doc.text(`$${totals.bundleTotal.toFixed(2)}`, pageWidth - 20, summaryY, { align: "right" });
    summaryY += 7;

    doc.text(`Monthly Packs (${totals.packCount}):`, pageWidth - 100, summaryY);
    doc.text(`$${totals.packTotal.toFixed(2)}`, pageWidth - 20, summaryY, { align: "right" });
    summaryY += 10;

    doc.setDrawColor(41, 65, 148);
    doc.setLineWidth(0.5);
    doc.line(pageWidth - 100, summaryY, pageWidth - 20, summaryY);
    summaryY += 8;

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("TOTAL:", pageWidth - 100, summaryY);
    doc.text(`$${totals.grandTotal.toFixed(2)}`, pageWidth - 20, summaryY, { align: "right" });

    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120);
    doc.text("Thank you for your business!", pageWidth / 2, pageHeight - 20, { align: "center" });
    doc.text(`Generated on ${format(new Date(), "MMMM d, yyyy 'at' h:mm a")}`, pageWidth / 2, pageHeight - 14, { align: "center" });

    doc.save(`invoice-${client.name.replace(/\s+/g, "-")}-${billingPeriod.year}-${String(billingPeriod.month).padStart(2, "0")}.pdf`);
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-dark-gray">You don't have permission to view this report.</p>
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
        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <Link href="/reports">
              <Button variant="ghost" size="icon" data-testid="button-back-reports">
                <ChevronLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-dark-blue-night" data-testid="text-report-title">
                Client Invoicing Report <span className="text-sky-blue-accent">({filteredInvoices.length})</span>
              </h1>
              <p className="text-dark-gray text-sm mt-1">
                View client billing summaries and generate invoices
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={exportToCSV}
            disabled={filteredInvoices.length === 0}
            data-testid="button-download-csv"
          >
            <Download className="w-4 h-4 mr-2" />
            Download CSV
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-green-100">
                  <DollarSign className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-dark-gray">Ad-hoc Total</p>
                  <p className="text-xl font-bold text-dark-blue-night" data-testid="text-adhoc-total">
                    ${filteredTotals.adHocTotal.toFixed(2)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-amber-100">
                  <Package className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm text-dark-gray">Bundle Total</p>
                  <p className="text-xl font-bold text-dark-blue-night" data-testid="text-bundle-total">
                    ${filteredTotals.bundleTotal.toFixed(2)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-violet-100">
                  <Receipt className="w-5 h-5 text-violet-600" />
                </div>
                <div>
                  <p className="text-sm text-dark-gray">Pack Total</p>
                  <p className="text-xl font-bold text-dark-blue-night" data-testid="text-pack-total">
                    ${filteredTotals.packTotal.toFixed(2)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-blue-100">
                  <FileText className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-dark-gray">Grand Total</p>
                  <p className="text-xl font-bold text-dark-blue-night" data-testid="text-grand-total">
                    ${filteredTotals.grandTotal.toFixed(2)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-sm">Billing Period</Label>
                <Select
                  value={`${selectedMonth}-${selectedYear}`}
                  onValueChange={(value) => {
                    const [m, y] = value.split("-");
                    setSelectedMonth(parseInt(m));
                    setSelectedYear(parseInt(y));
                  }}
                >
                  <SelectTrigger data-testid="select-billing-period">
                    <SelectValue placeholder="Select month" />
                  </SelectTrigger>
                  <SelectContent>
                    {monthOptions.map((opt) => (
                      <SelectItem key={`${opt.month}-${opt.year}`} value={`${opt.month}-${opt.year}`}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Payment Method</Label>
                <Select value={paymentMethodFilter} onValueChange={setPaymentMethodFilter}>
                  <SelectTrigger data-testid="select-payment-method">
                    <SelectValue placeholder="All Methods" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Methods</SelectItem>
                    <SelectItem value="pay_as_you_go">Pay as you Go</SelectItem>
                    <SelectItem value="monthly_payment">Monthly Payment</SelectItem>
                    <SelectItem value="deduct_from_royalties">Deduct from Royalties</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Search Client</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-gray" />
                  <Input
                    placeholder="Client name..."
                    value={searchClient}
                    onChange={(e) => setSearchClient(e.target.value)}
                    className="pl-9"
                    data-testid="input-search-client"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-4">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : filteredInvoices.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-dark-gray">No invoices found for the selected period.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Payment Method</TableHead>
                    <TableHead className="text-center">Ad-hoc Services</TableHead>
                    <TableHead className="text-center">Bundle Services</TableHead>
                    <TableHead className="text-center">Monthly Packs</TableHead>
                    <TableHead className="text-right">Total Amount</TableHead>
                    <TableHead className="text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvoices.map((invoice) => (
                    <TableRow key={invoice.clientId} data-testid={`row-invoice-${invoice.clientId}`}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{invoice.clientName}</p>
                          {invoice.clientEmail && (
                            <p className="text-xs text-dark-gray">{invoice.clientEmail}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={paymentMethodColors[invoice.paymentMethod] || ""}>
                          {paymentMethodLabels[invoice.paymentMethod] || invoice.paymentMethod}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {invoice.adHocCount > 0 ? (
                          <div>
                            <span className="font-medium">{invoice.adHocCount}</span>
                            <span className="text-dark-gray text-sm ml-1">- ${invoice.adHocTotal.toFixed(2)}</span>
                          </div>
                        ) : (
                          <span className="text-dark-gray">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {invoice.bundleCount > 0 ? (
                          <div>
                            <span className="font-medium">{invoice.bundleCount}</span>
                            <span className="text-dark-gray text-sm ml-1">- ${invoice.bundleTotal.toFixed(2)}</span>
                          </div>
                        ) : (
                          <span className="text-dark-gray">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {invoice.packCount > 0 ? (
                          <div>
                            <span className="font-medium">{invoice.packCount}</span>
                            <span className="text-dark-gray text-sm ml-1">- ${invoice.packTotal.toFixed(2)}</span>
                          </div>
                        ) : (
                          <span className="text-dark-gray">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="font-bold text-dark-blue-night">
                          ${invoice.grandTotal.toFixed(2)}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewDetails(invoice)}
                          data-testid={`button-view-details-${invoice.clientId}`}
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          View Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={detailModalOpen} onOpenChange={setDetailModalOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Invoice Detail
              </DialogTitle>
            </DialogHeader>

            {loadingDetail ? (
              <div className="space-y-4 py-6">
                <Skeleton className="h-8 w-1/3" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-64 w-full" />
              </div>
            ) : invoiceDetail ? (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
                  <div>
                    <p className="text-sm text-dark-gray">Client</p>
                    <p className="font-semibold">{invoiceDetail.client.companyName || invoiceDetail.client.name}</p>
                    {invoiceDetail.client.email && (
                      <p className="text-sm text-dark-gray">{invoiceDetail.client.email}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-sm text-dark-gray">Billing Period</p>
                    <p className="font-semibold">
                      {format(new Date(invoiceDetail.billingPeriod.year, invoiceDetail.billingPeriod.month - 1), "MMMM yyyy")}
                    </p>
                    <Badge variant="outline" className={paymentMethodColors[invoiceDetail.client.paymentMethod] || ""}>
                      {paymentMethodLabels[invoiceDetail.client.paymentMethod] || invoiceDetail.client.paymentMethod}
                    </Badge>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-3">Itemized Charges</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Service / Pack</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoiceDetail.items.map((item) => (
                        <TableRow key={`${item.type}-${item.id}`}>
                          <TableCell>
                            <Badge variant="outline" className={typeColors[item.type] || ""}>
                              {typeLabels[item.type] || item.type}
                              {item.isRenewal && " (Renewal)"}
                            </Badge>
                          </TableCell>
                          <TableCell>{item.serviceName}</TableCell>
                          <TableCell>{format(new Date(item.date), "MMM d, yyyy")}</TableCell>
                          <TableCell className="text-right font-medium">
                            ${item.amount.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="border-t pt-4">
                  <div className="grid grid-cols-4 gap-4 text-sm mb-4">
                    <div>
                      <p className="text-dark-gray">Ad-hoc Services</p>
                      <p className="font-semibold">{invoiceDetail.totals.adHocCount} - ${invoiceDetail.totals.adHocTotal.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-dark-gray">Bundle Services</p>
                      <p className="font-semibold">{invoiceDetail.totals.bundleCount} - ${invoiceDetail.totals.bundleTotal.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-dark-gray">Monthly Packs</p>
                      <p className="font-semibold">{invoiceDetail.totals.packCount} - ${invoiceDetail.totals.packTotal.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-dark-gray">Grand Total</p>
                      <p className="text-xl font-bold text-dark-blue-night">${invoiceDetail.totals.grandTotal.toFixed(2)}</p>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button onClick={generateInvoicePDF} data-testid="button-download-invoice">
                      <Download className="w-4 h-4 mr-2" />
                      Download Invoice
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
