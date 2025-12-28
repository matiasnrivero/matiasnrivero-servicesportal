import { useState, useEffect } from "react";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Building2, Users, UserPlus, Save, Pencil, Loader2, Crown, Trash2 } from "lucide-react";
import { format } from "date-fns";
import type { User, ClientProfile } from "@shared/schema";

async function getDefaultUser(): Promise<User | null> {
  const res = await fetch("/api/default-user");
  if (!res.ok) return null;
  const data = await res.json();
  return { ...data, id: data.userId };
}

export default function ClientTeamManagement() {
  const { toast } = useToast();
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [newUser, setNewUser] = useState({
    username: "",
    email: "",
    phone: "",
    password: "",
  });
  const [companyInfo, setCompanyInfo] = useState({
    companyName: "",
    industry: "",
    website: "",
    phone: "",
    address: "",
  });
  const [editUserDialogOpen, setEditUserDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editUserData, setEditUserData] = useState({
    username: "",
    email: "",
    phone: "",
  });

  const { data: currentUser, isLoading: userLoading } = useQuery<User | null>({
    queryKey: ["/api/default-user"],
    queryFn: getDefaultUser,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const clientProfileId = currentUser?.clientProfileId;

  const { data: clientProfile, isLoading: profileLoading, refetch: refetchProfile } = useQuery<ClientProfile | null>({
    queryKey: ["/api/client-profiles", clientProfileId],
    queryFn: async ({ queryKey }) => {
      const profileId = queryKey[1] as string | undefined;
      if (!profileId) return null;
      const res = await fetch(`/api/client-profiles/${profileId}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!clientProfileId,
    refetchOnMount: "always",
    staleTime: 0,
  });

  useEffect(() => {
    if (clientProfile) {
      setCompanyInfo({
        companyName: clientProfile.companyName || "",
        industry: clientProfile.industry || "",
        website: clientProfile.website || "",
        phone: clientProfile.phone || "",
        address: clientProfile.address || "",
      });
    }
  }, [clientProfile]);

  const { data: teamMembers = [], isLoading: teamLoading, refetch: refetchTeam } = useQuery<User[]>({
    queryKey: ["/api/client-profiles", clientProfileId, "team"],
    queryFn: async ({ queryKey }) => {
      const profileId = queryKey[1] as string | undefined;
      if (!profileId) return [];
      const res = await fetch(`/api/client-profiles/${profileId}/team`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!clientProfileId,
  });

  const isPrimaryClient = currentUser?.id === clientProfile?.primaryUserId;

  const inviteTeamMemberMutation = useMutation({
    mutationFn: async (userData: typeof newUser) => {
      const res = await apiRequest("POST", `/api/client-profiles/${clientProfileId}/invite`, userData);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Team member invited",
        description: "The new team member has been added to your company.",
      });
      setNewUser({ username: "", email: "", phone: "", password: "" });
      setInviteDialogOpen(false);
      refetchTeam();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to invite team member",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (profileData: typeof companyInfo) => {
      const res = await apiRequest("PATCH", `/api/client-profiles/${clientProfileId}`, profileData);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Company profile updated",
        description: "Your company information has been saved.",
      });
      setProfileDialogOpen(false);
      refetchProfile();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update profile",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const toggleUserStatusMutation = useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      const res = await apiRequest("PATCH", `/api/users/${userId}`, { isActive });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "User status updated",
        description: "The team member's status has been changed.",
      });
      refetchTeam();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update user status",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async (userData: typeof editUserData & { userId: string }) => {
      const { userId, ...data } = userData;
      const res = await apiRequest("PATCH", `/api/users/${userId}`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "User updated",
        description: "The team member's information has been saved.",
      });
      setEditUserDialogOpen(false);
      setEditingUser(null);
      queryClient.invalidateQueries({ queryKey: ["/api/client-profiles", clientProfileId, "team"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update user",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("DELETE", `/api/client-profiles/${clientProfileId}/team/${userId}`);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "User removed",
        description: "The team member has been removed from your company.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/client-profiles", clientProfileId, "team"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to remove user",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setEditUserData({
      username: user.username || "",
      email: user.email || "",
      phone: user.phone || "",
    });
    setEditUserDialogOpen(true);
  };

  if (userLoading || profileLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      </div>
    );
  }

  if (currentUser?.role !== "client") {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <Card className="max-w-md">
            <CardContent className="p-6 text-center">
              <p className="text-gray-600">This page is only accessible to client users.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!clientProfile) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <Card className="max-w-md">
            <CardContent className="p-6 text-center">
              <p className="text-gray-600">No company profile found. Please contact support.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header />
      <main className="flex-1 p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900" data-testid="text-page-title">
                Company Team
              </h1>
              <p className="text-gray-500 mt-1">Manage your company profile and team members</p>
            </div>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-4">
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                Company Information
              </CardTitle>
              {isPrimaryClient && (
                <Dialog open={profileDialogOpen} onOpenChange={setProfileDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" data-testid="button-edit-company">
                      <Pencil className="w-4 h-4 mr-2" />
                      Edit
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Edit Company Information</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div>
                        <Label htmlFor="companyName">Company Name</Label>
                        <Input
                          id="companyName"
                          value={companyInfo.companyName}
                          onChange={(e) => setCompanyInfo({ ...companyInfo, companyName: e.target.value })}
                          placeholder="Your company name"
                          data-testid="input-company-name"
                        />
                      </div>
                      <div>
                        <Label htmlFor="industry">Market Segment</Label>
                        <Input
                          id="industry"
                          value={companyInfo.industry}
                          onChange={(e) => setCompanyInfo({ ...companyInfo, industry: e.target.value })}
                          placeholder="e.g., Apparel, Promotional Products"
                          data-testid="input-industry"
                        />
                      </div>
                      <div>
                        <Label htmlFor="website">Website</Label>
                        <Input
                          id="website"
                          value={companyInfo.website}
                          onChange={(e) => setCompanyInfo({ ...companyInfo, website: e.target.value })}
                          placeholder="https://yourcompany.com"
                          data-testid="input-website"
                        />
                      </div>
                      <div>
                        <Label htmlFor="companyPhone">Phone</Label>
                        <Input
                          id="companyPhone"
                          value={companyInfo.phone}
                          onChange={(e) => setCompanyInfo({ ...companyInfo, phone: e.target.value })}
                          placeholder="(555) 123-4567"
                          data-testid="input-company-phone"
                        />
                      </div>
                      <div>
                        <Label htmlFor="address">Address</Label>
                        <Input
                          id="address"
                          value={companyInfo.address}
                          onChange={(e) => setCompanyInfo({ ...companyInfo, address: e.target.value })}
                          placeholder="123 Main St, City, State 12345"
                          data-testid="input-address"
                        />
                      </div>
                      <Button
                        className="w-full"
                        onClick={() => updateProfileMutation.mutate(companyInfo)}
                        disabled={updateProfileMutation.isPending}
                        data-testid="button-save-company"
                      >
                        {updateProfileMutation.isPending ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Save className="w-4 h-4 mr-2" />
                        )}
                        Save Changes
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Company Name</p>
                  <p className="font-medium" data-testid="text-company-name">
                    {clientProfile.companyName || "Not set"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Market Segment</p>
                  <p className="font-medium" data-testid="text-industry">
                    {clientProfile.industry || "Not set"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Website</p>
                  <p className="font-medium" data-testid="text-website">
                    {clientProfile.website || "Not set"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Phone</p>
                  <p className="font-medium" data-testid="text-phone">
                    {clientProfile.phone || "Not set"}
                  </p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-sm text-gray-500">Address</p>
                  <p className="font-medium" data-testid="text-address">
                    {clientProfile.address || "Not set"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-4">
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Team Members ({teamMembers.length})
              </CardTitle>
              {isPrimaryClient && (
                <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" data-testid="button-invite-member">
                      <UserPlus className="w-4 h-4 mr-2" />
                      Invite Team Member
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Invite Team Member</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div>
                        <Label htmlFor="username">Name</Label>
                        <Input
                          id="username"
                          value={newUser.username}
                          onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                          placeholder="Full name"
                          data-testid="input-new-username"
                        />
                      </div>
                      <div>
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          value={newUser.email}
                          onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                          placeholder="email@example.com"
                          data-testid="input-new-email"
                        />
                      </div>
                      <div>
                        <Label htmlFor="phone">Phone</Label>
                        <Input
                          id="phone"
                          value={newUser.phone}
                          onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })}
                          placeholder="(555) 123-4567"
                          data-testid="input-new-phone"
                        />
                      </div>
                      <div>
                        <Label htmlFor="password">Password</Label>
                        <Input
                          id="password"
                          type="password"
                          value={newUser.password}
                          onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                          placeholder="Initial password"
                          data-testid="input-new-password"
                        />
                      </div>
                      <Button
                        className="w-full"
                        onClick={() => inviteTeamMemberMutation.mutate(newUser)}
                        disabled={inviteTeamMemberMutation.isPending || !newUser.username || !newUser.password}
                        data-testid="button-send-invite"
                      >
                        {inviteTeamMemberMutation.isPending ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <UserPlus className="w-4 h-4 mr-2" />
                        )}
                        Send Invitation
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </CardHeader>
            <CardContent>
              {teamLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
              ) : teamMembers.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No team members yet. Invite someone to get started.
                </div>
              ) : (
                <div className="divide-y">
                  {teamMembers.map((member) => {
                    const isPrimary = member.id === clientProfile?.primaryUserId;
                    const isSelf = member.id === currentUser?.id;
                    return (
                      <div
                        key={member.id}
                        className="flex items-center justify-between gap-4 py-4"
                        data-testid={`row-team-member-${member.id}`}
                      >
                        <div className="flex items-center gap-3">
                          {isPrimaryClient && !isSelf && (
                            <Switch
                              checked={member.isActive ?? true}
                              onCheckedChange={(checked) =>
                                toggleUserStatusMutation.mutate({ userId: member.id, isActive: checked })
                              }
                              data-testid={`switch-member-status-${member.id}`}
                            />
                          )}
                          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                            <span className="text-blue-700 font-medium text-sm">
                              {member.username?.charAt(0).toUpperCase() || "?"}
                            </span>
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium" data-testid={`text-member-name-${member.id}`}>
                                {member.username}
                              </span>
                              {isSelf && (
                                <Badge variant="outline">You</Badge>
                              )}
                            </div>
                            <p className="text-sm text-gray-500">{member.email || "No email"}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                          <Badge variant={isPrimary ? "default" : "secondary"}>
                            {isPrimary && <Crown className="w-3 h-3 mr-1" />}
                            {member.role === "client" ? (isPrimary ? "Admin" : "Member") : member.role}
                          </Badge>
                          <span className="text-sm text-gray-500" data-testid={`text-created-${member.id}`}>
                            {member.createdAt ? format(new Date(member.createdAt), "MMM d, yyyy") : "N/A"}
                          </span>
                          <span className="text-sm text-gray-500" data-testid={`text-last-login-${member.id}`}>
                            {member.lastLoginAt ? format(new Date(member.lastLoginAt), "MMM d, yyyy") : "Never"}
                          </span>
                          {isPrimaryClient && !isSelf && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleEditUser(member)}
                                data-testid={`button-edit-member-${member.id}`}
                              >
                                <Pencil className="w-4 h-4 mr-1" />
                                Edit
                              </Button>
                              {!isPrimary && (
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => deleteUserMutation.mutate(member.id)}
                                  disabled={deleteUserMutation.isPending}
                                  data-testid={`button-delete-member-${member.id}`}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Dialog open={editUserDialogOpen} onOpenChange={setEditUserDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Team Member</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <Label htmlFor="editUsername">Name</Label>
                  <Input
                    id="editUsername"
                    value={editUserData.username}
                    onChange={(e) => setEditUserData({ ...editUserData, username: e.target.value })}
                    placeholder="Full name"
                    data-testid="input-edit-username"
                  />
                </div>
                <div>
                  <Label htmlFor="editEmail">Email</Label>
                  <Input
                    id="editEmail"
                    type="email"
                    value={editUserData.email}
                    onChange={(e) => setEditUserData({ ...editUserData, email: e.target.value })}
                    placeholder="email@example.com"
                    data-testid="input-edit-email"
                  />
                </div>
                <div>
                  <Label htmlFor="editPhone">Phone</Label>
                  <Input
                    id="editPhone"
                    value={editUserData.phone}
                    onChange={(e) => setEditUserData({ ...editUserData, phone: e.target.value })}
                    placeholder="(555) 123-4567"
                    data-testid="input-edit-phone"
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={() => editingUser && updateUserMutation.mutate({ ...editUserData, userId: editingUser.id })}
                  disabled={updateUserMutation.isPending || !editUserData.username}
                  data-testid="button-save-user"
                >
                  {updateUserMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  Save Changes
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </main>
    </div>
  );
}
