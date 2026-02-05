import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { format, subMonths } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import tripodLogoPath from "@/assets/images/tripod-logo.png";
import { Header } from "@/components/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, Download, Calendar, Receipt, DollarSign, Package, FileText } from "lucide-react";

interface CurrentUser {
  userId: string;
  role: string;
  username: string;
}

interface InvoiceItem {
  id: string;
  type: "ad_hoc" | "bundle" | "pack";
  serviceName: string;
  date: string;
  status: string;
  amount: number;
  isRenewal?: boolean;
}

interface InvoiceData {
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
  items: InvoiceItem[];
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

const typeLabels: Record<string, string> = {
  ad_hoc: "Ad-hoc Service",
  bundle: "Bundle Service",
  pack: "Monthly Pack",
};

const typeBadgeColors: Record<string, string> = {
  ad_hoc: "bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-700",
  bundle: "bg-rose-100 dark:bg-rose-900/30 text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-700",
  pack: "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 border-green-200 dark:border-green-700",
};

export default function ClientInvoiceView() {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedType, setSelectedType] = useState<string>("all");

  const { data: currentUser, isLoading: userLoading } = useQuery<CurrentUser>({
    queryKey: ["/api/default-user"],
  });

  const isClient = currentUser?.role === "client";

  const { data: invoiceData, isLoading: invoiceLoading } = useQuery<InvoiceData>({
    queryKey: [`/api/reports/my-invoice?month=${selectedMonth}&year=${selectedYear}`],
    enabled: isClient,
  });

  const monthOptions = useMemo(() => {
    const options = [];
    for (let i = 0; i < 24; i++) {
      const date = subMonths(now, i);
      options.push({
        value: `${date.getFullYear()}-${date.getMonth() + 1}`,
        label: format(date, "MMMM yyyy"),
        month: date.getMonth() + 1,
        year: date.getFullYear(),
      });
    }
    return options;
  }, []);

  const handleMonthChange = (value: string) => {
    const [year, month] = value.split("-").map(Number);
    setSelectedYear(year);
    setSelectedMonth(month);
  };

  // Filter items by selected type
  const filteredItems = useMemo(() => {
    if (!invoiceData) return [];
    if (selectedType === "all") return invoiceData.items;
    return invoiceData.items.filter((item) => item.type === selectedType);
  }, [invoiceData, selectedType]);

  // Recalculate totals based on filtered items
  const filteredTotals = useMemo(() => {
    if (!invoiceData) return null;
    if (selectedType === "all") return invoiceData.totals;
    
    const adHocItems = filteredItems.filter((item) => item.type === "ad_hoc");
    const bundleItems = filteredItems.filter((item) => item.type === "bundle");
    const packItems = filteredItems.filter((item) => item.type === "pack");
    
    return {
      adHocCount: adHocItems.length,
      adHocTotal: adHocItems.reduce((sum, item) => sum + item.amount, 0),
      bundleCount: bundleItems.length,
      bundleTotal: bundleItems.reduce((sum, item) => sum + item.amount, 0),
      packCount: packItems.length,
      packTotal: packItems.reduce((sum, item) => sum + item.amount, 0),
      grandTotal: filteredItems.reduce((sum, item) => sum + item.amount, 0),
    };
  }, [invoiceData, filteredItems, selectedType]);

