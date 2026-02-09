import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Header } from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, DollarSign, Receipt, FileText, TrendingUp, Users, Package, RefreshCw, Timer } from "lucide-react";

interface CurrentUser {
  userId: string;
  role: string;
  username: string;
}

interface ReportCard {
  id: string;
  title: string;
  description: string;
  icon: typeof BarChart3;
  path: string;
  roles: string[];
}

const reportCards: ReportCard[] = [
  {
    id: "my-invoices",
    title: "My Invoices",
    description: "View your monthly billing statements and download invoices",
    icon: Receipt,
    path: "/reports/my-invoices",
    roles: ["client"],
  },
  {
    id: "client-invoicing",
    title: "Client Invoicing",
    description: "View client billing summaries and generate invoices by month",
    icon: FileText,
    path: "/reports/client-invoicing",
    roles: ["admin"],
  },
  {
    id: "services-profit",
    title: "Services Profit",
    description: "View retail prices, vendor costs, and profit margins for all service requests",
    icon: DollarSign,
    path: "/reports/services-profit",
    roles: ["admin"],
  },
  {
    id: "pack-profit",
    title: "Pack Profit",
    description: "Analyze pack subscription revenue, vendor costs, and profit margins",
    icon: Package,
    path: "/reports/pack-profit",
    roles: ["admin"],
  },
  {
    id: "royalties-deduction",
    title: "Deduct from Royalties",
    description: "Track and manage royalty deductions for services and packs",
    icon: TrendingUp,
    path: "/reports/royalties-deduction",
    roles: ["admin"],
  },
  {
    id: "refunds",
    title: "Refund Management",
    description: "Issue and manage refunds for ad-hoc jobs and bundles",
    icon: RefreshCw,
    path: "/reports/refunds",
    roles: ["admin"],
  },
  {
    id: "vendor-payments",
    title: "Vendor Payments",
    description: "Manage vendor payment periods and mark jobs as paid",
    icon: Receipt,
    path: "/reports/vendor-payments",
    roles: ["admin", "vendor"],
  },
  {
    id: "stripe-billing",
    title: "Stripe Billing History",
    description: "View billing history and payment details from Stripe",
    icon: Receipt,
    path: "/reports/stripe-billing",
    roles: ["admin", "client"],
  },
  {
    id: "services-consumption",
    title: "Services Consumption",
    description: "Track your service usage for Tri-POD Royalties deductions",
    icon: TrendingUp,
    path: "/reports/services-consumption",
    roles: ["client"],
  },
  {
    id: "vendor-sla",
    title: "Vendor SLA Performance",
    description: "Track job delivery times vs SLA targets by vendor and service type",
    icon: Timer,
    path: "/reports/vendor-sla",
    roles: ["admin"],
  },
  {
    id: "vendor-designer-workload",
    title: "Vendor Designer Workload",
    description: "View designer workload and job assignments",
    icon: FileText,
    path: "/reports/vendor-designer-workload",
    roles: ["vendor"],
  },
];

export default function Reports() {
  const [, navigate] = useLocation();

  const { data: currentUser } = useQuery<CurrentUser>({
    queryKey: ["/api/default-user"],
  });

  const userRole = currentUser?.role || "";

  const visibleReports = reportCards.filter(report => 
    report.roles.includes(userRole)
  );

  const groupedReports = {
    admin: visibleReports.filter(r => r.roles.includes("admin") && userRole === "admin"),
    client: visibleReports.filter(r => r.roles.includes("client") && userRole === "client"),
    vendor: visibleReports.filter(r => r.roles.includes("vendor") && userRole === "vendor"),
  };

  const hasReports = visibleReports.length > 0;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-dark-blue-night" data-testid="text-reports-title">
            Reports
          </h1>
          <p className="text-dark-gray mt-1">
            Access and analyze your business data
          </p>
        </div>

        {!hasReports && (
          <Card>
            <CardContent className="py-12 text-center">
              <BarChart3 className="w-12 h-12 mx-auto text-dark-gray mb-4" />
              <p className="text-dark-gray">
                No reports available for your role.
              </p>
            </CardContent>
          </Card>
        )}

        {userRole === "admin" && groupedReports.admin.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-dark-blue-night mb-4 flex items-center gap-2">
              <Users className="w-5 h-5" />
              Admin Reports
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {groupedReports.admin.map((report) => {
                const Icon = report.icon;
                return (
                  <Card
                    key={report.id}
                    className="cursor-pointer hover-elevate transition-all"
                    onClick={() => navigate(report.path)}
                    data-testid={`card-report-${report.id}`}
                  >
                    <CardHeader className="flex flex-row items-center gap-4 pb-2">
                      <div className="p-2 rounded-md bg-sky-blue-accent/10">
                        <Icon className="w-6 h-6 text-sky-blue-accent" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{report.title}</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <CardDescription>{report.description}</CardDescription>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {userRole === "client" && groupedReports.client.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-dark-blue-night mb-4 flex items-center gap-2">
              <Receipt className="w-5 h-5" />
              Billing & Usage Reports
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {groupedReports.client.map((report) => {
                const Icon = report.icon;
                return (
                  <Card
                    key={report.id}
                    className="cursor-pointer hover-elevate transition-all"
                    onClick={() => navigate(report.path)}
                    data-testid={`card-report-${report.id}`}
                  >
                    <CardHeader className="flex flex-row items-center gap-4 pb-2">
                      <div className="p-2 rounded-md bg-sky-blue-accent/10">
                        <Icon className="w-6 h-6 text-sky-blue-accent" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{report.title}</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <CardDescription>{report.description}</CardDescription>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {userRole === "vendor" && groupedReports.vendor.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-dark-blue-night mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Vendor Reports
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {groupedReports.vendor.map((report) => {
                const Icon = report.icon;
                return (
                  <Card
                    key={report.id}
                    className="cursor-pointer hover-elevate transition-all"
                    onClick={() => navigate(report.path)}
                    data-testid={`card-report-${report.id}`}
                  >
                    <CardHeader className="flex flex-row items-center gap-4 pb-2">
                      <div className="p-2 rounded-md bg-sky-blue-accent/10">
                        <Icon className="w-6 h-6 text-sky-blue-accent" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{report.title}</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <CardDescription>{report.description}</CardDescription>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
