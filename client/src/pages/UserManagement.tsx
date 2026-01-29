import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import { Users, UserPlus, Search, Filter, Pencil, CalendarIcon, X, LogIn, Trash2, ArrowRight } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { User } from "@shared/schema";
import { userRoles, paymentMethods } from "@shared/schema";
import { format } from "date-fns";

const roleLabels: Record<string, string> = {
  admin: "Admin",
  internal_designer: "Internal Designer",
  vendor: "Vendor",
  vendor_designer: "Vendor Designer",
  client: "Client Admin",
  client_member: "Client Member",
};

const roleBadgeVariants: Record<string, "default" | "secondary" | "outline"> = {
  admin: "default",
  internal_designer: "default",
  vendor: "secondary",
  vendor_designer: "secondary",
  client: "default",
  client_member: "outline",
};

const roleBadgeColors: Record<string, string> = {
  admin: "",
  internal_designer: "",
  vendor: "",
  vendor_designer: "",
  client: "bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700",
  client_member: "bg-teal-500 text-white hover:bg-teal-600 dark:bg-teal-500 dark:hover:bg-teal-600",
};

async function getDefaultUser(): Promise<User | null> {
  const res = await fetch("/api/default-user");
  if (!res.ok) return null;
  return res.json();
}

export default function UserManagement() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [newUser, setNewUser] = useState({
    username: "",
    email: "",
    phone: "",
    password: "",
    role: "client" as string,
    paymentMethod: "" as string,
    vendorId: "" as string,
  });
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editFormData, setEditFormData] = useState({
    username: "",
    email: "",
    phone: "",
    role: "",
    paymentMethod: "",
  });
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);

  const { data: currentUser } = useQuery<User | null>({
    queryKey: ["/api/default-user"],
    queryFn: getDefaultUser,
  });

  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const { data: vendorUsers = [] } = useQuery<User[]>({
    queryKey: ["/api/users", { role: "vendor" }],
    queryFn: async () => {
      const res = await fetch("/api/users?role=vendor");
      if (!res.ok) throw new Error("Failed to fetch vendors");
      return res.json();
    },
  });

  const createUserMutation = useMutation({
    mutationFn: async (userData: typeof newUser) => {
      return apiRequest("POST", "/api/users", userData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setInviteDialogOpen(false);
      setNewUser({
        username: "",
        email: "",
        phone: "",
        password: "",
        role: "client",
        paymentMethod: "",
        vendorId: "",
      });
      toast({ title: "User created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const toggleUserActiveMutation = useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      return apiRequest("PATCH", `/api/users/${userId}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "User status updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ userId, data }: { userId: string; data: Partial<typeof editFormData> }) => {
      return apiRequest("PATCH", `/api/users/${userId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setEditDialogOpen(false);
      setEditingUser(null);
      toast({ title: "User updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const impersonateMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest("POST", `/api/users/${userId}/impersonate`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/default-user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/service-requests"] });
      toast({ title: "Now viewing as selected user" });
      window.location.href = "/";
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest("DELETE", `/api/users/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "User deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);
    const matchesRole = roleFilter === "all" || user.role === roleFilter;
    const matchesStatus = statusFilter === "all" || 
      (statusFilter === "active" && user.isActive) || 
      (statusFilter === "inactive" && !user.isActive);
    
    // Internal designers cannot see clients
    if (currentUser?.role === "internal_designer" && user.role === "client") {
      return false;
    }
    
    // Date range filtering
    let matchesDateRange = true;
    if (user.createdAt) {
      const userDate = new Date(user.createdAt);
      if (dateFrom) {
        const fromStart = new Date(dateFrom);
        fromStart.setHours(0, 0, 0, 0);
        matchesDateRange = matchesDateRange && userDate >= fromStart;
      }
      if (dateTo) {
        const toEnd = new Date(dateTo);
        toEnd.setHours(23, 59, 59, 999);
        matchesDateRange = matchesDateRange && userDate <= toEnd;
      }
    }
    
    return matchesSearch && matchesRole && matchesStatus && matchesDateRange;
  });

  const canInviteRole = (targetRole: string): boolean => {
    if (!currentUser) return false;
    if (currentUser.role === "admin") return true;
    if (currentUser.role === "internal_designer") {
      return ["internal_designer", "vendor", "vendor_designer"].includes(targetRole);
    }
    if (currentUser.role === "vendor") {
      return ["vendor", "vendor_designer"].includes(targetRole);
    }
    return false;
  };

  const getInvitableRoles = (): string[] => {
    if (!currentUser) return [];
    if (currentUser.role === "admin") return [...userRoles];
    if (currentUser.role === "internal_designer") {
      return ["internal_designer", "vendor", "vendor_designer"];
    }
    if (currentUser.role === "vendor") {
      return ["vendor", "vendor_designer"];
    }
    return [];
  };

  const canToggleUserActive = (targetUser: User): boolean => {
    if (!currentUser) return false;
    if (currentUser.role === "admin") return true;
    if (currentUser.role === "internal_designer") {
      return ["internal_designer", "vendor", "vendor_designer"].includes(targetUser.role);
    }
    if (currentUser.role === "vendor") {
      const vendorStructureId = currentUser.vendorId || currentUser.id;
      return (
        targetUser.vendorId === vendorStructureId &&
        ["vendor", "vendor_designer"].includes(targetUser.role)
      );
    }
    return false;
  };

  const handleCreateUser = () => {
    if (!newUser.username || !newUser.password || !newUser.role) {
      toast({ title: "Please fill in required fields", variant: "destructive" });
      return;
    }
    createUserMutation.mutate(newUser);
  };

  const canEditUser = (targetUser: User): boolean => {
    if (!currentUser) return false;
    if (currentUser.role === "admin") return true;
    if (currentUser.role === "internal_designer") {
      return ["internal_designer", "vendor", "vendor_designer"].includes(targetUser.role);
    }
    if (currentUser.role === "vendor") {
      const vendorStructureId = currentUser.vendorId || currentUser.id;
      return (
        targetUser.vendorId === vendorStructureId &&
        ["vendor", "vendor_designer"].includes(targetUser.role)
      );
    }
    return false;
  };

  const canEditRoleAndPayment = (): boolean => {
    return currentUser?.role === "admin";
  };

  const canImpersonateUser = (targetUser: User): boolean => {
    if (!currentUser) return false;
    if (targetUser.id === currentUser.id) return false;
    if (currentUser.role === "admin") return true;
    if (currentUser.role === "vendor") {
      const vendorStructureId = currentUser.vendorId || currentUser.id;
      return (
        targetUser.vendorId === vendorStructureId &&
        ["vendor", "vendor_designer"].includes(targetUser.role)
      );
    }
    return false;
  };

  const getAvailableRoleFilters = (): string[] => {
    if (currentUser?.role === "vendor") {
      return ["vendor", "vendor_designer"];
    }
    if (currentUser?.role === "internal_designer") {
      return ["admin", "internal_designer", "vendor", "vendor_designer"];
    }
    return userRoles as unknown as string[];
  };

  const handleOpenEditDialog = (user: User) => {
    setEditingUser(user);
    setEditFormData({
      username: user.username,
      email: user.email || "",
      phone: user.phone || "",
      role: user.role,
      paymentMethod: user.paymentMethod || "",
    });
    setEditDialogOpen(true);
  };

  const handleUpdateUser = () => {
    if (!editingUser) return;
    if (!editFormData.username) {
      toast({ title: "Username is required", variant: "destructive" });
      return;
    }
    
    const updateData: Record<string, string> = {
      username: editFormData.username,
      email: editFormData.email,
      phone: editFormData.phone,
    };
    
    if (canEditRoleAndPayment()) {
      updateData.role = editFormData.role;
      if (editFormData.role === "client") {
        updateData.paymentMethod = editFormData.paymentMethod;
      } else {
        updateData.paymentMethod = "";
      }
    }
    
    updateUserMutation.mutate({ userId: editingUser.id, data: updateData });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-blue-accent"></div>
      </div>
    );
  }

  const isAdminOrInternal = currentUser?.role === "admin" || currentUser?.role === "internal_designer";
  const isVendor = currentUser?.role === "vendor";
  const canInvite = isAdminOrInternal || isVendor;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="p-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Users className="h-8 w-8 text-sky-blue-accent" />
              <h1 className="font-title-semibold text-dark-blue-night text-2xl">
                User Management
              </h1>
            </div>
          {canInvite && (
            <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-invite-user">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Invite User
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Invite New User</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label>Username<span className="text-destructive">*</span></Label>
                    <Input
                      value={newUser.username}
                      onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                      placeholder="Enter username"
                      data-testid="input-new-username"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={newUser.email}
                      onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                      placeholder="Enter email"
                      data-testid="input-new-email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <Input
                      value={newUser.phone}
                      onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })}
                      placeholder="Enter phone"
                      data-testid="input-new-phone"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Password<span className="text-destructive">*</span></Label>
                    <Input
                      type="password"
                      value={newUser.password}
                      onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                      placeholder="Enter password"
                      data-testid="input-new-password"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Role<span className="text-destructive">*</span></Label>
                    <Select
                      value={newUser.role}
                      onValueChange={(v) => setNewUser({ ...newUser, role: v })}
                    >
                      <SelectTrigger data-testid="select-new-role">
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                      <SelectContent>
                        {getInvitableRoles().map((role) => (
                          <SelectItem key={role} value={role}>
                            {roleLabels[role]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {(newUser.role === "vendor_designer" || newUser.role === "vendor") && 
                   currentUser?.role !== "vendor" && (
                    <div className="space-y-2">
                      <Label>Parent Vendor</Label>
                      <Select
                        value={newUser.vendorId}
                        onValueChange={(v) => setNewUser({ ...newUser, vendorId: v })}
                      >
                        <SelectTrigger data-testid="select-parent-vendor">
                          <SelectValue placeholder="Select vendor (optional)" />
                        </SelectTrigger>
                        <SelectContent>
                          {vendorUsers.map((vendor) => (
                            <SelectItem key={vendor.id} value={vendor.id}>
                              {vendor.username}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {newUser.role === "client" && currentUser?.role === "admin" && (
                    <div className="space-y-2">
                      <Label>Payment Type</Label>
                      <Select
                        value={newUser.paymentMethod}
                        onValueChange={(v) => setNewUser({ ...newUser, paymentMethod: v })}
                      >
                        <SelectTrigger data-testid="select-payment-type">
                          <SelectValue placeholder="Select payment type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pay_as_you_go">Pay as you go (Credit Card)</SelectItem>
                          <SelectItem value="monthly_payment">Monthly Payment (Credit Card / ACH)</SelectItem>
                          <SelectItem value="deduct_from_royalties">Deduct from Tri-POD Royalties</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="flex justify-end gap-2 pt-4">
                    <Button
                      variant="outline"
                      onClick={() => setInviteDialogOpen(false)}
                      data-testid="button-cancel-invite"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleCreateUser}
                      disabled={createUserMutation.isPending}
                      data-testid="button-confirm-invite"
                    >
                      {createUserMutation.isPending ? "Creating..." : "Create User"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}

          <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Edit User</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Username<span className="text-destructive">*</span></Label>
                  <Input
                    value={editFormData.username}
                    onChange={(e) => setEditFormData({ ...editFormData, username: e.target.value })}
                    placeholder="Enter username"
                    data-testid="input-edit-username"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={editFormData.email}
                    onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                    placeholder="Enter email"
                    data-testid="input-edit-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input
                    value={editFormData.phone}
                    onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                    placeholder="Enter phone"
                    data-testid="input-edit-phone"
                  />
                </div>
                {canEditRoleAndPayment() && (
                  <>
                    <div className="space-y-2">
                      <Label>Role</Label>
                      <Select
                        value={editFormData.role}
                        onValueChange={(v) => setEditFormData({ ...editFormData, role: v })}
                      >
                        <SelectTrigger data-testid="select-edit-role">
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                        <SelectContent>
                          {userRoles.map((role) => (
                            <SelectItem key={role} value={role}>
                              {roleLabels[role]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {editFormData.role === "client" && (
                      <div className="space-y-2">
                        <Label>Payment Type</Label>
                        <Select
                          value={editFormData.paymentMethod}
                          onValueChange={(v) => setEditFormData({ ...editFormData, paymentMethod: v })}
                        >
                          <SelectTrigger data-testid="select-edit-payment-type">
                            <SelectValue placeholder="Select payment type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pay_as_you_go">Pay as you go (Credit Card)</SelectItem>
                            <SelectItem value="monthly_payment">Monthly Payment (Credit Card / ACH)</SelectItem>
                            <SelectItem value="deduct_from_royalties">Deduct from Tri-POD Royalties</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </>
                )}
                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => setEditDialogOpen(false)}
                    data-testid="button-cancel-edit"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleUpdateUser}
                    disabled={updateUserMutation.isPending}
                    data-testid="button-confirm-edit"
                  >
                    {updateUserMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-dark-gray" />
                <Input
                  placeholder="Search users..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-users"
                />
              </div>
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-dark-gray" />
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger className="w-48" data-testid="select-role-filter">
                    <SelectValue placeholder="Filter by role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Roles</SelectItem>
                    {getAvailableRoleFilters().map((role) => (
                      <SelectItem key={role} value={role}>
                        {roleLabels[role as keyof typeof roleLabels]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-36" data-testid="select-status-filter">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-32 justify-start text-left font-normal" data-testid="button-date-from">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateFrom ? format(dateFrom, "MM/dd/yy") : "From"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dateFrom}
                      onSelect={setDateFrom}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-32 justify-start text-left font-normal" data-testid="button-date-to">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateTo ? format(dateTo, "MM/dd/yy") : "To"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dateTo}
                      onSelect={setDateTo}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                {(dateFrom || dateTo) && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => { setDateFrom(undefined); setDateTo(undefined); }}
                    data-testid="button-clear-dates"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              Users ({filteredUsers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {filteredUsers.length === 0 ? (
                <p className="text-dark-gray text-center py-8">No users found</p>
              ) : (
                filteredUsers.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center gap-4 p-4 border rounded-md"
                    data-testid={`row-user-${user.id}`}
                  >
                    {/* Toggle */}
                    <div className="flex-shrink-0">
                      {canToggleUserActive(user) && user.id !== currentUser?.id ? (
                        <Switch
                          id={`toggle-${user.id}`}
                          checked={user.isActive}
                          onCheckedChange={(checked) =>
                            toggleUserActiveMutation.mutate({
                              userId: user.id,
                              isActive: checked,
                            })
                          }
                          data-testid={`switch-user-active-${user.id}`}
                        />
                      ) : (
                        <div className="w-9" />
                      )}
                    </div>
                    {/* Avatar + Name */}
                    <div className="flex items-center gap-3 w-[200px] flex-shrink-0">
                      <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-blue-700 font-medium text-sm">
                          {user.username?.charAt(0).toUpperCase() || "?"}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-dark-blue-night truncate">
                          {user.username}
                        </p>
                        {user.id === currentUser?.id && (
                          <Badge variant="outline" className="text-xs">You</Badge>
                        )}
                      </div>
                    </div>
                    {/* Email */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-dark-gray truncate">{user.email || "No email"}</p>
                    </div>
                    {/* Role */}
                    <div className="w-[140px] flex-shrink-0">
                      <Badge 
                        variant={roleBadgeVariants[user.role] || "outline"}
                        className={`${roleBadgeColors[user.role] || ""} whitespace-nowrap`}
                      >
                        {roleLabels[user.role] || user.role}
                      </Badge>
                    </div>
                    {/* Created Date */}
                    <div className="w-[100px] flex-shrink-0">
                      <p className="text-sm text-muted-foreground whitespace-nowrap">
                        {user.createdAt ? format(new Date(user.createdAt), "MMM d, yyyy") : "-"}
                      </p>
                    </div>
                    {/* Last Login */}
                    <div className="w-[100px] flex-shrink-0">
                      <p className="text-sm text-muted-foreground whitespace-nowrap">
                        {user.lastLoginAt ? format(new Date(user.lastLoginAt), "MMM d, yyyy") : "Never"}
                      </p>
                    </div>
                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      {canImpersonateUser(user) && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => impersonateMutation.mutate(user.id)}
                              disabled={impersonateMutation.isPending}
                              data-testid={`button-login-as-${user.id}`}
                            >
                              <LogIn className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Login as</TooltipContent>
                        </Tooltip>
                      )}
                      {canEditUser(user) && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleOpenEditDialog(user)}
                              data-testid={`button-edit-user-${user.id}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Edit</TooltipContent>
                        </Tooltip>
                      )}
                      {currentUser?.role === "admin" && user.id !== currentUser.id && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                setUserToDelete(user);
                                setDeleteModalOpen(true);
                              }}
                              data-testid={`button-delete-user-${user.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Delete</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
          </Card>
        </div>
      </div>

      <AlertDialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {userToDelete?.username}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (userToDelete) {
                  deleteUserMutation.mutate(userToDelete.id);
                }
                setDeleteModalOpen(false);
                setUserToDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
