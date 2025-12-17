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
import { Building2, Users, DollarSign, Clock, UserPlus, Save, ArrowLeft, CalendarDays, Globe } from "lucide-react";
import { Link } from "wouter";
import type { User, VendorProfile as VendorProfileType, Service, ServicePricingTier } from "@shared/schema";

// Common timezones for vendor availability
const TIMEZONES = [
  { value: "America/Los_Angeles", label: "Pacific Time (PT)", offset: -8 },
  { value: "America/Denver", label: "Mountain Time (MT)", offset: -7 },
  { value: "America/Chicago", label: "Central Time (CT)", offset: -6 },
  { value: "America/New_York", label: "Eastern Time (ET)", offset: -5 },
  { value: "America/Argentina/Buenos_Aires", label: "Argentina (ART)", offset: -3 },
  { value: "UTC", label: "UTC (Coordinated Universal Time)", offset: 0 },
  { value: "Europe/London", label: "London (GMT)", offset: 0 },
  { value: "Europe/Paris", label: "Central European (CET)", offset: 1 },
  { value: "Asia/Karachi", label: "Pakistan (PKT)", offset: 5 },
  { value: "Asia/Kolkata", label: "India (IST)", offset: 5.5 },
  { value: "Asia/Manila", label: "Philippines (PHT)", offset: 8 },
  { value: "Asia/Tokyo", label: "Japan (JST)", offset: 9 },
];

type Holiday = { date: string; title: string; workMode?: string };
type WorkingHours = { timezone: string; startHour: string; endHour: string };

