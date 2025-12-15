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
import { Building2, Users, DollarSign, Clock, UserPlus, Save } from "lucide-react";
import type { User, VendorProfile as VendorProfileType, Service } from "@shared/schema";

const BASE_COST_SERVICES = [
  { name: "Vectorization & Color Separation" },
  { name: "Artwork Touch-Ups (DTF/DTG)" },
  { name: "Embroidery Digitization", subServices: ["Vectorization for Embroidery"] },
  { name: "Artwork Composition" },
  { name: "Dye-Sublimation Template" },
  { name: "Store Banner Design" },
  { name: "Flyer Design" },
  { name: "Blank Product - PSD" },
];

const STORE_QUANTITY_TIERS = ["1-50", "51-75", "76-100", ">101"];

const SLA_SERVICES = [
  "Vectorization & Color Separation",
  "Artwork Touch-Ups (DTF/DTG)",
  "Embroidery Digitization",
  "Creative Art",
  "Artwork Composition",
  "Dye-Sublimation Template",
  "Store Creation",
  "Store Banner Design",
  "Flyer Design",
  "Blank Product - PSD",
];

const roleLabels: Record<string, string> = {
  vendor: "Vendor Admin",
  vendor_designer: "Vendor Designer",
};

async function getDefaultUser(): Promise<User | null> {
  const res = await fetch("/api/default-user");
  if (!res.ok) return null;
  const data = await res.json();
  // Map userId to id for consistency with User type
  return { ...data, id: data.userId };
}

