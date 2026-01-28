import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link, useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  DialogFooter,
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { Building2, Users, Save, ArrowLeft, Store, UserPlus, Pencil, Trash2, LogIn, Crown } from "lucide-react";
import type { User } from "@shared/schema";
import { format } from "date-fns";

interface ClientProfile {
  id: string;
  companyName: string;
  industry: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  paymentConfiguration: string;
  tripodDiscountTier?: string;
  stripeCustomerId?: string | null;
  isActive: number;
  createdAt: Date | string;
  updatedAt: Date | string;
  primaryUserId?: string | null;
}

interface EnrichedClient extends ClientProfile {
  memberCount: number;
  primaryContact: { id: string; username: string; email: string | null } | null;
  defaultVendor: { id: string; username: string } | null;
  members?: User[];
}

const roleLabels: Record<string, string> = {
  client: "Client Admin",
  client_member: "Client Member",
};

async function getDefaultUser(): Promise<User | null> {
  const res = await fetch("/api/default-user");
  if (!res.ok) return null;
  return res.json();
}

export default function ClientDetail() {
  const { toast } = useToast();
  const params = useParams<{ id: string }>();
  const clientId = params.id;
  const [, setLocation] = useLocation();
  
  const [profileForm, setProfileForm] = useState({
    companyName: "",
    industry: "",
    website: "",
    email: "",
    phone: "",
    address: "",
    paymentConfiguration: "pay_as_you_go",
    tripodDiscountTier: "none",
  });
  
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [editMemberDialogOpen, setEditMemberDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<User | null>(null);
  const [editMemberForm, setEditMemberForm] = useState({ username: "", email: "", phone: "" });
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [memberToDelete, setMemberToDelete] = useState<User | null>(null);
  const [newUser, setNewUser] = useState({
    username: "",
    email: "",
    phone: "",
    password: "",
    role: "client_member" as string,
  });

  const { data: currentUser } = useQuery<User | null>({
    queryKey: ["/api/default-user"],
    queryFn: getDefaultUser,
  });

  const { data: clientData, isLoading: clientLoading } = useQuery<EnrichedClient | null>({
    queryKey: ["/api/org-companies", clientId],
    queryFn: async () => {
      if (!clientId) return null;
      const res = await fetch(`/api/org-companies/${clientId}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!clientId && currentUser?.role === "admin",
  });

  const { data: teamMembers = [], isLoading: teamLoading } = useQuery<User[]>({
    queryKey: ["/api/org-companies", clientId, "members"],
    queryFn: async () => {
      if (!clientId) return [];
      const res = await fetch(`/api/org-companies/${clientId}/members`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!clientId && currentUser?.role === "admin",
  });

  useEffect(() => {
    if (clientData) {
      setProfileForm({
        companyName: clientData.companyName || "",
        industry: clientData.industry || "",
        website: clientData.website || "",
        email: clientData.email || "",
        phone: clientData.phone || "",
        address: clientData.address || "",
        paymentConfiguration: clientData.paymentConfiguration || "pay_as_you_go",
        tripodDiscountTier: clientData.tripodDiscountTier || "none",
      });
    }
  }, [clientData]);

  const updateProfileMutation = useMutation({
    mutationFn: async (data: typeof profileForm) => {
      return apiRequest("PATCH", `/api/org-companies/${clientId}`, {
        name: data.companyName,
        industry: data.industry,
        website: data.website,
        email: data.email,
        phone: data.phone,
        address: data.address,
        paymentConfiguration: data.paymentConfiguration,
        tripodDiscountTier: data.tripodDiscountTier,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/org-companies"] });
      toast({ title: "Profile saved", description: "Client profile has been updated." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const toggleMemberActiveMutation = useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      return apiRequest("PATCH", `/api/users/${userId}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/org-companies", clientId, "members"] });
      toast({ title: "Member status updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const createMemberMutation = useMutation({
    mutationFn: async (userData: typeof newUser) => {
      return apiRequest("POST", "/api/users", {
        ...userData,
        clientProfileId: clientId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/org-companies", clientId, "members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/org-companies"] });
      setInviteDialogOpen(false);
      setNewUser({ username: "", email: "", phone: "", password: "", role: "client_member" });
      toast({ title: "Team member added successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMemberMutation = useMutation({
    mutationFn: async ({ userId, data }: { userId: string; data: typeof editMemberForm }) => {
      return apiRequest("PATCH", `/api/users/${userId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/org-companies", clientId, "members"] });
      setEditMemberDialogOpen(false);
      setEditingMember(null);
      toast({ title: "Member updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest("DELETE", `/api/users/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/org-companies", clientId, "members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/org-companies"] });
      setDeleteModalOpen(false);
      setMemberToDelete(null);
      toast({ title: "Member removed successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleEditMember = (member: User) => {
    setEditingMember(member);
    setEditMemberForm({
      username: member.username,
      email: member.email || "",
      phone: member.phone || "",
    });
    setEditMemberDialogOpen(true);
  };

  const handleLoginAs = async (userId: string) => {
    try {
      await apiRequest("POST", "/api/login-as", { userId });
      window.location.href = "/";
    } catch (error) {
      toast({ title: "Error", description: "Failed to login as user", variant: "destructive" });
    }
  };

  const formatPaymentConfig = (config: string) => {
    switch (config) {
      case "pay_as_you_go": return "Pay as you go";
      case "monthly_payment": return "Monthly Payment";
      case "deduct_from_royalties": return "Deduct from Royalties";
      default: return config;
    }
  };

  const getPaymentBadgeVariant = (config: string) => {
    switch (config) {
      case "pay_as_you_go": return "secondary";
      case "monthly_payment": return "default";
      case "deduct_from_royalties": return "outline";
      default: return "secondary";
    }
  };

  const formatDate = (date: Date | string) => {
    if (!date) return "-";
    return format(new Date(date), "MMM d, yyyy");
  };

  const isAdmin = currentUser?.role === "admin";

  if (clientLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-blue-accent"></div>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="p-8">
          <div className="max-w-4xl mx-auto text-center py-12">
            <Building2 className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Admin Access Required</h2>
            <p className="text-muted-foreground">This page is only accessible to Admin users.</p>
          </div>
        </div>
      </div>
    );
  }

  if (!clientData) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="p-8">
          <div className="max-w-4xl mx-auto text-center py-12">
            <Building2 className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Client Not Found</h2>
            <p className="text-muted-foreground mb-4">The requested client could not be found.</p>
            <Link href="/org-companies">
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Clients
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="p-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-4 mb-6">
            <Link href="/org-companies">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <Store className="h-8 w-8 text-sky-blue-accent" />
            <div className="flex-1">
              <h1 className="font-title-semibold text-dark-blue-night text-2xl">
                {clientData.companyName}
              </h1>
              <p className="text-muted-foreground text-sm">
                {clientData.industry || "No industry"} • Created {formatDate(clientData.createdAt)}
              </p>
            </div>
            <Badge variant={clientData.isActive === 1 ? "default" : "secondary"}>
              {clientData.isActive === 1 ? "Active" : "Inactive"}
            </Badge>
            <Badge variant={getPaymentBadgeVariant(clientData.paymentConfiguration)}>
              {formatPaymentConfig(clientData.paymentConfiguration)}
            </Badge>
          </div>

          <Tabs defaultValue="profile" className="w-full">
            <TabsList className="mb-6">
              <TabsTrigger value="profile" data-testid="tab-profile">
                <Building2 className="h-4 w-4 mr-2" />
                Profile
              </TabsTrigger>
              <TabsTrigger value="team" data-testid="tab-team">
                <Users className="h-4 w-4 mr-2" />
                Team
              </TabsTrigger>
            </TabsList>

            <TabsContent value="profile">
              <Card>
                <CardHeader>
                  <CardTitle>Company Information</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="companyName">Company Name</Label>
                        <Input
                          id="companyName"
                          value={profileForm.companyName}
                          onChange={(e) => setProfileForm({ ...profileForm, companyName: e.target.value })}
                          data-testid="input-company-name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="website">Website</Label>
                        <Input
                          id="website"
                          value={profileForm.website}
                          onChange={(e) => setProfileForm({ ...profileForm, website: e.target.value })}
                          placeholder="https://example.com"
                          data-testid="input-website"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          value={profileForm.email}
                          onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                          data-testid="input-email"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="phone">Phone</Label>
                        <Input
                          id="phone"
                          value={profileForm.phone}
                          onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                          data-testid="input-phone"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="industry">Industry</Label>
                        <Input
                          id="industry"
                          value={profileForm.industry}
                          onChange={(e) => setProfileForm({ ...profileForm, industry: e.target.value })}
                          data-testid="input-industry"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="address">Address</Label>
                        <Input
                          id="address"
                          value={profileForm.address}
                          onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })}
                          data-testid="input-address"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="payment">Payment Configuration</Label>
                        <Select
                          value={profileForm.paymentConfiguration}
                          onValueChange={(value) => setProfileForm({ ...profileForm, paymentConfiguration: value })}
                        >
                          <SelectTrigger data-testid="select-payment-config">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pay_as_you_go">Pay as you go</SelectItem>
                            <SelectItem value="monthly_payment">Monthly Payment</SelectItem>
                            <SelectItem value="deduct_from_royalties">Deduct from Royalties</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="tripod-discount">Tri-POD Product Discount</Label>
                        <Select
                          value={profileForm.tripodDiscountTier}
                          onValueChange={(value) => setProfileForm({ ...profileForm, tripodDiscountTier: value })}
                        >
                          <SelectTrigger data-testid="select-tripod-discount">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            <SelectItem value="power_level">Tri-POD Power Level Client (10%)</SelectItem>
                            <SelectItem value="oms_subscription">OMS Subscription (15%)</SelectItem>
                            <SelectItem value="enterprise">Enterprise (20%)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <Button
                        onClick={() => updateProfileMutation.mutate(profileForm)}
                        disabled={updateProfileMutation.isPending}
                        data-testid="button-save-profile"
                      >
                        <Save className="h-4 w-4 mr-2" />
                        {updateProfileMutation.isPending ? "Saving..." : "Save Profile"}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="team">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-4">
                  <CardTitle>Team Members ({teamMembers.length})</CardTitle>
                  <Button onClick={() => setInviteDialogOpen(true)} data-testid="button-invite-member">
                    <UserPlus className="h-4 w-4 mr-2" />
                    Add Member
                  </Button>
                </CardHeader>
                <CardContent>
                  {teamLoading ? (
                    <div className="py-8 text-center text-muted-foreground">Loading team members...</div>
                  ) : teamMembers.length === 0 ? (
                    <div className="py-8 text-center text-muted-foreground">
                      No team members yet. Add members to this client.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {teamMembers.map((member) => {
                        const isPrimary = member.id === clientData.primaryUserId || 
                          member.id === clientData.primaryContact?.id;
                        return (
                          <div
                            key={member.id}
                            className={`flex items-center p-4 border rounded-md ${isPrimary ? 'bg-muted/50 border-primary/20' : ''}`}
                            data-testid={`row-member-${member.id}`}
                          >
                            <div className="w-16 flex-shrink-0">
                              <Switch
                                id={`toggle-member-${member.id}`}
                                checked={member.isActive}
                                disabled={isPrimary}
                                onCheckedChange={(checked) =>
                                  toggleMemberActiveMutation.mutate({
                                    userId: member.id,
                                    isActive: checked,
                                  })
                                }
                                data-testid={`switch-member-active-${member.id}`}
                              />
                            </div>
                            <div className="w-[200px] flex-shrink-0">
                              <div className="flex items-center gap-2">
                                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium flex-shrink-0">
                                  {member.username.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <p className="font-semibold">{member.username}</p>
                                  {isPrimary && (
                                    <Badge variant="default" className="bg-emerald-600 text-xs">
                                      <Crown className="h-3 w-3 mr-1" />
                                      Primary Admin
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="w-[200px] flex-shrink-0">
                              <p className="text-sm truncate">{member.email || "No email"}</p>
                              <p className="text-xs text-muted-foreground">Email</p>
                            </div>
                            <div className="w-[150px] flex-shrink-0">
                              <Badge variant={member.role === "client" ? "default" : "outline"}>
                                {roleLabels[member.role] || member.role}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0 ml-auto">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleLoginAs(member.id)}
                                    data-testid={`button-login-as-${member.id}`}
                                  >
                                    <LogIn className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Login As</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleEditMember(member)}
                                    data-testid={`button-edit-member-${member.id}`}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Edit</TooltipContent>
                              </Tooltip>
                              {!isPrimary && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => {
                                        setMemberToDelete(member);
                                        setDeleteModalOpen(true);
                                      }}
                                      data-testid={`button-delete-member-${member.id}`}
                                    >
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Remove</TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Team Member</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Username *</Label>
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
                placeholder="user@example.com"
                data-testid="input-new-email"
              />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input
                value={newUser.phone}
                onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })}
                placeholder="+1 555 123 4567"
                data-testid="input-new-phone"
              />
            </div>
            <div className="space-y-2">
              <Label>Password *</Label>
              <Input
                type="password"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                placeholder="Enter password"
                data-testid="input-new-password"
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select
                value={newUser.role}
                onValueChange={(value) => setNewUser({ ...newUser, role: value })}
              >
                <SelectTrigger data-testid="select-new-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="client">Client Admin</SelectItem>
                  <SelectItem value="client_member">Client Member</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createMemberMutation.mutate(newUser)}
              disabled={!newUser.username || !newUser.password || createMemberMutation.isPending}
              data-testid="button-confirm-add-member"
            >
              {createMemberMutation.isPending ? "Adding..." : "Add Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editMemberDialogOpen} onOpenChange={setEditMemberDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Team Member</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Username</Label>
              <Input
                value={editMemberForm.username}
                onChange={(e) => setEditMemberForm({ ...editMemberForm, username: e.target.value })}
                data-testid="input-edit-username"
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={editMemberForm.email}
                onChange={(e) => setEditMemberForm({ ...editMemberForm, email: e.target.value })}
                data-testid="input-edit-email"
              />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input
                value={editMemberForm.phone}
                onChange={(e) => setEditMemberForm({ ...editMemberForm, phone: e.target.value })}
                data-testid="input-edit-phone"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditMemberDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => editingMember && updateMemberMutation.mutate({ userId: editingMember.id, data: editMemberForm })}
              disabled={updateMemberMutation.isPending}
              data-testid="button-confirm-edit-member"
            >
              {updateMemberMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Team Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove "{memberToDelete?.username}" from this client?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => memberToDelete && deleteMemberMutation.mutate(memberToDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-member"
            >
              {deleteMemberMutation.isPending ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
