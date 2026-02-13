import { Link, useLocation, useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Search, Loader2, FileText, Package, User as UserIcon, LogOut } from "lucide-react";
import type { User } from "@shared/schema";
import { useState, useEffect, useRef } from "react";
import { NotificationBell } from "@/components/NotificationBell";
import defaultLogoImg from "@assets/left_alligned_Services_1770755353119.png";

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

type UserSession = {
  userId: string;
  role: string;
  username: string;
  avatarUrl?: string | null;
  authMode?: string;
  impersonating?: boolean;
  impersonatorId?: string;
};

async function getDefaultUser(): Promise<UserSession | null> {
  const res = await fetch("/api/default-user");
  if (!res.ok) return null;
  const data = await res.json();
  if (data && data.user === null) {
    return { authMode: data.authMode } as any;
  }
  return data;
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

  const { data: logoSetting } = useQuery<{ value: string | null }>({
    queryKey: ["/api/system-settings/platform-logo"],
  });

  const isAuthMode = currentUser?.authMode === "auth";
  const isLoggedIn = !!currentUser?.userId;
  const logoSrc = logoSetting?.value || defaultLogoImg;

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
      return res.json() as Promise<{ role: string; user: User }>;
    },
    onSuccess: (data) => {
      // Optimistically update user data immediately for instant UI response
      if (data.user) {
        queryClient.setQueryData(["/api/default-user"], data.user);
      }
      // Fire invalidations in background without awaiting - UI unlocks immediately
      queryClient.invalidateQueries({ queryKey: ["/api/service-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bundle-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assignable-users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
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
      return res.json() as Promise<{ user: User }>;
    },
    onSuccess: (data) => {
      // Optimistically update user data immediately for instant UI response
      if (data.user) {
        queryClient.setQueryData(["/api/default-user"], data.user);
      }
      // Fire invalidations in background without awaiting
      queryClient.invalidateQueries({ queryKey: ["/api/service-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bundle-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assignable-users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
  });

  const isAdmin = currentUser?.role === "admin";
  const isInternalDesigner = currentUser?.role === "internal_designer";
  const isVendor = currentUser?.role === "vendor";
  const isVendorDesigner = currentUser?.role === "vendor_designer";
  const isClient = currentUser?.role === "client";
  const isClientMember = currentUser?.role === "client_member";
  const isAnyClient = isClient || isClientMember;
  const canManageUsers = isAdmin || isInternalDesigner;
  const canViewVendorProfile = isVendor;
  const canViewClientCompanies = isAdmin;
  // Vendor and Vendor Designer should not see Services menu (they can't create new requests)
  const canViewServices = !isVendor && !isVendorDesigner;
  // Reports visible to Admin, Client, Vendor (not Internal Designer or Vendor Designer for now)
  const canViewReports = isAdmin || isClient || isVendor;
  // Payments visible only to Client Admin (not Client Member)
  const canViewPayments = isClient;

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
    <header className="flex w-full items-center gap-3 px-3 py-2 bg-white shadow-shadow-top-bar">
      <Link href={isAdmin ? "/dashboard" : "/"} className="flex-shrink-0 mr-3">
        <img src={logoSrc} alt="Tri-Pod Services" className="h-8 cursor-pointer" data-testid="link-services-portal" />
      </Link>
      <nav className="flex flex-1 items-center gap-3">
          {(isAdmin || isInternalDesigner || isVendor || isVendorDesigner) && (
            <Link href="/dashboard">
              <Button
                variant={location === "/dashboard" ? "default" : "ghost"}
                className={location === "/dashboard" ? "bg-sky-blue-accent hover:bg-sky-blue-accent/90" : ""}
                data-testid="nav-dashboard"
              >
                Dashboard
              </Button>
            </Link>
          )}
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
          {isLoggedIn && (
            <Link href="/service-requests">
              <Button
                variant={location.startsWith("/service-requests") && location !== "/service-requests/new" ? "default" : "ghost"}
                className={location.startsWith("/service-requests") && location !== "/service-requests/new" ? "bg-sky-blue-accent hover:bg-sky-blue-accent/90" : ""}
                data-testid="nav-requests"
              >
                Requests
              </Button>
            </Link>
          )}
          {isVendor && (
            <Link href="/vendor-team">
              <Button
                variant={location === "/vendor-team" ? "default" : "ghost"}
                className={location === "/vendor-team" ? "bg-sky-blue-accent hover:bg-sky-blue-accent/90" : ""}
                data-testid="nav-vendor-team"
              >
                Team
              </Button>
            </Link>
          )}
          {(isAdmin || isInternalDesigner) && (
            <Link href="/pack-assignment">
              <Button
                variant={location === "/pack-assignment" ? "default" : "ghost"}
                className={location === "/pack-assignment" ? "bg-sky-blue-accent hover:bg-sky-blue-accent/90" : ""}
                data-testid="nav-pack-assignment"
              >
                Packs
              </Button>
            </Link>
          )}
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
          {canViewPayments && (
            <Link href="/payments">
              <Button
                variant={location === "/payments" ? "default" : "ghost"}
                className={location === "/payments" ? "bg-sky-blue-accent hover:bg-sky-blue-accent/90" : ""}
                data-testid="nav-payments"
              >
                Payments
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
                Profile
              </Button>
            </Link>
          )}
          {canViewClientCompanies && (
            <Link href="/org-companies">
              <Button
                variant={location.startsWith("/org-companies") ? "default" : "ghost"}
                className={location.startsWith("/org-companies") ? "bg-sky-blue-accent hover:bg-sky-blue-accent/90" : ""}
                data-testid="nav-companies"
              >
                Clients
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
      {isLoggedIn && !currentUser?.impersonating && (
        <div className="flex items-center gap-2 flex-shrink-0">
          <Popover open={searchOpen} onOpenChange={setSearchOpen}>
            <PopoverTrigger asChild>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
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
                  className="w-32 pl-8"
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
          <NotificationBell />
          {currentUser.authMode === "auth" ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-md p-1 hover-elevate" data-testid="button-user-menu">
                  <Avatar className="h-8 w-8">
                    {currentUser.avatarUrl && (
                      <AvatarImage src={currentUser.avatarUrl} alt={currentUser.username} />
                    )}
                    <AvatarFallback className="text-xs bg-sky-blue-accent text-white">
                      {getInitials(currentUser.username || "U")}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium max-w-24 truncate hidden sm:inline">{currentUser.username}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={() => setLocation("/profile")}
                  data-testid="menu-item-profile"
                >
                  <UserIcon className="mr-2 h-4 w-4" />
                  My Profile
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={async () => {
                    try {
                      await apiRequest("POST", "/api/auth/logout");
                      queryClient.clear();
                      setLocation("/login");
                    } catch (e) {
                      console.error("Logout failed:", e);
                    }
                  }}
                  data-testid="menu-item-logout"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
          <div className="flex items-center gap-1">
            <Select
              value={(() => {
                const usernameToValue: Record<string, string> = {
                  "Matias Rivero": "admin",
                  "Federico Chami": "internal_designer",
                  "Marina Siarri": "internal_designer_2",
                  "Javier Rubianes": "vendor",
                  "Pablo Frabotta": "vendor_designer",
                  "Simon Doe": "vendor_2",
                  "Richard Smith": "vendor_designer_2",
                  "default-user": "client",
                  "Ross Adams": "client",
                  "Lourdes LaBelle": "client_member",
                  "Leighton Kountz": "client_2",
                  "Joe Ledbetter": "client_member_2",
                  "Tatiana Phelan": "client_3",
                  "Santiago Phelan": "client_member_3",
                };
                if (currentUser.username && usernameToValue[currentUser.username]) {
                  return usernameToValue[currentUser.username];
                }
                return currentUser.role;
              })()}
              onValueChange={(role) => switchRoleMutation.mutate(role)}
            >
              <SelectTrigger className="w-32" data-testid="select-role-switcher">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="internal_designer">Internal Designer 1</SelectItem>
                <SelectItem value="internal_designer_2">Internal Designer 2</SelectItem>
                <SelectItem value="vendor">Vendor 1</SelectItem>
                <SelectItem value="vendor_designer">Vendor Designer 1</SelectItem>
                <SelectItem value="vendor_2">Vendor 2</SelectItem>
                <SelectItem value="vendor_designer_2">Vendor Designer 2</SelectItem>
                <SelectItem value="client">Client 1</SelectItem>
                <SelectItem value="client_member">Client Member 1</SelectItem>
                <SelectItem value="client_2">Client 2</SelectItem>
                <SelectItem value="client_member_2">Client Member 2</SelectItem>
                <SelectItem value="client_3">Client 3</SelectItem>
                <SelectItem value="client_member_3">Client Member 3</SelectItem>
              </SelectContent>
            </Select>
          </div>
          )}
        </div>
      )}
      {!isLoggedIn && isAuthMode && (
        <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
          <Link href="/login">
            <Button variant="default" className="bg-sky-blue-accent" data-testid="button-sign-in">
              Sign In
            </Button>
          </Link>
        </div>
      )}
    </header>
    </>
  );
}