export default function VendorProfile() {
  const { toast } = useToast();
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [newUser, setNewUser] = useState({
    username: "",
    email: "",
    phone: "",
    password: "",
    role: "vendor_designer" as string,
  });

  const { data: currentUser } = useQuery<User | null>({
    queryKey: ["/api/default-user"],
    queryFn: getDefaultUser,
  });

  const { data: vendorProfile, isLoading: profileLoading } = useQuery<VendorProfileType | null>({
    queryKey: ["/api/vendor-profiles/user", currentUser?.id],
    queryFn: async () => {
      if (!currentUser?.id) return null;
      const res = await fetch(`/api/vendor-profiles/user/${currentUser.id}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!currentUser?.id && currentUser.role === "vendor",
  });

  const vendorStructureId = currentUser?.vendorId || currentUser?.id;

  const { data: teamMembers = [], isLoading: teamLoading } = useQuery<User[]>({
    queryKey: ["/api/users/vendor", vendorStructureId],
    queryFn: async () => {
      if (!vendorStructureId) return [];
      const res = await fetch(`/api/users/vendor/${vendorStructureId}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!vendorStructureId,
  });

  const [profileForm, setProfileForm] = useState({
    companyName: "",
    website: "",
  });

  const [pricingData, setPricingData] = useState<Record<string, {
    basePrice?: number;
    complexity?: { basic?: number; standard?: number; advanced?: number; ultimate?: number };
    quantity?: Record<string, number>;
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

  const handleQuantityChange = (
    serviceType: string,
    tier: string,
    value: number
  ) => {
    setPricingData((prev) => ({
      ...prev,
      [serviceType]: {
        ...(prev[serviceType] || {}),
        quantity: {
          ...(prev[serviceType]?.quantity || {}),
          [tier]: value,
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
    <div className="min-h-screen bg-background">
      <Header />
      <div className="p-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <Building2 className="h-8 w-8 text-sky-blue-accent" />
            <h1 className="font-title-semibold text-dark-blue-night text-2xl">
              Vendor Profile
            </h1>
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
            <TabsTrigger value="cost" data-testid="tab-cost">
              <DollarSign className="h-4 w-4 mr-2" />
              Cost
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
                      value={currentUser.email || ""}
                      disabled
                      className="bg-muted"
                      data-testid="input-email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <Input
                      value={currentUser.phone || ""}
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
                  {currentUser && (
                    <div
                      className="flex items-center justify-between p-4 border rounded-md bg-muted/30"
                      data-testid={`row-team-member-${currentUser.id}`}
                    >
                      <div className="flex items-center gap-4">
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
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-sm text-dark-gray">Active</Label>
                        <Switch checked={currentUser.isActive} disabled />
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

          <TabsContent value="cost">
            <Card>
              <CardHeader>
                <CardTitle>Cost Agreements</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-8">
                  <div className="space-y-4">
                    <h3 className="font-semibold text-dark-blue-night">Base Cost Services</h3>
                    {BASE_COST_SERVICES.map((service) => (
                      <div key={service.name}>
                        <div
                          className="flex items-center justify-between gap-4 p-4 border rounded-md"
                          data-testid={`cost-row-${service.name.toLowerCase().replace(/\s+/g, "-")}`}
                        >
                          <div className="font-medium text-dark-blue-night min-w-[200px]">
                            {service.name}
                          </div>
                          <div className="flex items-center gap-2">
                            <Label className="text-sm text-dark-gray">Base Cost:</Label>
                            <Input
                              type="number"
                              value={pricingData[service.name]?.basePrice || ""}
                              onChange={(e) =>
                                handlePricingChange(
                                  service.name,
                                  "basePrice",
                                  parseFloat(e.target.value) || 0
                                )
                              }
                              placeholder="0.00"
                              className="w-24"
                            />
                          </div>
                        </div>
                        {service.subServices?.map((subService) => (
                          <div
                            key={subService}
                            className="flex items-center justify-between gap-4 p-4 border rounded-md mt-2"
                            data-testid={`cost-row-${subService.toLowerCase().replace(/\s+/g, "-")}`}
                          >
                            <div className="font-medium text-dark-blue-night min-w-[200px]">
                              {subService}
                            </div>
                            <div className="flex items-center gap-2">
                              <Label className="text-sm text-dark-gray">Base Cost:</Label>
                              <Input
                                type="number"
                                value={pricingData[subService]?.basePrice || ""}
                                onChange={(e) =>
                                  handlePricingChange(
                                    subService,
                                    "basePrice",
                                    parseFloat(e.target.value) || 0
                                  )
                                }
                                placeholder="0.00"
                                className="w-24"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-semibold text-dark-blue-night">Creative Art (Complexity-based)</h3>
                    <div
                      className="grid grid-cols-[minmax(200px,1fr)_repeat(4,120px)] items-center gap-2 p-4 border rounded-md"
                      data-testid="cost-row-creative-art"
                    >
                      <div className="font-medium text-dark-blue-night">
                        Creative Art
                      </div>
                      <div className="flex flex-col items-center">
                        <Label className="text-sm text-dark-gray mb-1">Basic:</Label>
                        <Input
                          type="number"
                          value={pricingData["Creative Art"]?.complexity?.basic || ""}
                          onChange={(e) =>
                            handleComplexityChange("Creative Art", "basic", parseFloat(e.target.value) || 0)
                          }
                          placeholder="0.00"
                          className="w-20"
                        />
                      </div>
                      <div className="flex flex-col items-center">
                        <Label className="text-sm text-dark-gray mb-1">Standard:</Label>
                        <Input
                          type="number"
                          value={pricingData["Creative Art"]?.complexity?.standard || ""}
                          onChange={(e) =>
                            handleComplexityChange("Creative Art", "standard", parseFloat(e.target.value) || 0)
                          }
                          placeholder="0.00"
                          className="w-20"
                        />
                      </div>
                      <div className="flex flex-col items-center">
                        <Label className="text-sm text-dark-gray mb-1">Advance:</Label>
                        <Input
                          type="number"
                          value={pricingData["Creative Art"]?.complexity?.advanced || ""}
                          onChange={(e) =>
                            handleComplexityChange("Creative Art", "advanced", parseFloat(e.target.value) || 0)
                          }
                          placeholder="0.00"
                          className="w-20"
                        />
                      </div>
                      <div className="flex flex-col items-center">
                        <Label className="text-sm text-dark-gray mb-1">Ultimate:</Label>
                        <Input
                          type="number"
                          value={pricingData["Creative Art"]?.complexity?.ultimate || ""}
                          onChange={(e) =>
                            handleComplexityChange("Creative Art", "ultimate", parseFloat(e.target.value) || 0)
                          }
                          placeholder="0.00"
                          className="w-20"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-semibold text-dark-blue-night">Store Creation (Quantity-based)</h3>
                    <div
                      className="grid grid-cols-[minmax(200px,1fr)_repeat(4,120px)] items-center gap-2 p-4 border rounded-md"
                      data-testid="cost-row-store-creation"
                    >
                      <div className="font-medium text-dark-blue-night">
                        Store Creation
                      </div>
                      <div className="flex flex-col items-center">
                        <Label className="text-sm text-dark-gray mb-1">1-50:</Label>
                        <Input
                          type="number"
                          value={pricingData["Store Creation"]?.quantity?.["1-50"] || ""}
                          onChange={(e) =>
                            handleQuantityChange("Store Creation", "1-50", parseFloat(e.target.value) || 0)
                          }
                          placeholder="0.00"
                          className="w-20"
                        />
                      </div>
                      <div className="flex flex-col items-center">
                        <Label className="text-sm text-dark-gray mb-1">51-75:</Label>
                        <Input
                          type="number"
                          value={pricingData["Store Creation"]?.quantity?.["51-75"] || ""}
                          onChange={(e) =>
                            handleQuantityChange("Store Creation", "51-75", parseFloat(e.target.value) || 0)
                          }
                          placeholder="0.00"
                          className="w-20"
                        />
                      </div>
                      <div className="flex flex-col items-center">
                        <Label className="text-sm text-dark-gray mb-1">76-100:</Label>
                        <Input
                          type="number"
                          value={pricingData["Store Creation"]?.quantity?.["76-100"] || ""}
                          onChange={(e) =>
                            handleQuantityChange("Store Creation", "76-100", parseFloat(e.target.value) || 0)
                          }
                          placeholder="0.00"
                          className="w-20"
                        />
                      </div>
                      <div className="flex flex-col items-center">
                        <Label className="text-sm text-dark-gray mb-1">&gt;101:</Label>
                        <Input
                          type="number"
                          value={pricingData["Store Creation"]?.quantity?.[">101"] || ""}
                          onChange={(e) =>
                            handleQuantityChange("Store Creation", ">101", parseFloat(e.target.value) || 0)
                          }
                          placeholder="0.00"
                          className="w-20"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end pt-4">
                    <Button
                      onClick={handleSaveProfile}
                      disabled={updateProfileMutation.isPending}
                      data-testid="button-save-cost"
                    >
                      <Save className="h-4 w-4 mr-2" />
                      {updateProfileMutation.isPending ? "Saving..." : "Save Cost"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sla">
            <Card>
              <CardHeader>
                <CardTitle>Service Level Agreements (SLA)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {SLA_SERVICES.map((serviceType) => (
                    <div
                      key={serviceType}
                      className="flex items-center gap-4 p-4 border rounded-md"
                      data-testid={`sla-section-${serviceType.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <div className="flex-1">
                        <p className="font-semibold text-dark-blue-night">{serviceType}</p>
                      </div>
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
                            data-testid={`input-sla-days-${serviceType.toLowerCase().replace(/\s+/g, "-")}`}
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
                            data-testid={`input-sla-hours-${serviceType.toLowerCase().replace(/\s+/g, "-")}`}
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
