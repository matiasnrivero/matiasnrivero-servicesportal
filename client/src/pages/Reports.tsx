import { useState, useCallback, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Header } from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, DollarSign, Receipt, FileText, TrendingUp, Users, Package, RefreshCw, Timer, GripVertical } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { apiRequest, queryClient } from "@/lib/queryClient";

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

function SortableReportCard({ report, onNavigate }: { report: ReportCard; onNavigate: (path: string) => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: report.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  const Icon = report.icon;

  return (
    <div ref={setNodeRef} style={style} data-testid={`card-report-${report.id}`}>
      <Card className="cursor-pointer hover-elevate transition-all h-full">
        <CardHeader className="flex flex-row items-center gap-3 pb-2">
          <div
            className="cursor-grab active:cursor-grabbing p-1 rounded-md text-muted-foreground"
            {...attributes}
            {...listeners}
            data-testid={`drag-handle-${report.id}`}
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="w-4 h-4" />
          </div>
          <div
            className="flex items-center gap-3 flex-1"
            onClick={() => onNavigate(report.path)}
          >
            <div className="p-2 rounded-md bg-sky-blue-accent/10">
              <Icon className="w-6 h-6 text-sky-blue-accent" />
            </div>
            <div>
              <CardTitle className="text-base">{report.title}</CardTitle>
            </div>
          </div>
        </CardHeader>
        <CardContent onClick={() => onNavigate(report.path)}>
          <CardDescription>{report.description}</CardDescription>
        </CardContent>
      </Card>
    </div>
  );
}

function applyOrder(reports: ReportCard[], savedOrder: string[] | null | undefined): ReportCard[] {
  if (!savedOrder || !Array.isArray(savedOrder) || savedOrder.length === 0) return reports;
  const reportMap = new Map(reports.map((r) => [r.id, r]));
  const ordered: ReportCard[] = [];
  for (const id of savedOrder) {
    const report = reportMap.get(id);
    if (report) {
      ordered.push(report);
      reportMap.delete(id);
    }
  }
  reportMap.forEach((report) => ordered.push(report));
  return ordered;
}

function SortableReportGrid({
  reports,
  onReorder,
  onNavigate,
}: {
  reports: ReportCard[];
  onReorder: (newOrder: string[]) => void;
  onNavigate: (path: string) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (over && active.id !== over.id) {
        const oldIndex = reports.findIndex((r) => r.id === active.id);
        const newIndex = reports.findIndex((r) => r.id === over.id);
        const newReports = arrayMove(reports, oldIndex, newIndex);
        onReorder(newReports.map((r) => r.id));
      }
    },
    [reports, onReorder]
  );

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={reports.map((r) => r.id)} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {reports.map((report) => (
            <SortableReportCard key={report.id} report={report} onNavigate={onNavigate} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

export default function Reports() {
  const [, navigate] = useLocation();

  const { data: currentUser } = useQuery<CurrentUser>({
    queryKey: ["/api/default-user"],
  });

  const userRole = currentUser?.role || "";
  const userId = currentUser?.userId || "";

  const { data: savedOrder } = useQuery<{ value: string[] | null }>({
    queryKey: ["/api/user-preferences", userId, "report-order"],
    queryFn: async () => {
      const res = await fetch("/api/user-preferences/report-order");
      if (!res.ok) throw new Error("Failed to fetch preferences");
      return res.json();
    },
    enabled: !!userId,
  });

  const saveOrderMutation = useMutation({
    mutationFn: async (order: string[]) => {
      await apiRequest("PUT", "/api/user-preferences/report-order", { value: order });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user-preferences", userId, "report-order"] });
    },
  });

  const visibleReports = useMemo(
    () => reportCards.filter((report) => report.roles.includes(userRole)),
    [userRole]
  );

  const roleGroupReports = useMemo(() => {
    if (userRole === "admin") return visibleReports.filter((r) => r.roles.includes("admin"));
    if (userRole === "client") return visibleReports.filter((r) => r.roles.includes("client"));
    if (userRole === "vendor") return visibleReports.filter((r) => r.roles.includes("vendor"));
    return [];
  }, [userRole, visibleReports]);

  const [localOrder, setLocalOrder] = useState<string[] | null>(null);

  useEffect(() => {
    setLocalOrder(null);
  }, [userId]);

  const displayReports = useMemo(() => {
    if (localOrder) {
      return applyOrder(roleGroupReports, localOrder);
    }
    return applyOrder(roleGroupReports, savedOrder?.value);
  }, [roleGroupReports, localOrder, savedOrder]);

  const handleReorder = useCallback(
    (newOrder: string[]) => {
      setLocalOrder(newOrder);
      saveOrderMutation.mutate(newOrder);
    },
    [saveOrderMutation]
  );

  const hasReports = visibleReports.length > 0;

  const sectionLabel =
    userRole === "admin" ? "Admin Reports" :
    userRole === "client" ? "Billing & Usage Reports" :
    userRole === "vendor" ? "Vendor Reports" : "";

  const SectionIcon =
    userRole === "admin" ? Users :
    userRole === "client" ? Receipt :
    FileText;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-dark-blue-night" data-testid="text-reports-title">
            Reports <span className="text-sky-blue-accent">Hub</span>
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

        {displayReports.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-dark-blue-night mb-4 flex items-center gap-2">
              <SectionIcon className="w-5 h-5" />
              {sectionLabel}
            </h2>
            <SortableReportGrid
              reports={displayReports}
              onReorder={handleReorder}
              onNavigate={navigate}
            />
          </div>
        )}
      </main>
    </div>
  );
}
