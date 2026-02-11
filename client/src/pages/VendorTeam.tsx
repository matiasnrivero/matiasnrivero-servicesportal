import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
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
import { useToast } from "@/hooks/use-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { format } from "date-fns";
import { Building2, Users, UserPlus, Save, LogIn, Pencil, Trash2, Loader2 } from "lucide-react";
import type { User, VendorProfile as VendorProfileType } from "@shared/schema";

const roleLabels: Record<string, string> = {
  vendor: "Vendor Admin",
  vendor_designer: "Vendor Designer",
};

async function getDefaultUser(): Promise<User | null> {
  const res = await fetch("/api/default-user");
  if (!res.ok) return null;
  const data = await res.json();
  return { ...data, id: data.userId };
}

export default function VendorTeam() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [newUser, setNewUser] = useState({
    username: "",
    email: "",
    phone: "",
    password: "",
    role: "vendor_designer" as string,
  });

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({
    username: "",
    email: "",
    phone: "",
  });

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [memberToDelete, setMemberToDelete] = useState<User | null>(null);

  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({
    companyName: "",
    website: "",
    email: "",
    phone: "",
  });

  const { data: currentUser, isLoading: userLoading } = useQuery<User | null>({
    queryKey: ["/api/default-user"],
    queryFn: getDefaultUser,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const vendorUserId = currentUser?.role === "vendor" ? currentUser.id : undefined;

  const { data: vendorProfile, isLoading: profileLoading, refetch: refetchProfile } = useQuery<VendorProfileType | null>({
    queryKey: ["/api/vendor-profiles/user", vendorUserId],
    queryFn: async ({ queryKey }) => {
      const userId = queryKey[1] as string | undefined;
      if (!userId) return null;
      const res = await fetch(`/api/vendor-profiles/user/${userId}`);
      if (!res.ok) return null;
      return res.json();
    },
    refetchOnMount: "always",
    staleTime: 0,
  });

  useEffect(() => {
    if (currentUser?.id && currentUser.role === "vendor") {
      refetchProfile();
    }
  }, [currentUser?.id, currentUser?.role, refetchProfile]);

  const vendorStructureId = currentUser?.vendorId || currentUser?.id;

  const { data: teamMembers = [], isLoading: teamLoading, refetch: refetchTeam } = useQuery<User[]>({
    queryKey: ["/api/users/vendor", vendorStructureId],
    queryFn: async () => {
      if (!vendorStructureId) return [];
      const res = await fetch(`/api/users/vendor/${vendorStructureId}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!vendorStructureId,
    refetchOnMount: true,
    staleTime: 0,
  });

  useEffect(() => {
    if (vendorStructureId) {
      refetchTeam();
    }
  }, [vendorStructureId, refetchTeam]);

  useEffect(() => {
    if (vendorProfile) {
      setProfileForm({
        companyName: vendorProfile.companyName || "",
        website: vendorProfile.website || "",
        email: vendorProfile.email || currentUser?.email || "",
        phone: vendorProfile.phone || currentUser?.phone || "",
      });
    }
  }, [vendorProfile, currentUser?.email, currentUser?.phone]);

  const updateProfileMutation = useMutation({
    mutationFn: async (data: any) => {
      if (vendorProfile?.id) {
        return apiRequest("PATCH", `/api/vendor-profiles/${vendorProfile.id}`, data);
      } else if (currentUser?.id) {
        return apiRequest("POST", "/api/vendor-profiles", {
          userId: currentUser.id,
          companyName: profileForm.companyName || currentUser.username,
          ...data,
        });
      } else {
        throw new Error("No user found");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor-profiles/user"] });
      refetchProfile();
      toast({ title: "Profile updated successfully" });
      setProfileDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const createUserMutation = useMutation({
    mutationFn: async (userData: typeof newUser) => {
      return apiRequest("POST", "/api/users", {
        ...userData,
        vendorId: vendorStructureId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/vendor", vendorStructureId] });
      setInviteDialogOpen(false);
      setNewUser({
        username: "",
        email: "",
        phone: "",
        password: "",
        role: "vendor_designer",
      });
      toast({ title: "Team member added successfully" });
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
      queryClient.invalidateQueries({ queryKey: ["/api/users/vendor", vendorStructureId] });
      toast({ title: "User status updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const impersonateMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest("POST", `/api/users/${userId}/impersonate`, {});
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/default-user"] });
      await queryClient.refetchQueries({ queryKey: ["/api/default-user"] });
      toast({ title: "Logged in as team member" });
      setLocation("/service-requests");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const editTeamMemberMutation = useMutation({
    mutationFn: async ({ userId, data }: { userId: string; data: typeof editForm }) => {
      return apiRequest("PATCH", `/api/vendor/users/${userId}`, data);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/vendor", vendorStructureId] });
      if (variables.userId === currentUser?.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/default-user"] });
      }
      setEditDialogOpen(false);
      setEditingMember(null);
      toast({ title: "Team member updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteTeamMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest("DELETE", `/api/users/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/vendor", vendorStructureId] });
      toast({ title: "Team member removed successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleEditMember = (member: User) => {
    setEditingMember(member);
    setEditForm({
      username: member.username,
      email: member.email || "",
      phone: member.phone || "",
    });
    setEditDialogOpen(true);
  };

  const handleSaveEditMember = () => {
    if (!editingMember) return;
    editTeamMemberMutation.mutate({
      userId: editingMember.id,
      data: editForm,
    });
  };

  if (userLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-blue-accent"></div>
        </div>
      </div>
    );
  }

  if (!currentUser || currentUser.role !== "vendor") {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="p-8">
          <div className="max-w-4xl mx-auto text-center py-12">
            <Building2 className="h-16 w-16 text-dark-gray mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-dark-blue-night mb-2">
              Vendor Access Required
            </h2>
            <p className="text-dark-gray">
              This page is only accessible to Vendor users.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (profileLoading || teamLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-blue-accent"></div>
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
                Vendor Team
              </h1>
              <p className="text-gray-500 mt-1">Manage your team members and roles</p>
            </div>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center gap-4 space-y-0 pb-4">
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                Company Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-start justify-between gap-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 flex-1">
                  <div>
                    <p className="text-sm text-gray-500">Company Name</p>
                    <p className="font-medium" data-testid="text-company-name">
                      {vendorProfile?.companyName || "Not set"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Website</p>
                    <p className="font-medium break-all" data-testid="text-website">
                      {vendorProfile?.website || "Not set"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Email</p>
                    <p className="font-medium" data-testid="text-email">
                      {vendorProfile?.email || currentUser?.email || "Not set"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Phone</p>
                    <p className="font-medium" data-testid="text-phone">
                      {vendorProfile?.phone || currentUser?.phone || "Not set"}
                    </p>
                  </div>
                </div>
                <Dialog open={profileDialogOpen} onOpenChange={setProfileDialogOpen}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="icon" data-testid="button-edit-company">
                          <Pencil className="w-4 h-4" />
                        </Button>
                      </DialogTrigger>
                    </TooltipTrigger>
                    <TooltipContent>Edit</TooltipContent>
                  </Tooltip>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Edit Company Information</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div>
                        <Label htmlFor="companyName">Company Name</Label>
                        <Input
                          id="companyName"
                          value={profileForm.companyName}
                          onChange={(e) => setProfileForm({ ...profileForm, companyName: e.target.value })}
                          placeholder="Your company name"
                          data-testid="input-company-name"
                        />
                      </div>
                      <div>
                        <Label htmlFor="website">Website</Label>
                        <Input
                          id="website"
                          value={profileForm.website}
                          onChange={(e) => setProfileForm({ ...profileForm, website: e.target.value })}
                          placeholder="https://yourcompany.com"
                          data-testid="input-website"
                        />
                      </div>
                      <div>
                        <Label htmlFor="companyEmail">Email</Label>
                        <Input
                          id="companyEmail"
                          value={profileForm.email}
                          onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                          placeholder="email@company.com"
                          data-testid="input-email"
                        />
                      </div>
                      <div>
                        <Label htmlFor="companyPhone">Phone</Label>
                        <Input
                          id="companyPhone"
                          value={profileForm.phone}
                          onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                          placeholder="(555) 123-4567"
                          data-testid="input-company-phone"
                        />
                      </div>
                      <Button
                        className="w-full"
                        onClick={() => updateProfileMutation.mutate(profileForm)}
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
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Team Members
              </CardTitle>
              <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" data-testid="button-invite-team">
                    <UserPlus className="h-4 w-4 mr-2" />
                    Add Team Member
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Add Team Member</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 mt-4">
                    <div className="space-y-2">
                      <Label>Username<span className="text-destructive">*</span></Label>
                      <Input
                        value={newUser.username}
                        onChange={(e) =>
                          setNewUser({ ...newUser, username: e.target.value })
                        }
                        placeholder="Enter username"
                        data-testid="input-team-username"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input
                        type="email"
                        value={newUser.email}
                        onChange={(e) =>
                          setNewUser({ ...newUser, email: e.target.value })
                        }
                        placeholder="Enter email"
                        data-testid="input-team-email"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Password<span className="text-destructive">*</span></Label>
                      <Input
                        type="password"
                        value={newUser.password}
                        onChange={(e) =>
                          setNewUser({ ...newUser, password: e.target.value })
                        }
                        placeholder="Enter password"
                        data-testid="input-team-password"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Role<span className="text-destructive">*</span></Label>
                      <Select
                        value={newUser.role}
                        onValueChange={(v) => setNewUser({ ...newUser, role: v })}
                      >
                        <SelectTrigger data-testid="select-team-role">
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="vendor">Vendor Admin</SelectItem>
                          <SelectItem value="vendor_designer">Vendor Designer</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex justify-end gap-2 pt-4">
                      <Button
                        variant="outline"
                        onClick={() => setInviteDialogOpen(false)}
                        data-testid="button-cancel-team-invite"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={() => createUserMutation.mutate(newUser)}
                        disabled={createUserMutation.isPending}
                        data-testid="button-confirm-team-invite"
                      >
                        {createUserMutation.isPending ? "Adding..." : "Add Member"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {currentUser && (
                  <div
                    className="flex items-center justify-between p-4 border rounded-md bg-muted/30"
                    data-testid={`row-team-member-${currentUser.id}`}
                  >
                    <div className="flex items-center gap-4">
                      <Switch checked={true} disabled />
                      <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-blue-700 font-medium text-sm">
                          {currentUser.username?.charAt(0).toUpperCase() || "?"}
                        </span>
                      </div>
                      <div>
                        <p className="font-semibold text-dark-blue-night">
                          {currentUser.username}
                        </p>
                        <p className="text-sm text-dark-gray">
                          {currentUser.email || "No email"}
                        </p>
                      </div>
                      <Badge variant="secondary">
                        Vendor Admin
                      </Badge>
                      <Badge variant="outline" className="bg-sky-blue-accent/10 text-sky-blue-accent border-sky-blue-accent/20">
                        Primary
                      </Badge>
                      <span className="text-sm text-dark-gray" data-testid={`text-created-${currentUser.id}`}>
                        {currentUser.createdAt ? format(new Date(currentUser.createdAt), "MMM d, yyyy") : "N/A"}
                      </span>
                      <span className="text-sm text-dark-gray" data-testid={`text-last-login-${currentUser.id}`}>
                        {currentUser.lastLoginAt ? format(new Date(currentUser.lastLoginAt), "MMM d, yyyy") : "Never"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleEditMember(currentUser)}
                            data-testid={`button-edit-member-${currentUser.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Edit</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                )}
                {teamMembers.filter(m => m.id !== currentUser?.id).length === 0 ? (
                  <p className="text-dark-gray text-center py-8">
                    No team members yet. Add your first team member above.
                  </p>
                ) : (
                  teamMembers.filter(m => m.id !== currentUser?.id).map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between p-4 border rounded-md"
                      data-testid={`row-team-member-${member.id}`}
                    >
                      <div className="flex items-center gap-4">
                        <Switch
                          id={`toggle-team-${member.id}`}
                          checked={member.isActive}
                          onCheckedChange={(checked) =>
                            toggleUserActiveMutation.mutate({
                              userId: member.id,
                              isActive: checked,
                            })
                          }
                          data-testid={`switch-team-active-${member.id}`}
                        />
                        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-blue-700 font-medium text-sm">
                            {member.username?.charAt(0).toUpperCase() || "?"}
                          </span>
                        </div>
                        <div>
                          <p className="font-semibold text-dark-blue-night">
                            {member.username}
                          </p>
                          <p className="text-sm text-dark-gray">
                            {member.email || "No email"}
                          </p>
                        </div>
                        <Badge variant="secondary">
                          {roleLabels[member.role] || member.role}
                        </Badge>
                        {!member.isActive && (
                          <Badge
                            variant="outline"
                            className="bg-destructive/10 text-destructive border-destructive/20"
                          >
                            Inactive
                          </Badge>
                        )}
                        <span className="text-sm text-dark-gray" data-testid={`text-created-${member.id}`}>
                          {member.createdAt ? format(new Date(member.createdAt), "MMM d, yyyy") : "N/A"}
                        </span>
                        <span className="text-sm text-dark-gray" data-testid={`text-last-login-${member.id}`}>
                          {member.lastLoginAt ? format(new Date(member.lastLoginAt), "MMM d, yyyy") : "Never"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => impersonateMutation.mutate(member.id)}
                              disabled={!member.isActive || impersonateMutation.isPending}
                              data-testid={`button-login-as-${member.id}`}
                            >
                              <LogIn className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Login as</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleEditMember(member)}
                              data-testid={`button-edit-member-${member.id}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Edit</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                setMemberToDelete(member);
                                setDeleteModalOpen(true);
                              }}
                              data-testid={`button-delete-member-${member.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Delete</TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Team Member</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Username<span className="text-destructive">*</span></Label>
                  <Input
                    value={editForm.username}
                    onChange={(e) =>
                      setEditForm({ ...editForm, username: e.target.value })
                    }
                    placeholder="Enter username"
                    data-testid="input-edit-username"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={editForm.email}
                    onChange={(e) =>
                      setEditForm({ ...editForm, email: e.target.value })
                    }
                    placeholder="Enter email"
                    data-testid="input-edit-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input
                    value={editForm.phone}
                    onChange={(e) =>
                      setEditForm({ ...editForm, phone: e.target.value })
                    }
                    placeholder="Enter phone"
                    data-testid="input-edit-phone"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => setEditDialogOpen(false)}
                    data-testid="button-cancel-edit-member"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSaveEditMember}
                    disabled={editTeamMemberMutation.isPending || !editForm.username.trim()}
                    data-testid="button-save-edit-member"
                  >
                    {editTeamMemberMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </main>

      <AlertDialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Team Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {memberToDelete?.username} from your team? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (memberToDelete) {
                  deleteTeamMemberMutation.mutate(memberToDelete.id);
                }
                setDeleteModalOpen(false);
                setMemberToDelete(null);
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
