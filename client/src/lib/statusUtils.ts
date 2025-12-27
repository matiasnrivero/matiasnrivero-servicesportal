import { Clock, RefreshCw, CheckCircle2, AlertCircle, XCircle, Building2 } from "lucide-react";

export type DisplayStatus = 
  | "pending"
  | "pending-assignment"
  | "assigned-to-vendor" 
  | "in-progress"
  | "change-request"
  | "delivered"
  | "canceled";

export interface StatusInfo {
  label: string;
  color: string;
  icon: typeof Clock;
}

export const statusConfig: Record<DisplayStatus, StatusInfo> = {
  "pending": { 
    label: "Pending", 
    color: "bg-yellow-100 text-yellow-800 border-yellow-200", 
    icon: Clock 
  },
  "pending-assignment": { 
    label: "Pending Assignment", 
    color: "bg-yellow-100 text-yellow-800 border-yellow-200", 
    icon: Clock 
  },
  "assigned-to-vendor": { 
    label: "Assigned to Vendor", 
    color: "bg-yellow-50 text-yellow-700 border-yellow-100", 
    icon: Building2 
  },
  "in-progress": { 
    label: "In Progress", 
    color: "bg-blue-100 text-blue-800 border-blue-200", 
    icon: RefreshCw 
  },
  "change-request": { 
    label: "Change Request", 
    color: "bg-orange-100 text-orange-800 border-orange-200", 
    icon: AlertCircle 
  },
  "delivered": { 
    label: "Delivered", 
    color: "bg-green-100 text-green-800 border-green-200", 
    icon: CheckCircle2 
  },
  "canceled": { 
    label: "Canceled", 
    color: "bg-gray-100 text-gray-800 border-gray-200", 
    icon: XCircle 
  },
};

export function isInternalViewRole(role: string | undefined): boolean {
  return role === "admin" || role === "internal_designer";
}

export function getDisplayStatus(
  dbStatus: string,
  assigneeId: string | null | undefined,
  vendorAssigneeId: string | null | undefined,
  viewerRole: string | undefined
): DisplayStatus {
  if (dbStatus !== "pending") {
    return dbStatus as DisplayStatus;
  }

  if (!isInternalViewRole(viewerRole)) {
    return "pending";
  }

  if (!assigneeId && !vendorAssigneeId) {
    return "pending-assignment";
  }
  
  if (!assigneeId && vendorAssigneeId) {
    return "assigned-to-vendor";
  }

  return "pending";
}

export function getStatusInfo(displayStatus: DisplayStatus): StatusInfo {
  return statusConfig[displayStatus] || statusConfig["pending"];
}

export function getBoardColumns(viewerRole: string | undefined): DisplayStatus[] {
  if (isInternalViewRole(viewerRole)) {
    return ["pending-assignment", "assigned-to-vendor", "in-progress", "change-request", "delivered"];
  }
  return ["pending", "in-progress", "change-request", "delivered"];
}
