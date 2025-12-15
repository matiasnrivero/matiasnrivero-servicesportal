import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { User } from "@shared/schema";

type UserSession = {
  userId: string;
  role: string;
  username: string;
  impersonating?: boolean;
  impersonatorId?: string;
};

async function getDefaultUser(): Promise<UserSession | null> {
  const res = await fetch("/api/default-user");
  if (!res.ok) return null;
  return res.json();
}

export function Header() {
  const [location] = useLocation();
  
  const { data: currentUser } = useQuery<UserSession | null>({
    queryKey: ["/api/default-user"],
    queryFn: getDefaultUser,
  });

  const switchRoleMutation = useMutation({
    mutationFn: async (role: string) => {
      const res = await fetch("/api/switch-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) throw new Error("Failed to switch role");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/default-user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/service-requests"] });
    },
  });

  const exitImpersonationMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/impersonation/exit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("Failed to exit impersonation");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/default-user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/service-requests"] });
    },
  });

  const isAdmin = currentUser?.role === "admin";
  const isInternalDesigner = currentUser?.role === "internal_designer";
  const isVendor = currentUser?.role === "vendor";
  const isVendorDesigner = currentUser?.role === "vendor_designer";
  const canManageUsers = isAdmin || isInternalDesigner || isVendor;
  const canViewVendorProfile = isVendor;
  const canViewVendorsList = isAdmin;

  return (
    <>
      {currentUser?.impersonating && (
        <div className="w-full bg-amber-500 text-white px-4 py-2 flex items-center justify-center gap-4">
          <span className="text-sm font-medium">
            You are viewing as: <strong>{currentUser.username}</strong> ({currentUser.role})
          </span>
          <Button
            variant="outline"
            size="sm"
            className="bg-white text-amber-700 hover:bg-amber-50 border-amber-300"
            onClick={() => exitImpersonationMutation.mutate()}
            disabled={exitImpersonationMutation.isPending}
            data-testid="button-exit-impersonation"
          >
            {exitImpersonationMutation.isPending ? "Exiting..." : "Exit Impersonation"}
          </Button>
        </div>
      )}
    <header className="flex w-full items-center justify-between gap-12 px-8 py-4 bg-white shadow-shadow-top-bar">
      <div className="flex items-center gap-8">
        <Link href="/">
          <h1 className="font-title-semibold text-dark-blue-night text-xl cursor-pointer">
            Artwork Services
          </h1>
        </Link>
        <nav className="flex items-center gap-4">
          <Link href="/">
            <Button
              variant={location === "/" ? "default" : "ghost"}
              className={location === "/" ? "bg-sky-blue-accent hover:bg-sky-blue-accent/90" : ""}
              data-testid="nav-services"
            >
              Services
            </Button>
          </Link>
          <Link href="/service-requests">
            <Button
              variant={location.startsWith("/service-requests") && location !== "/service-requests/new" ? "default" : "ghost"}
              className={location.startsWith("/service-requests") && location !== "/service-requests/new" ? "bg-sky-blue-accent hover:bg-sky-blue-accent/90" : ""}
              data-testid="nav-requests"
            >
              My Requests
            </Button>
          </Link>
          {canManageUsers && (
            <Link href="/users">
              <Button
                variant={location === "/users" ? "default" : "ghost"}
                className={location === "/users" ? "bg-sky-blue-accent hover:bg-sky-blue-accent/90" : ""}
                data-testid="nav-users"
              >
                Users
              </Button>
            </Link>
          )}
          {canViewVendorProfile && (
            <Link href="/vendor-profile">
              <Button
                variant={location === "/vendor-profile" ? "default" : "ghost"}
                className={location === "/vendor-profile" ? "bg-sky-blue-accent hover:bg-sky-blue-accent/90" : ""}
                data-testid="nav-vendor-profile"
              >
                Vendor Profile
              </Button>
            </Link>
          )}
          {canViewVendorsList && (
            <Link href="/vendors">
              <Button
                variant={location.startsWith("/vendors") ? "default" : "ghost"}
                className={location.startsWith("/vendors") ? "bg-sky-blue-accent hover:bg-sky-blue-accent/90" : ""}
                data-testid="nav-vendors"
              >
                Vendors
              </Button>
            </Link>
          )}
          {isAdmin && (
            <Link href="/settings">
              <Button
                variant={location.startsWith("/settings") ? "default" : "ghost"}
                className={location.startsWith("/settings") ? "bg-sky-blue-accent hover:bg-sky-blue-accent/90" : ""}
                data-testid="nav-settings"
              >
                Settings
              </Button>
            </Link>
          )}
        </nav>
      </div>
      {currentUser && !currentUser.impersonating && (
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-dark-gray">
            <span>User Role</span>
          </div>
          <Select
            value={currentUser.role}
            onValueChange={(role) => switchRoleMutation.mutate(role)}
          >
            <SelectTrigger className="w-40" data-testid="select-role-switcher">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="internal_designer">Internal Designer</SelectItem>
              <SelectItem value="vendor">Vendor</SelectItem>
              <SelectItem value="vendor_designer">Vendor Designer</SelectItem>
              <SelectItem value="client">Client</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </header>
    </>
  );
}
