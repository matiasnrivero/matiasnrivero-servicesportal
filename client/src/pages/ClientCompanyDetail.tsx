import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link, useLocation, useRoute } from "wouter";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Building2, Users, CreditCard, ArrowLeft, Save, Loader2, Pencil, LogIn } from "lucide-react";
import { format } from "date-fns";
import BillingTab from "@/components/BillingTab";
import type { User, ClientProfile } from "@shared/schema";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type UserSession = {
  userId: string;
  role: string;
  username: string;
};

async function getDefaultUser(): Promise<UserSession | null> {
  const res = await fetch("/api/default-user");
  if (!res.ok) return null;
  return res.json();
}

const roleLabels: Record<string, string> = {
  client: "Client Admin",
  client_member: "Client Member",
};

type ClientProfileWithPrimaryUser = ClientProfile & {
  primaryUser?: {
    id: string;
    username: string;
    email: string | null;
    isActive: boolean;
    lastLoginAt: string | null;
  } | null;
};

export default function ClientCompanyDetail() {
  const { toast } = useToast();
  const params = useParams<{ id: string }>();
  const clientProfileId = params.id;
  const [, setLocation] = useLocation();
  
  // Use explicit route matching for edit mode - derive editMode directly from route
  const [isEditRoute] = useRoute("/client-companies/:id/edit");
  // Use local state for edit mode triggered by button (not from URL)
  const [localEditMode, setLocalEditMode] = useState(false);
  // Combined edit mode: either from URL or from button click
  const editMode = isEditRoute || localEditMode;
  
  const [editMemberDialogOpen, setEditMemberDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<User | null>(null);
  const [editMemberForm, setEditMemberForm] = useState({ username: "", email: "", phone: "" });

  const { data: currentUser } = useQuery<UserSession | null>({
    queryKey: ["/api/default-user"],
    queryFn: getDefaultUser,
  });

  const { data: clientProfile, isLoading: profileLoading } = useQuery<ClientProfileWithPrimaryUser | null>({
    queryKey: ["/api/client-companies", clientProfileId],
    queryFn: async () => {
      if (!clientProfileId) return null;
      const res = await fetch(`/api/client-companies/${clientProfileId}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!clientProfileId,
  });

  // Get primaryUser from enriched clientProfile response
  const primaryUser = clientProfile?.primaryUser || null;

  const { data: teamMembers = [], isLoading: teamLoading } = useQuery<User[]>({
    queryKey: ["/api/client-companies", clientProfileId, "team"],
    queryFn: async () => {
      if (!clientProfileId) return [];
      const res = await fetch(`/api/client-companies/${clientProfileId}/team`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!clientProfileId,
  });

  const [profileForm, setProfileForm] = useState({
    companyName: "",
    website: "",
    phone: "",
  });

  // Initialize form values when profile loads or entering edit mode
  useEffect(() => {
    if ((isEditRoute || localEditMode) && clientProfile) {
      setProfileForm({
        companyName: clientProfile.companyName || "",
        website: clientProfile.website || "",
        phone: clientProfile.phone || "",
      });
    }
  }, [isEditRoute, localEditMode, clientProfile]);
  
  // Reset local edit mode when navigating away from edit route
  useEffect(() => {
    if (!isEditRoute) {
      setLocalEditMode(false);
    }
  }, [isEditRoute]);

  const isAdmin = currentUser?.role === "admin";

  const updateProfileMutation = useMutation({
    mutationFn: async (data: { companyName: string; website: string; phone: string }) => {
      return apiRequest("PATCH", `/api/client-companies/${clientProfileId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/client-companies", clientProfileId] });
      queryClient.invalidateQueries({ queryKey: ["/api/client-companies"] });
      toast({ title: "Company profile updated" });
      setLocalEditMode(false);
      // Navigate back to view mode if on edit route
      if (isEditRoute) {
        setLocation(`/client-companies/${clientProfileId}`);
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMemberMutation = useMutation({
    mutationFn: async ({ userId, data }: { userId: string; data: { username: string; email: string; phone: string } }) => {
      return apiRequest("PATCH", `/api/users/${userId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/client-companies", clientProfileId, "team"] });
      toast({ title: "Team member updated" });
      setEditMemberDialogOpen(false);
      setEditingMember(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const impersonateMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("POST", `/api/users/${userId}/impersonate`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/default-user"] });
      toast({ title: "Now viewing as client" });
      setLocation("/");
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

  const handleSaveMember = () => {
    if (editingMember) {
      updateMemberMutation.mutate({
        userId: editingMember.id,
        data: editMemberForm,
      });
    }
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="p-6">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">This page is only accessible to administrators.</p>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  if (profileLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="p-6">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </main>
      </div>
    );
  }

  if (!clientProfile) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="p-6">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Client company not found</p>
              <Link href="/client-companies">
                <Button variant="outline" className="mt-4">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Client Companies
                </Button>
              </Link>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="p-6">
        <div className="mb-6">
          <Link href="/client-companies">
            <Button variant="ghost" size="sm" className="mb-2">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Client Companies
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <Building2 className="h-8 w-8 text-muted-foreground" />
            <div>
              <h1 className="text-2xl font-bold" data-testid="text-company-name">
                {clientProfile.companyName || "Unnamed Company"}
              </h1>
              <p className="text-muted-foreground">Client Company Details</p>
            </div>
          </div>
        </div>

        <Tabs defaultValue="profile" className="space-y-4">
          <TabsList>
            <TabsTrigger value="profile" data-testid="tab-profile">
              <Building2 className="h-4 w-4 mr-2" />
              Company Profile
            </TabsTrigger>
            <TabsTrigger value="team" data-testid="tab-team">
              <Users className="h-4 w-4 mr-2" />
              Team
            </TabsTrigger>
            <TabsTrigger value="payment" data-testid="tab-payment">
              <CreditCard className="h-4 w-4 mr-2" />
              Payment
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <CardTitle>Company Information</CardTitle>
                {!editMode && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setProfileForm({
                        companyName: clientProfile.companyName || "",
                        website: clientProfile.website || "",
                        phone: clientProfile.phone || "",
                      });
                      setLocalEditMode(true);
                    }}
                    data-testid="button-edit-profile"
                  >
                    <Pencil className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                {editMode ? (
                  <>
                    <div className="space-y-2">
                      <Label>Company Name</Label>
                      <Input
                        value={profileForm.companyName}
                        onChange={(e) => setProfileForm({ ...profileForm, companyName: e.target.value })}
                        data-testid="input-company-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Website</Label>
                      <Input
                        value={profileForm.website}
                        onChange={(e) => setProfileForm({ ...profileForm, website: e.target.value })}
                        placeholder="https://example.com"
                        data-testid="input-website"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Phone</Label>
                      <Input
                        value={profileForm.phone}
                        onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                        placeholder="+1 (555) 000-0000"
                        data-testid="input-phone"
                      />
                    </div>
                    <div className="flex items-center gap-2 pt-4">
                      <Button
                        onClick={() => updateProfileMutation.mutate(profileForm)}
                        disabled={updateProfileMutation.isPending}
                        data-testid="button-save-profile"
                      >
                        {updateProfileMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4 mr-2" />
                        )}
                        Save Changes
                      </Button>
                      <Button variant="outline" onClick={() => {
                        setLocalEditMode(false);
                        // Navigate back to view mode if on edit route
                        if (isEditRoute) {
                          setLocation(`/client-companies/${clientProfileId}`);
                        }
                      }}>
                        Cancel
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Company Name</p>
                      <p className="font-medium">{clientProfile.companyName || "—"}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Website</p>
                      <p className="font-medium">
                        {clientProfile.website ? (
                          <a href={clientProfile.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                            {clientProfile.website}
                          </a>
                        ) : (
                          "—"
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Phone</p>
                      <p className="font-medium">{clientProfile.phone || "—"}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Created</p>
                      <p className="font-medium">
                        {clientProfile.createdAt ? format(new Date(clientProfile.createdAt), "MMM d, yyyy") : "—"}
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="team">
            <Card>
              <CardHeader>
                <CardTitle>Team Members</CardTitle>
              </CardHeader>
              <CardContent>
                {teamLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : teamMembers.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No team members found</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-3 px-2 font-medium text-muted-foreground">Name</th>
                          <th className="text-left py-3 px-2 font-medium text-muted-foreground">Email</th>
                          <th className="text-left py-3 px-2 font-medium text-muted-foreground">Phone</th>
                          <th className="text-left py-3 px-2 font-medium text-muted-foreground">Role</th>
                          <th className="text-left py-3 px-2 font-medium text-muted-foreground">Status</th>
                          <th className="text-right py-3 px-2 font-medium text-muted-foreground">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {teamMembers.map((member) => (
                          <tr key={member.id} className="border-b last:border-0" data-testid={`row-member-${member.id}`}>
                            <td className="py-3 px-2 font-medium">{member.username}</td>
                            <td className="py-3 px-2 text-muted-foreground">{member.email || "—"}</td>
                            <td className="py-3 px-2 text-muted-foreground">{member.phone || "—"}</td>
                            <td className="py-3 px-2">
                              <Badge variant={member.role === "client" ? "default" : "secondary"}>
                                {roleLabels[member.role] || member.role}
                              </Badge>
                              {member.id === clientProfile.primaryUserId && (
                                <Badge variant="outline" className="ml-2">Primary</Badge>
                              )}
                            </td>
                            <td className="py-3 px-2">
                              <Badge variant={member.isActive ? "default" : "secondary"}>
                                {member.isActive ? "Active" : "Inactive"}
                              </Badge>
                            </td>
                            <td className="py-3 px-2">
                              <div className="flex items-center justify-end gap-1">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => impersonateMutation.mutate(member.id)}
                                      disabled={impersonateMutation.isPending}
                                      data-testid={`button-impersonate-member-${member.id}`}
                                    >
                                      <LogIn className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Login as this user</TooltipContent>
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
                                  <TooltipContent>Edit member</TooltipContent>
                                </Tooltip>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payment">
            <BillingTab clientProfileId={clientProfileId!} isPrimaryClient={false} isAdmin={currentUser?.role === "admin"} />
          </TabsContent>
        </Tabs>

        <Dialog open={editMemberDialogOpen} onOpenChange={setEditMemberDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Team Member</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={editMemberForm.username}
                  onChange={(e) => setEditMemberForm({ ...editMemberForm, username: e.target.value })}
                  data-testid="input-edit-member-name"
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={editMemberForm.email}
                  onChange={(e) => setEditMemberForm({ ...editMemberForm, email: e.target.value })}
                  data-testid="input-edit-member-email"
                />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input
                  value={editMemberForm.phone}
                  onChange={(e) => setEditMemberForm({ ...editMemberForm, phone: e.target.value })}
                  data-testid="input-edit-member-phone"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditMemberDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSaveMember}
                disabled={updateMemberMutation.isPending}
                data-testid="button-save-member"
              >
                {updateMemberMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