  const generateInvoicePDF = async () => {
    if (!invoiceData) return;

    const { client, billingPeriod, items, totals } = invoiceData;
    const periodLabel = format(new Date(billingPeriod.year, billingPeriod.month - 1), "MMMM yyyy");
    const invoiceNumber = `INV-${billingPeriod.year}${String(billingPeriod.month).padStart(2, "0")}-${client.id.substring(0, 8).toUpperCase()}`;
    const invoiceDate = format(new Date(), "MMMM d, yyyy");

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    const loadImage = (src: string): Promise<{ data: string; width: number; height: number }> => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(img, 0, 0);
          resolve({ data: canvas.toDataURL("image/png"), width: img.width, height: img.height });
        };
        img.onerror = reject;
        img.src = src;
      });
    };

    try {
      const logoInfo = await loadImage(tripodLogoPath);
      const maxWidth = 45;
      const aspectRatio = logoInfo.width / logoInfo.height;
      const logoWidth = maxWidth;
      const logoHeight = maxWidth / aspectRatio;
      doc.addImage(logoInfo.data, "PNG", 20, 12, logoWidth, logoHeight);
    } catch (e) {
      console.error("Failed to load logo:", e);
    }

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
      },
      margin: { bottom: 60 }
    });

    let finalY = (doc as any).lastAutoTable.finalY + 15;
    const summaryHeight = 55;
    const footerSpace = 35;

    if (finalY + summaryHeight + footerSpace > pageHeight) {
      doc.addPage();
      finalY = 20;
    }

    doc.setDrawColor(200);
    doc.line(pageWidth - 100, finalY, pageWidth - 20, finalY);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0);
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

    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(120);
      doc.text("Thank you for your business!", pageWidth / 2, pageHeight - 20, { align: "center" });
      doc.text(`Generated on ${format(new Date(), "MMMM d, yyyy 'at' h:mm a")}`, pageWidth / 2, pageHeight - 14, { align: "center" });
      if (totalPages > 1) {
        doc.text(`Page ${i} of ${totalPages}`, pageWidth / 2, pageHeight - 8, { align: "center" });
      }
    }

    doc.save(`invoice-${billingPeriod.year}-${String(billingPeriod.month).padStart(2, "0")}.pdf`);
  };

  if (userLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <Skeleton className="h-8 w-64 mb-6" />
          <Skeleton className="h-96 w-full" />
        </main>
      </div>
    );
  }

  if (!isClient) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">You don't have permission to view this page.</p>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  const periodLabel = format(new Date(selectedYear, selectedMonth - 1), "MMMM yyyy");

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/reports">
            <Button variant="ghost" size="icon" data-testid="button-back-reports">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground" data-testid="text-page-title">My Invoices</h1>
            <p className="text-muted-foreground" data-testid="text-page-description">View your monthly billing statements and download invoices</p>
          </div>
        </div>

        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Billing Period:</span>
                </div>
                <Select
                  value={`${selectedYear}-${selectedMonth}`}
                  onValueChange={handleMonthChange}
                >
                  <SelectTrigger className="w-48" data-testid="select-month">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {monthOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value} data-testid={`select-month-${option.value}`}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Type:</span>
                  <Select value={selectedType} onValueChange={setSelectedType}>
                    <SelectTrigger className="w-40" data-testid="select-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" data-testid="select-type-all">All Types</SelectItem>
                      <SelectItem value="ad_hoc" data-testid="select-type-adhoc">Ad-hoc Service</SelectItem>
                      <SelectItem value="bundle" data-testid="select-type-bundle">Bundle Service</SelectItem>
                      <SelectItem value="pack" data-testid="select-type-pack">Monthly Pack</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button onClick={generateInvoicePDF} disabled={!invoiceData || invoiceData.items.length === 0} data-testid="button-download-invoice">
                <Download className="w-4 h-4 mr-2" />
                Download Invoice
              </Button>
            </div>
          </CardContent>
        </Card>

        {invoiceLoading ? (
          <Card>
            <CardContent className="py-8">
              <Skeleton className="h-32 w-full mb-4" />
              <Skeleton className="h-64 w-full" />
            </CardContent>
          </Card>
        ) : invoiceData ? (
          <Card>
            <CardContent className="pt-6">
              <div className="bg-muted/50 rounded-lg p-4 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Client</p>
                    <p className="font-semibold" data-testid="text-client-name">{invoiceData.client.companyName || invoiceData.client.name}</p>
                    <p className="text-sm text-muted-foreground" data-testid="text-client-email">{invoiceData.client.email}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Billing Period</p>
                    <p className="font-semibold" data-testid="text-billing-period">{periodLabel}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Payment Method</p>
                    <Badge variant="secondary" className="mt-1" data-testid="badge-payment-method">
                      {paymentMethodLabels[invoiceData.client.paymentMethod] || invoiceData.client.paymentMethod}
                    </Badge>
                  </div>
                </div>
              </div>

              <h3 className="text-lg font-semibold mb-4">Itemized Charges</h3>

              {filteredItems.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground" data-testid="status-empty">
                  <Receipt className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p data-testid="text-empty-message">
                    {selectedType === "all" ? "No charges for this billing period" : `No ${typeLabels[selectedType as keyof typeof typeLabels] || selectedType} charges for this billing period`}
                  </p>
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden mb-6">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="w-36">Type</TableHead>
                        <TableHead>Service / Pack</TableHead>
                        <TableHead className="w-32">Date</TableHead>
                        <TableHead className="w-28 text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredItems.map((item) => (
                        <TableRow key={`${item.type}-${item.id}`} data-testid={`row-item-${item.id}`}>
                          <TableCell>
                            <Badge 
                              variant="outline" 
                              className={`whitespace-nowrap ${typeBadgeColors[item.type]}`}
                              data-testid={`badge-type-${item.id}`}
                            >
                              {typeLabels[item.type]}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium" data-testid={`text-service-${item.id}`}>{item.serviceName}</TableCell>
                          <TableCell data-testid={`text-date-${item.id}`}>{format(new Date(item.date), "MMM d, yyyy")}</TableCell>
                          <TableCell className="text-right font-medium" data-testid={`text-amount-${item.id}`}>${item.amount.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {filteredTotals && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t">
                  <div className="flex items-center gap-3" data-testid="summary-adhoc">
                    <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                      <FileText className="w-5 h-5 text-amber-700 dark:text-amber-300" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Ad-hoc Services</p>
                      <p className="font-semibold" data-testid="text-adhoc-total">{filteredTotals.adHocCount} - ${filteredTotals.adHocTotal.toFixed(2)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3" data-testid="summary-bundle">
                    <div className="p-2 bg-rose-100 dark:bg-rose-900/30 rounded-lg">
                      <Package className="w-5 h-5 text-rose-700 dark:text-rose-300" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Bundle Services</p>
                      <p className="font-semibold" data-testid="text-bundle-total">{filteredTotals.bundleCount} - ${filteredTotals.bundleTotal.toFixed(2)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3" data-testid="summary-pack">
                    <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                      <Receipt className="w-5 h-5 text-green-700 dark:text-green-300" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Monthly Packs</p>
                      <p className="font-semibold" data-testid="text-pack-total">{filteredTotals.packCount} - ${filteredTotals.packTotal.toFixed(2)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3" data-testid="summary-grand-total">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <DollarSign className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Grand Total</p>
                      <p className="text-xl font-bold" data-testid="text-grand-total">${filteredTotals.grandTotal.toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ) : null}
      </main>
    </div>
  );
}
