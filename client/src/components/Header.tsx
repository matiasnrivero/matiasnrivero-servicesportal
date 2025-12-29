import { Link, useLocation, useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Search, Loader2, FileText, Package } from "lucide-react";
import type { User } from "@shared/schema";
import { useState, useEffect, useRef } from "react";

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

type SearchResult = {
  id: string;
  jobId: string;
  type: "adhoc" | "bundle";
  title: string;
};

export function Header() {
  const [location, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const { data: currentUser } = useQuery<UserSession | null>({
    queryKey: ["/api/default-user"],
    queryFn: getDefaultUser,
  });

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    
    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search/jobs?q=${encodeURIComponent(searchQuery.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.results || []);
        }
      } catch (error) {
        console.error("Search error:", error);
      } finally {
        setIsSearching(false);
      }
    }, 300);
    
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery]);

  const handleSelectResult = (result: SearchResult) => {
    setSearchOpen(false);
    setSearchQuery("");
    setSearchResults([]);
    
    if (result.type === "adhoc") {
      setLocation(`/jobs/${result.id}`);
    } else {
      setLocation(`/bundle-jobs/${result.id}`);
    }
  };

  const switchRoleMutation = useMutation({
    mutationFn: async (role: string) => {
      const res = await fetch("/api/switch-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) throw new Error("Failed to switch role");
      return res.json() as Promise<{ role: string }>;
    },
    onSuccess: async (data) => {
      // Only invalidate role-sensitive queries instead of all queries for better performance
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/default-user"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/service-requests"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/bundle-requests"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/assignable-users"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/users"] }),
      ]);
      // Navigate to vendor profile when switching to vendor role
      if (data.role === "vendor") {
        setLocation("/vendor-profile");
      }
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
    onSuccess: async () => {
      // Only invalidate role-sensitive queries for better performance
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/default-user"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/service-requests"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/bundle-requests"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/assignable-users"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/users"] }),
      ]);
    },
  });

  const isAdmin = currentUser?.role === "admin";
  const isInternalDesigner = currentUser?.role === "internal_designer";
  const isVendor = currentUser?.role === "vendor";
  const isVendorDesigner = currentUser?.role === "vendor_designer";
  const isClient = currentUser?.role === "client";
  const canManageUsers = isAdmin || isInternalDesigner;
  const canViewVendorProfile = isVendor;
  const canViewVendorsList = isAdmin;
  // Vendor and Vendor Designer should not see Services menu (they can't create new requests)
  const canViewServices = !isVendor && !isVendorDesigner;
  // Reports visible to Admin, Client, Vendor (not Internal Designer or Vendor Designer for now)
  const canViewReports = isAdmin || isClient || isVendor;

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
          <h1 className="font-title-semibold text-dark-blue-night text-xl cursor-pointer whitespace-nowrap">
            Services Portal
          </h1>
        </Link>
        <nav className="flex items-center gap-4">
          {canViewServices && (
            <Link href="/">
              <Button
                variant={location === "/" ? "default" : "ghost"}
                className={location === "/" ? "bg-sky-blue-accent hover:bg-sky-blue-accent/90" : ""}
                data-testid="nav-services"
              >
                Services
              </Button>
            </Link>
          )}
          <Link href="/service-requests">
            <Button
              variant={location.startsWith("/service-requests") && location !== "/service-requests/new" ? "default" : "ghost"}
              className={location.startsWith("/service-requests") && location !== "/service-requests/new" ? "bg-sky-blue-accent hover:bg-sky-blue-accent/90" : ""}
              data-testid="nav-requests"
            >
              {currentUser?.role === "client" ? "My Requests" : "Requests"}
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
          {isClient && (
            <Link href="/client-team">
              <Button
                variant={location === "/client-team" ? "default" : "ghost"}
                className={location === "/client-team" ? "bg-sky-blue-accent hover:bg-sky-blue-accent/90" : ""}
                data-testid="nav-client-team"
              >
                Team
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
          {(isAdmin || isInternalDesigner) && (
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
          {canViewReports && (
            <Link href="/reports">
              <Button
                variant={location.startsWith("/reports") ? "default" : "ghost"}
                className={location.startsWith("/reports") ? "bg-sky-blue-accent hover:bg-sky-blue-accent/90" : ""}
                data-testid="nav-reports"
              >
                Reports
              </Button>
            </Link>
          )}
        </nav>
      </div>
      {currentUser && !currentUser.impersonating && (
        <div className="flex items-center gap-6">
          <Popover open={searchOpen} onOpenChange={setSearchOpen}>
            <PopoverTrigger asChild>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search Job ID"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (e.target.value.trim()) {
                      setSearchOpen(true);
                    }
                  }}
                  onFocus={() => {
                    if (searchQuery.trim()) {
                      setSearchOpen(true);
                    }
                  }}
                  className="w-44 pl-9"
                  data-testid="input-global-search"
                />
              </div>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
              {isSearching ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">Searching...</span>
                </div>
              ) : searchResults.length === 0 ? (
                <div className="py-4 text-center text-sm text-muted-foreground">
                  {searchQuery.trim() ? "No jobs found" : "Enter a Job ID to search"}
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  {searchResults.map((result) => (
                    <button
                      key={result.id}
                      onClick={() => handleSelectResult(result)}
                      className="flex items-center gap-2 p-2 rounded-md hover-elevate active-elevate-2 text-left w-full"
                      data-testid={`search-result-${result.jobId}`}
                    >
                      {result.type === "adhoc" ? (
                        <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      ) : (
                        <Package className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      )}
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-medium">{result.jobId}</span>
                        <span className="text-xs text-muted-foreground truncate">{result.title}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </PopoverContent>
          </Popover>
          <div className="flex items-center gap-4">
            <span className="text-sm text-dark-gray whitespace-nowrap">User Role</span>
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
        </div>
      )}
    </header>
    </>
  );
}
