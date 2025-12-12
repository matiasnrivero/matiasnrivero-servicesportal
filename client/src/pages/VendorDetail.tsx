import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Building2, Users, DollarSign, Clock, UserPlus, Save, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import type { User, VendorProfile as VendorProfileType } from "@shared/schema";

const serviceTypes = [
  "Custom Artwork",
  "Embroidery Digitization",
  "Vector Conversion",
  "Name/Number Assignment",
  "Dye Sublimation Template",
  "Color Separation",
  "Mock-up Creation",
  "Size Chart Creation",
  "Photo Editing",
  "Store Creation",
  "Creative Art",
  "Templates",
];

const roleLabels: Record<string, string> = {
  vendor: "Vendor Admin",
  vendor_designer: "Vendor Designer",
};

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

export default function VendorDetail() {
  const { toast } = useToast();
  const params = useParams<{ id: string }>();
  const vendorId = params.id;
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [newUser, setNewUser] = useState({
    username: "",
    email: "",
    phone: "",
    password: "",
    role: "vendor_designer" as string,
  });

  const { data: currentUser } = useQuery<UserSession | null>({
    queryKey: ["/api/default-user"],
    queryFn: getDefaultUser,
  });

  const { data: vendorUser, isLoading: userLoading } = useQuery<User | null>({
    queryKey: ["/api/users", vendorId],
    queryFn: async () => {
      if (!vendorId) return null;
      const res = await fetch(`/api/users/${vendorId}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!vendorId,
  });

  const { data: vendorProfile, isLoading: profileLoading } = useQuery<VendorProfileType | null>({
    queryKey: ["/api/vendor-profiles/user", vendorId],
    queryFn: async () => {
      if (!vendorId) return null;
      const res = await fetch(`/api/vendor-profiles/user/${vendorId}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!vendorId,
  });

  const { data: teamMembers = [], isLoading: teamLoading } = useQuery<User[]>({
    queryKey: ["/api/users/vendor", vendorId],
    queryFn: async () => {
      if (!vendorId) return [];
      const res = await fetch(`/api/users/vendor/${vendorId}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!vendorId,
  });

  const [profileForm, setProfileForm] = useState({
    companyName: "",
    website: "",
  });

  const [pricingData, setPricingData] = useState<Record<string, {
    basePrice: number;
    complexity?: { basic?: number; standard?: number; advanced?: number; premium?: number };
    variablePricing?: { perProduct?: number };
    extras?: { vectorization?: number };
  }>>({});

  const [slaData, setSlaData] = useState<Record<string, { days: number; hours?: number }>>({});

  useEffect(() => {
    if (vendorProfile) {
      setProfileForm({
        companyName: vendorProfile.companyName || "",
        website: vendorProfile.website || "",
      });
      setPricingData((vendorProfile.pricingAgreements as any) || {});
      setSlaData((vendorProfile.slaConfig as any) || {});
    }
  }, [vendorProfile]);

  const updateProfileMutation = useMutation({
    mutationFn: async (data: any) => {
      if (!vendorProfile?.id) throw new Error("No profile found");
      return apiRequest("PATCH", `/api/vendor-profiles/${vendorProfile.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor-profiles/user"] });
      toast({ title: "Profile updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const createUserMutation = useMutation({
    mutationFn: async (userData: typeof newUser) => {
      return apiRequest("POST", "/api/users", {
        ...userData,
        vendorId: vendorId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/vendor"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/users/vendor"] });
      toast({ title: "User status updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleSaveProfile = () => {
    updateProfileMutation.mutate({
      ...profileForm,
      pricingAgreements: pricingData,
      slaConfig: slaData,
    });
  };

  const handlePricingChange = (serviceType: string, field: string, value: number) => {
    setPricingData((prev) => ({
      ...prev,
      [serviceType]: {
        ...(prev[serviceType] || {}),
        [field]: value,
      },
    }));
  };

  const handleComplexityChange = (
    serviceType: string,
    level: string,
    value: number
  ) => {
    setPricingData((prev) => ({
      ...prev,
      [serviceType]: {
        ...(prev[serviceType] || {}),
        complexity: {
          ...(prev[serviceType]?.complexity || {}),
          [level]: value,
        },
      },
    }));
  };

  const handleSlaChange = (serviceType: string, field: "days" | "hours", value: number) => {
    setSlaData((prev) => ({
      ...prev,
      [serviceType]: {
        ...(prev[serviceType] || { days: 0 }),
        [field]: value,
      },
    }));
  };

  const isAdmin = currentUser?.role === "admin";

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="p-8">
          <div className="max-w-4xl mx-auto text-center py-12">
            <Building2 className="h-16 w-16 text-dark-gray mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-dark-blue-night mb-2">
              Admin Access Required
            </h2>
            <p className="text-dark-gray">
              This page is only accessible to Admin users.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (userLoading || profileLoading || teamLoading) {
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
    <div className="min-h-screen bg-background">
      <Header />
      <div className="p-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-4 mb-6">
            <Link href="/vendors">
              <Button variant="ghost" size="icon" data-testid="button-back-vendors">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <Building2 className="h-8 w-8 text-sky-blue-accent" />
            <h1 className="font-title-semibold text-dark-blue-night text-2xl">
              {vendorProfile?.companyName || vendorUser?.username || "Vendor Profile"}
            </h1>
            {!vendorUser?.isActive && (
              <Badge
                variant="outline"
                className="bg-destructive/10 text-destructive border-destructive/20"
              >
                Inactive
              </Badge>
            )}
          </div>

          <Tabs defaultValue="profile" className="space-y-6">
            <TabsList>
              <TabsTrigger value="profile" data-testid="tab-profile">
                <Building2 className="h-4 w-4 mr-2" />
                Profile
              </TabsTrigger>
              <TabsTrigger value="team" data-testid="tab-team">
                <Users className="h-4 w-4 mr-2" />
                Team
              </TabsTrigger>
              <TabsTrigger value="pricing" data-testid="tab-pricing">
                <DollarSign className="h-4 w-4 mr-2" />
                Pricing
              </TabsTrigger>
              <TabsTrigger value="sla" data-testid="tab-sla">
                <Clock className="h-4 w-4 mr-2" />
                SLA
              </TabsTrigger>
            </TabsList>

            <TabsContent value="profile">
              <Card>
                <CardHeader>
                  <CardTitle>Company Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Company Name</Label>
                      <Input
                        value={profileForm.companyName}
                        onChange={(e) =>
                          setProfileForm({ ...profileForm, companyName: e.target.value })
                        }
                        placeholder="Enter company name"
                        data-testid="input-company-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Website</Label>
                      <Input
                        value={profileForm.website}
                        onChange={(e) =>
                          setProfileForm({ ...profileForm, website: e.target.value })
                        }
                        placeholder="https://example.com"
                        data-testid="input-website"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input
                        value={vendorUser?.email || ""}
                        disabled
                        className="bg-muted"
                        data-testid="input-email"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Phone</Label>
                      <Input
                        value={vendorUser?.phone || ""}
                        disabled
                        className="bg-muted"
                        data-testid="input-phone"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end pt-4">
                    <Button
                      onClick={handleSaveProfile}
                      disabled={updateProfileMutation.isPending}
                      data-testid="button-save-profile"
                    >
                      <Save className="h-4 w-4 mr-2" />
                      {updateProfileMutation.isPending ? "Saving..." : "Save Profile"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="team">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2">
                  <CardTitle>Team Members</CardTitle>
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
                    {teamMembers.length === 0 ? (
                      <p className="text-dark-gray text-center py-8">
                        No team members yet.
                      </p>
                    ) : (
                      teamMembers.map((member) => (
                        <div
                          key={member.id}
                          className="flex items-center justify-between p-4 border rounded-md"
                          data-testid={`row-team-member-${member.id}`}
                        >
                          <div className="flex items-center gap-4">
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
                          </div>
                          <div className="flex items-center gap-2">
                            <Label
                              htmlFor={`toggle-team-${member.id}`}
                              className="text-sm text-dark-gray"
                            >
                              Active
                            </Label>
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
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="pricing">
              <Card>
                <CardHeader>
                  <CardTitle>Pricing Agreements</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    {serviceTypes.map((serviceType) => (
                      <div
                        key={serviceType}
                        className="p-4 border rounded-md space-y-4"
                        data-testid={`pricing-section-${serviceType.toLowerCase().replace(/\s+/g, "-")}`}
                      >
                        <h3 className="font-semibold text-dark-blue-night">{serviceType}</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="space-y-2">
                            <Label>Base Price ($)</Label>
                            <Input
                              type="number"
                              value={pricingData[serviceType]?.basePrice || ""}
                              onChange={(e) =>
                                handlePricingChange(
                                  serviceType,
                                  "basePrice",
                                  parseFloat(e.target.value) || 0
                                )
                              }
                              placeholder="0.00"
                              data-testid={`input-base-price-${serviceType.toLowerCase().replace(/\s+/g, "-")}`}
                            />
                          </div>
                          {serviceType === "Creative Art" && (
                            <>
                              <div className="space-y-2">
                                <Label>Basic ($)</Label>
                                <Input
                                  type="number"
                                  value={pricingData[serviceType]?.complexity?.basic || ""}
                                  onChange={(e) =>
                                    handleComplexityChange(
                                      serviceType,
                                      "basic",
                                      parseFloat(e.target.value) || 0
                                    )
                                  }
                                  placeholder="0.00"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Standard ($)</Label>
                                <Input
                                  type="number"
                                  value={pricingData[serviceType]?.complexity?.standard || ""}
                                  onChange={(e) =>
                                    handleComplexityChange(
                                      serviceType,
                                      "standard",
                                      parseFloat(e.target.value) || 0
                                    )
                                  }
                                  placeholder="0.00"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Advanced ($)</Label>
                                <Input
                                  type="number"
                                  value={pricingData[serviceType]?.complexity?.advanced || ""}
                                  onChange={(e) =>
                                    handleComplexityChange(
                                      serviceType,
                                      "advanced",
                                      parseFloat(e.target.value) || 0
                                    )
                                  }
                                  placeholder="0.00"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Premium ($)</Label>
                                <Input
                                  type="number"
                                  value={pricingData[serviceType]?.complexity?.premium || ""}
                                  onChange={(e) =>
                                    handleComplexityChange(
                                      serviceType,
                                      "premium",
                                      parseFloat(e.target.value) || 0
                                    )
                                  }
                                  placeholder="0.00"
                                />
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                    <div className="flex justify-end pt-4">
                      <Button
                        onClick={handleSaveProfile}
                        disabled={updateProfileMutation.isPending}
                        data-testid="button-save-pricing"
                      >
                        <Save className="h-4 w-4 mr-2" />
                        {updateProfileMutation.isPending ? "Saving..." : "Save Pricing"}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="sla">
              <Card>
                <CardHeader>
                  <CardTitle>SLA Configuration</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {serviceTypes.map((serviceType) => (
                      <div
                        key={serviceType}
                        className="flex items-center justify-between p-4 border rounded-md"
                        data-testid={`sla-row-${serviceType.toLowerCase().replace(/\s+/g, "-")}`}
                      >
                        <h3 className="font-semibold text-dark-blue-night min-w-[200px]">
                          {serviceType}
                        </h3>
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            <Label className="text-sm text-dark-gray">Days:</Label>
                            <Input
                              type="number"
                              className="w-20"
                              value={slaData[serviceType]?.days || ""}
                              onChange={(e) =>
                                handleSlaChange(serviceType, "days", parseInt(e.target.value) || 0)
                              }
                              placeholder="0"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <Label className="text-sm text-dark-gray">Hours:</Label>
                            <Input
                              type="number"
                              className="w-20"
                              value={slaData[serviceType]?.hours || ""}
                              onChange={(e) =>
                                handleSlaChange(serviceType, "hours", parseInt(e.target.value) || 0)
                              }
                              placeholder="0"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                    <div className="flex justify-end pt-4">
                      <Button
                        onClick={handleSaveProfile}
                        disabled={updateProfileMutation.isPending}
                        data-testid="button-save-sla"
                      >
                        <Save className="h-4 w-4 mr-2" />
                        {updateProfileMutation.isPending ? "Saving..." : "Save SLA"}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
