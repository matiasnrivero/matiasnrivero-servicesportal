import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import type { User } from "@shared/schema";

async function getDefaultUser(): Promise<User | null> {
  const res = await fetch("/api/default-user");
  if (!res.ok) return null;
  return res.json();
}

export function Header() {
  const [location] = useLocation();
  
  const { data: currentUser } = useQuery<User | null>({
    queryKey: ["/api/default-user"],
    queryFn: getDefaultUser,
  });

  const isAdmin = currentUser?.role === "admin";
  const isInternalDesigner = currentUser?.role === "internal_designer";
  const isVendor = currentUser?.role === "vendor";
  const isVendorDesigner = currentUser?.role === "vendor_designer";
  const canManageUsers = isAdmin || isInternalDesigner || isVendor;
  const canViewVendorProfile = isVendor;

  return (
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
          <Link href="/service-requests/new">
            <Button
              variant={location === "/service-requests/new" ? "default" : "ghost"}
              className={location === "/service-requests/new" ? "bg-sky-blue-accent hover:bg-sky-blue-accent/90" : ""}
              data-testid="nav-new-request"
            >
              New Request
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
        </nav>
      </div>
      {currentUser && (
        <div className="flex items-center gap-2 text-sm text-dark-gray">
          <span>{currentUser.username}</span>
          <span className="text-xs px-2 py-1 bg-blue-lavender/30 rounded-md">
            {currentUser.role.replace("_", " ")}
          </span>
        </div>
      )}
    </header>
  );
}
