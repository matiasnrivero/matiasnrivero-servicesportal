import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
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
import { useToast } from "@/hooks/use-toast";
import { Users, UserPlus, Search, Filter } from "lucide-react";
import type { User } from "@shared/schema";
import { userRoles, paymentMethods } from "@shared/schema";

const roleLabels: Record<string, string> = {
  admin: "Admin",
  internal_designer: "Internal Designer",
  vendor: "Vendor",
  vendor_designer: "Vendor Designer",
  client: "Client",
};

const roleBadgeVariants: Record<string, "default" | "secondary" | "outline"> = {
  admin: "default",
  internal_designer: "default",
  vendor: "secondary",
  vendor_designer: "secondary",
  client: "outline",
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

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);
    const matchesRole = roleFilter === "all" || user.role === roleFilter;
    return matchesSearch && matchesRole;
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
                      <Label>Payment Method</Label>
                      <Select
                        value={newUser.paymentMethod}
                        onValueChange={(v) => setNewUser({ ...newUser, paymentMethod: v })}
                      >
                        <SelectTrigger data-testid="select-payment-method">
                          <SelectValue placeholder="Select payment method" />
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
                    {userRoles.map((role) => (
                      <SelectItem key={role} value={role}>
                        {roleLabels[role]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                    className="flex items-center justify-between p-4 border rounded-md"
                    data-testid={`row-user-${user.id}`}
                  >
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="font-semibold text-dark-blue-night">
                          {user.username}
                        </p>
                        <p className="text-sm text-dark-gray">{user.email || "No email"}</p>
                      </div>
                      <Badge variant={roleBadgeVariants[user.role] || "outline"}>
                        {roleLabels[user.role] || user.role}
                      </Badge>
                      {!user.isActive && (
                        <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">
                          Inactive
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4">
                      {canToggleUserActive(user) && user.id !== currentUser?.id && (
                        <div className="flex items-center gap-2">
                          <Label htmlFor={`toggle-${user.id}`} className="text-sm text-dark-gray">
                            Active
                          </Label>
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
                        </div>
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
  );
}