// Helper to convert time from one timezone to US timezones
function convertTimeToUSZones(time: string, fromTimezone: string): { pst: string; mst: string; cst: string; est: string } {
  if (!time) return { pst: "--:--", mst: "--:--", cst: "--:--", est: "--:--" };
  
  const fromTz = TIMEZONES.find(tz => tz.value === fromTimezone);
  if (!fromTz) return { pst: "--:--", mst: "--:--", cst: "--:--", est: "--:--" };
  
  const [hours, minutes] = time.split(":").map(Number);
  const totalMinutes = hours * 60 + minutes;
  
  const utcMinutes = totalMinutes - (fromTz.offset * 60);
  
  const pstMinutes = (utcMinutes + (-8 * 60) + 1440) % 1440;
  const mstMinutes = (utcMinutes + (-7 * 60) + 1440) % 1440;
  const cstMinutes = (utcMinutes + (-6 * 60) + 1440) % 1440;
  const estMinutes = (utcMinutes + (-5 * 60) + 1440) % 1440;
  
  const formatTime = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
  };
  
  return {
    pst: formatTime(pstMinutes),
    mst: formatTime(mstMinutes),
    cst: formatTime(cstMinutes),
    est: formatTime(estMinutes),
  };
}

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

  // Fetch all services from the database
  const { data: allServices = [] } = useQuery<Service[]>({
    queryKey: ["/api/services"],
  });

  // Fetch service pricing tiers for services with multi-price structures
  const [serviceTiers, setServiceTiers] = useState<Record<string, ServicePricingTier[]>>({});

  useEffect(() => {
    const fetchTiers = async () => {
      const tiersMap: Record<string, ServicePricingTier[]> = {};
      for (const service of allServices) {
        if (service.pricingStructure !== "single") {
          try {
            const res = await fetch(`/api/services/${service.id}/tiers`);
            if (res.ok) {
              tiersMap[service.id] = await res.json();
            }
          } catch {
            // ignore fetch errors
          }
        }
      }
      setServiceTiers(tiersMap);
    };
    if (allServices.length > 0) {
      fetchTiers();
    }
  }, [allServices]);

  // Group services by pricing structure
  const singlePriceServices = allServices.filter((s) => s.pricingStructure === "single" || !s.pricingStructure);
  const complexityServices = allServices.filter((s) => s.pricingStructure === "complexity");
  const quantityServices = allServices.filter((s) => s.pricingStructure === "quantity");

  const [profileForm, setProfileForm] = useState({
    companyName: "",
    website: "",
  });

  const [pricingData, setPricingData] = useState<Record<string, {
    basePrice?: number;
    complexity?: Record<string, number>;
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
              <TabsTrigger value="cost" data-testid="tab-cost">
                <DollarSign className="h-4 w-4 mr-2" />
                Cost
              </TabsTrigger>
              <TabsTrigger value="sla" data-testid="tab-sla">
                <Clock className="h-4 w-4 mr-2" />
                SLA
              </TabsTrigger>
              <TabsTrigger value="availability" data-testid="tab-availability">
                <CalendarDays className="h-4 w-4 mr-2" />
                Availability
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
                    {vendorUser && (
                      <div
                        className="flex items-center justify-between p-4 border rounded-md bg-muted/30"
                        data-testid={`row-team-member-${vendorUser.id}`}
                      >
                        <div className="flex items-center gap-4">
                          <div>
                            <p className="font-semibold text-dark-blue-night">
                              {vendorUser.username}
                            </p>
                            <p className="text-sm text-dark-gray">
                              {vendorUser.email || "No email"}
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
                          <Switch checked={vendorUser.isActive} disabled />
                        </div>
                      </div>
                    )}
                    {teamMembers.filter(m => m.id !== vendorUser?.id).length === 0 && !vendorUser ? (
                      <p className="text-dark-gray text-center py-8">
                        No team members yet.
                      </p>
                    ) : (
                      teamMembers.filter(m => m.id !== vendorUser?.id).map((member) => (
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
                  {allServices.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground border rounded-md">
                      No services configured yet. Contact your administrator to set up services.
                    </div>
                  ) : (
                  <div className="space-y-8">
                    {/* Single Price Services */}
                    {singlePriceServices.length > 0 && (
                      <div className="space-y-4">
                        <h3 className="font-semibold text-dark-blue-night">Base Cost Services</h3>
                        {singlePriceServices.map((service) => (
                          <div
                            key={service.id}
                            className="flex items-center justify-between gap-4 p-4 border rounded-md"
                            data-testid={`cost-row-${service.title.toLowerCase().replace(/\s+/g, "-")}`}
                          >
                            <div className="font-medium text-dark-blue-night min-w-[200px]">
                              {service.title}
                            </div>
                            <div className="flex items-center gap-2">
                              <Label className="text-sm text-dark-gray">Base Cost:</Label>
                              <Input
                                type="number"
                                value={pricingData[service.title]?.basePrice || ""}
                                onChange={(e) =>
                                  handlePricingChange(
                                    service.title,
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
                    )}

                    {/* Complexity-based Services */}
                    {complexityServices.length > 0 && (
                      <div className="space-y-4">
                        <h3 className="font-semibold text-dark-blue-night">Complexity-based Services</h3>
                        {complexityServices.map((service) => {
                          const tiers = serviceTiers[service.id] || [];
                          const gridStyle = tiers.length > 0
                            ? { gridTemplateColumns: `minmax(200px, 1fr) repeat(${tiers.length}, 120px)` }
                            : { gridTemplateColumns: "minmax(200px, 1fr) 120px" };
                          
                          return (
                            <div
                              key={service.id}
                              className="grid items-center gap-2 p-4 border rounded-md"
                              style={gridStyle}
                              data-testid={`cost-row-${service.title.toLowerCase().replace(/\s+/g, "-")}`}
                            >
                              <div className="font-medium text-dark-blue-night">
                                {service.title}
                              </div>
                              {tiers.length > 0 ? (
                                tiers.map((tier) => (
                                  <div key={tier.id} className="flex flex-col items-center">
                                    <Label className="text-sm text-dark-gray mb-1">{tier.label}:</Label>
                                    <Input
                                      type="number"
                                      value={pricingData[service.title]?.complexity?.[tier.label] || ""}
                                      onChange={(e) =>
                                        handleComplexityChange(service.title, tier.label, parseFloat(e.target.value) || 0)
                                      }
                                      placeholder="0.00"
                                      className="w-20"
                                    />
                                  </div>
                                ))
                              ) : (
                                <div className="text-sm text-muted-foreground">No tiers configured</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Quantity-based Services */}
                    {quantityServices.length > 0 && (
                      <div className="space-y-4">
                        <h3 className="font-semibold text-dark-blue-night">Quantity-based Services</h3>
                        {quantityServices.map((service) => {
                          const tiers = serviceTiers[service.id] || [];
                          const gridStyle = tiers.length > 0
                            ? { gridTemplateColumns: `minmax(200px, 1fr) repeat(${tiers.length}, 120px)` }
                            : { gridTemplateColumns: "minmax(200px, 1fr) 120px" };
                          
                          return (
                            <div
                              key={service.id}
                              className="grid items-center gap-2 p-4 border rounded-md"
                              style={gridStyle}
                              data-testid={`cost-row-${service.title.toLowerCase().replace(/\s+/g, "-")}`}
                            >
                              <div className="font-medium text-dark-blue-night">
                                {service.title}
                              </div>
                              {tiers.length > 0 ? (
                                tiers.map((tier) => (
                                  <div key={tier.id} className="flex flex-col items-center">
                                    <Label className="text-sm text-dark-gray mb-1">{tier.label}:</Label>
                                    <Input
                                      type="number"
                                      value={pricingData[service.title]?.quantity?.[tier.label] || ""}
                                      onChange={(e) =>
                                        handleQuantityChange(service.title, tier.label, parseFloat(e.target.value) || 0)
                                      }
                                      placeholder="0.00"
                                      className="w-20"
                                    />
                                  </div>
                                ))
                              ) : (
                                <div className="text-sm text-muted-foreground">No tiers configured</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

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
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="sla">
              <Card>
                <CardHeader>
                  <CardTitle>SLA Configuration</CardTitle>
                </CardHeader>
                <CardContent>
                  {allServices.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground border rounded-md">
                      No services configured yet. Contact your administrator to set up services.
                    </div>
                  ) : (
                  <div className="space-y-4">
                    {allServices.map((service) => (
                      <div
                        key={service.id}
                        className="flex items-center justify-between p-4 border rounded-md"
                        data-testid={`sla-row-${service.title.toLowerCase().replace(/\s+/g, "-")}`}
                      >
                        <h3 className="font-semibold text-dark-blue-night min-w-[200px]">
                          {service.title}
                        </h3>
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            <Label className="text-sm text-dark-gray">Days:</Label>
                            <Input
                              type="number"
                              className="w-20"
                              value={slaData[service.title]?.days || ""}
                              onChange={(e) =>
                                handleSlaChange(service.title, "days", parseInt(e.target.value) || 0)
                              }
                              placeholder="0"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <Label className="text-sm text-dark-gray">Hours:</Label>
                            <Input
                              type="number"
                              className="w-20"
                              value={slaData[service.title]?.hours || ""}
                              onChange={(e) =>
                                handleSlaChange(service.title, "hours", parseInt(e.target.value) || 0)
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
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="availability">
              <div className="space-y-6">
                {/* Working Hours Section */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Globe className="h-5 w-5" />
                      Working Hours
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {(() => {
                      const wh = vendorProfile?.workingHours as WorkingHours | null;
                      if (!wh) {
                        return (
                          <p className="text-muted-foreground text-center py-8">
                            No working hours configured yet.
                          </p>
                        );
                      }
                      const tzLabel = TIMEZONES.find(tz => tz.value === wh.timezone)?.label || wh.timezone;
                      return (
                        <>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-2">
                              <Label className="text-sm text-muted-foreground">Time Zone</Label>
                              <p className="font-medium">{tzLabel}</p>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-sm text-muted-foreground">Start Hour</Label>
                              <p className="font-medium">{wh.startHour}</p>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-sm text-muted-foreground">End Hour</Label>
                              <p className="font-medium">{wh.endHour}</p>
                            </div>
                          </div>
                          <div className="mt-4 p-4 bg-muted/50 rounded-md">
                            <Label className="text-sm font-medium mb-3 block">Hours in US Time Zones</Label>
                            <div className="grid grid-cols-4 gap-4">
                              <div className="text-center">
                                <p className="text-xs text-muted-foreground mb-1">PST (Pacific)</p>
                                <p className="font-medium">
                                  {convertTimeToUSZones(wh.startHour, wh.timezone).pst} - {convertTimeToUSZones(wh.endHour, wh.timezone).pst}
                                </p>
                              </div>
                              <div className="text-center">
                                <p className="text-xs text-muted-foreground mb-1">MST (Mountain)</p>
                                <p className="font-medium">
                                  {convertTimeToUSZones(wh.startHour, wh.timezone).mst} - {convertTimeToUSZones(wh.endHour, wh.timezone).mst}
                                </p>
                              </div>
                              <div className="text-center">
                                <p className="text-xs text-muted-foreground mb-1">CST (Central)</p>
                                <p className="font-medium">
                                  {convertTimeToUSZones(wh.startHour, wh.timezone).cst} - {convertTimeToUSZones(wh.endHour, wh.timezone).cst}
                                </p>
                              </div>
                              <div className="text-center">
                                <p className="text-xs text-muted-foreground mb-1">EST (Eastern)</p>
                                <p className="font-medium">
                                  {convertTimeToUSZones(wh.startHour, wh.timezone).est} - {convertTimeToUSZones(wh.endHour, wh.timezone).est}
                                </p>
                              </div>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </CardContent>
                </Card>

                {/* Holidays Section */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CalendarDays className="h-5 w-5" />
                      Holidays / Out of Office Days
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(() => {
                      const holidays = (vendorProfile?.holidays as Holiday[] | null) || [];
                      if (holidays.length === 0) {
                        return (
                          <p className="text-muted-foreground text-center py-8">
                            No holidays configured yet.
                          </p>
                        );
                      }
                      return (
                        <div className="space-y-2">
                          {holidays
                            .sort((a, b) => a.date.localeCompare(b.date))
                            .map((holiday) => (
                              <div
                                key={holiday.date}
                                className="flex items-center gap-4 p-3 border rounded-md"
                                data-testid={`row-holiday-${holiday.date}`}
                              >
                                <Badge variant="outline">
                                  {new Date(holiday.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                </Badge>
                                <span className="font-medium">{holiday.title}</span>
                                <Badge variant={holiday.workMode === "Totally Off" ? "destructive" : holiday.workMode === "Part-Time" ? "secondary" : "default"}>
                                  {holiday.workMode || "Totally Off"}
                                </Badge>
                              </div>
                            ))}
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
