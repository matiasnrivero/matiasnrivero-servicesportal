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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Building2, Users, DollarSign, Clock, UserPlus, Save, LogIn, Pencil, CalendarDays, Plus, Trash2, Globe } from "lucide-react";
import { format } from "date-fns";
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

// Helper to convert time from one timezone to US timezones
function convertTimeToUSZones(time: string, fromTimezone: string): { pst: string; cst: string; est: string } {
  if (!time) return { pst: "--:--", cst: "--:--", est: "--:--" };
  
  const fromTz = TIMEZONES.find(tz => tz.value === fromTimezone);
  if (!fromTz) return { pst: "--:--", cst: "--:--", est: "--:--" };
  
  const [hours, minutes] = time.split(":").map(Number);
  const totalMinutes = hours * 60 + minutes;
  
  // Convert from source timezone to UTC, then to US timezones
  const utcMinutes = totalMinutes - (fromTz.offset * 60);
  
  const pstMinutes = (utcMinutes + (-8 * 60) + 1440) % 1440;
  const cstMinutes = (utcMinutes + (-6 * 60) + 1440) % 1440;
  const estMinutes = (utcMinutes + (-5 * 60) + 1440) % 1440;
  
  const formatTime = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
  };
  
  return {
    pst: formatTime(pstMinutes),
    cst: formatTime(cstMinutes),
    est: formatTime(estMinutes),
  };
}

type Holiday = { date: string; title: string; workMode: string };
type WorkingHours = { timezone: string; startHour: string; endHour: string };

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

  const { data: currentUser, isLoading: userLoading } = useQuery<User | null>({
    queryKey: ["/api/default-user"],
    queryFn: getDefaultUser,
    staleTime: 0,
    refetchOnMount: 'always',
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
    refetchOnMount: 'always',
    staleTime: 0,
  });

  // Force refetch when currentUser changes to vendor role
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

  // Force refetch team when vendorStructureId changes
  useEffect(() => {
    if (vendorStructureId) {
      refetchTeam();
    }
  }, [vendorStructureId, refetchTeam]);

  const [profileForm, setProfileForm] = useState({
    companyName: "",
    website: "",
    email: "",
    phone: "",
  });

  const [pricingData, setPricingData] = useState<Record<string, {
    basePrice?: number;
    complexity?: { basic?: number; standard?: number; advanced?: number; ultimate?: number };
    quantity?: Record<string, number>;
  }>>({});

  const [slaData, setSlaData] = useState<Record<string, { days: number; hours?: number }>>({});

  // Availability state
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [workingHours, setWorkingHours] = useState<WorkingHours>({
    timezone: "America/Los_Angeles",
    startHour: "09:00",
    endHour: "17:00",
  });
  const [newHoliday, setNewHoliday] = useState<{ date: Date | undefined; title: string; workMode: string }>({
    date: undefined,
    title: "",
    workMode: "Totally Off",
  });
  
  // Edit holiday state
  const [editHolidayDialogOpen, setEditHolidayDialogOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);
  const [editHolidayForm, setEditHolidayForm] = useState<{ date: Date | undefined; title: string; workMode: string }>({
    date: undefined,
    title: "",
    workMode: "Totally Off",
  });

  // Edit team member state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({
    username: "",
    email: "",
    phone: "",
  });

  const [, setLocation] = useLocation();

  useEffect(() => {
    if (vendorProfile) {
      setProfileForm({
        companyName: vendorProfile.companyName || "",
        website: vendorProfile.website || "",
        // Use vendor profile email/phone if available, otherwise fall back to user email/phone
        email: vendorProfile.email || currentUser?.email || "",
        phone: vendorProfile.phone || currentUser?.phone || "",
      });
      setPricingData((vendorProfile.pricingAgreements as any) || {});
      setSlaData((vendorProfile.slaConfig as any) || {});
      setHolidays((vendorProfile.holidays as Holiday[]) || []);
      const wh = vendorProfile.workingHours as WorkingHours | null;
      if (wh) {
        setWorkingHours(wh);
      }
    }
  }, [vendorProfile, currentUser?.email, currentUser?.phone]);

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

  // Impersonate team member mutation
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

  // Edit team member mutation
  const editTeamMemberMutation = useMutation({
    mutationFn: async ({ userId, data }: { userId: string; data: typeof editForm }) => {
      return apiRequest("PATCH", `/api/vendor/users/${userId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/vendor", vendorStructureId] });
      setEditDialogOpen(false);
      setEditingMember(null);
      toast({ title: "Team member updated successfully" });
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

  const handleAddHoliday = () => {
    if (!newHoliday.date || !newHoliday.title.trim()) {
      toast({ title: "Please enter both date and title", variant: "destructive" });
      return;
    }
    const dateStr = format(newHoliday.date, "yyyy-MM-dd");
    if (holidays.some(h => h.date === dateStr)) {
      toast({ title: "This date is already added", variant: "destructive" });
      return;
    }
    setHolidays([...holidays, { date: dateStr, title: newHoliday.title.trim(), workMode: newHoliday.workMode }]);
    setNewHoliday({ date: undefined, title: "", workMode: "Totally Off" });
  };

  const handleRemoveHoliday = (dateStr: string) => {
    setHolidays(holidays.filter(h => h.date !== dateStr));
  };

  const handleEditHoliday = (holiday: Holiday) => {
    setEditingHoliday(holiday);
    setEditHolidayForm({
      date: new Date(holiday.date + "T00:00:00"),
      title: holiday.title,
      workMode: holiday.workMode || "Totally Off",
    });
    setEditHolidayDialogOpen(true);
  };

  const handleSaveEditHoliday = () => {
    if (!editHolidayForm.date || !editHolidayForm.title.trim() || !editingHoliday) {
      toast({ title: "Please fill in all fields", variant: "destructive" });
      return;
    }
    const newDateStr = format(editHolidayForm.date, "yyyy-MM-dd");
    // Check if new date conflicts with another holiday (not the one being edited)
    if (newDateStr !== editingHoliday.date && holidays.some(h => h.date === newDateStr)) {
      toast({ title: "This date already has a holiday", variant: "destructive" });
      return;
    }
    setHolidays(holidays.map(h => 
      h.date === editingHoliday.date 
        ? { date: newDateStr, title: editHolidayForm.title.trim(), workMode: editHolidayForm.workMode }
        : h
    ));
    setEditHolidayDialogOpen(false);
    setEditingHoliday(null);
  };

  const handleSaveAvailability = () => {
    updateProfileMutation.mutate({
      holidays,
      workingHours,
    });
  };

  // Show loading state while user data is being fetched
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
                      value={profileForm.email}
                      onChange={(e) =>
                        setProfileForm({ ...profileForm, email: e.target.value })
                      }
                      placeholder="Enter email"
                      data-testid="input-email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <Input
                      value={profileForm.phone}
                      onChange={(e) =>
                        setProfileForm({ ...profileForm, phone: e.target.value })
                      }
                      placeholder="Enter phone"
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
                        <div className="flex items-center gap-4">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleEditMember(member)}
                            data-testid={`button-edit-member-${member.id}`}
                          >
                            <Pencil className="h-4 w-4 mr-1" />
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => impersonateMutation.mutate(member.id)}
                            disabled={!member.isActive || impersonateMutation.isPending}
                            data-testid={`button-login-as-${member.id}`}
                          >
                            <LogIn className="h-4 w-4 mr-1" />
                            Login as
                          </Button>
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
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Edit Team Member Dialog */}
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
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Time Zone</Label>
                      <Select
                        value={workingHours.timezone}
                        onValueChange={(value) => setWorkingHours({ ...workingHours, timezone: value })}
                      >
                        <SelectTrigger data-testid="select-timezone">
                          <SelectValue placeholder="Select timezone" />
                        </SelectTrigger>
                        <SelectContent>
                          {TIMEZONES.map((tz) => (
                            <SelectItem key={tz.value} value={tz.value}>
                              {tz.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Start Hour</Label>
                      <Input
                        type="time"
                        value={workingHours.startHour}
                        onChange={(e) => setWorkingHours({ ...workingHours, startHour: e.target.value })}
                        data-testid="input-start-hour"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>End Hour</Label>
                      <Input
                        type="time"
                        value={workingHours.endHour}
                        onChange={(e) => setWorkingHours({ ...workingHours, endHour: e.target.value })}
                        data-testid="input-end-hour"
                      />
                    </div>
                  </div>

                  {/* US Timezone Conversion Display */}
                  <div className="mt-4 p-4 bg-muted/50 rounded-md">
                    <Label className="text-sm font-medium mb-3 block">Hours in US Time Zones</Label>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground mb-1">PST (Pacific)</p>
                        <p className="font-medium">
                          {convertTimeToUSZones(workingHours.startHour, workingHours.timezone).pst} - {convertTimeToUSZones(workingHours.endHour, workingHours.timezone).pst}
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground mb-1">CST (Central)</p>
                        <p className="font-medium">
                          {convertTimeToUSZones(workingHours.startHour, workingHours.timezone).cst} - {convertTimeToUSZones(workingHours.endHour, workingHours.timezone).cst}
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground mb-1">EST (Eastern)</p>
                        <p className="font-medium">
                          {convertTimeToUSZones(workingHours.startHour, workingHours.timezone).est} - {convertTimeToUSZones(workingHours.endHour, workingHours.timezone).est}
                        </p>
                      </div>
                    </div>
                  </div>
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
                <CardContent className="space-y-4">
                  {/* Add Holiday Form */}
                  <div className="flex items-end gap-4 p-4 border rounded-md bg-muted/30 flex-wrap">
                    <div className="flex-1 min-w-[200px] space-y-2">
                      <Label>Holiday Title</Label>
                      <Input
                        value={newHoliday.title}
                        onChange={(e) => setNewHoliday({ ...newHoliday, title: e.target.value })}
                        placeholder="e.g., Christmas"
                        data-testid="input-holiday-title"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="block">Date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-[160px] justify-start text-left font-normal" data-testid="button-select-date">
                            <CalendarDays className="mr-2 h-4 w-4" />
                            {newHoliday.date ? format(newHoliday.date, "MMM d, yyyy") : "Select date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={newHoliday.date}
                            onSelect={(date) => setNewHoliday({ ...newHoliday, date })}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-2">
                      <Label>Work Mode</Label>
                      <Select
                        value={newHoliday.workMode}
                        onValueChange={(value) => setNewHoliday({ ...newHoliday, workMode: value })}
                      >
                        <SelectTrigger className="w-[140px]" data-testid="select-work-mode">
                          <SelectValue placeholder="Select mode" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Full-Time">Full-Time</SelectItem>
                          <SelectItem value="Part-Time">Part-Time</SelectItem>
                          <SelectItem value="Totally Off">Totally Off</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button onClick={handleAddHoliday} data-testid="button-add-holiday">
                      <Plus className="h-4 w-4 mr-2" />
                      Add
                    </Button>
                  </div>

                  {/* Holidays List */}
                  {holidays.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">
                      No holidays added yet. Add your first holiday or OOO day above.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {holidays
                        .sort((a, b) => a.date.localeCompare(b.date))
                        .map((holiday) => (
                          <div
                            key={holiday.date}
                            className="flex items-center justify-between p-3 border rounded-md"
                            data-testid={`row-holiday-${holiday.date}`}
                          >
                            <div className="flex items-center gap-4 flex-wrap">
                              <Badge variant="outline">
                                {format(new Date(holiday.date + "T00:00:00"), "MMM d, yyyy")}
                              </Badge>
                              <span className="font-medium">{holiday.title}</span>
                              <Badge variant={holiday.workMode === "Totally Off" ? "destructive" : holiday.workMode === "Part-Time" ? "secondary" : "default"}>
                                {holiday.workMode || "Totally Off"}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleEditHoliday(holiday)}
                                data-testid={`button-edit-holiday-${holiday.date}`}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleRemoveHoliday(holiday.date)}
                                data-testid={`button-remove-holiday-${holiday.date}`}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}

                  <div className="flex justify-end pt-4">
                    <Button
                      onClick={handleSaveAvailability}
                      disabled={updateProfileMutation.isPending}
                      data-testid="button-save-availability"
                    >
                      <Save className="h-4 w-4 mr-2" />
                      {updateProfileMutation.isPending ? "Saving..." : "Save Availability"}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Edit Holiday Dialog */}
              <Dialog open={editHolidayDialogOpen} onOpenChange={setEditHolidayDialogOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Edit Holiday</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <Label>Holiday Title</Label>
                      <Input
                        value={editHolidayForm.title}
                        onChange={(e) => setEditHolidayForm({ ...editHolidayForm, title: e.target.value })}
                        placeholder="e.g., Christmas"
                        data-testid="input-edit-holiday-title"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="block">Date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-full justify-start text-left font-normal" data-testid="button-edit-select-date">
                            <CalendarDays className="mr-2 h-4 w-4" />
                            {editHolidayForm.date ? format(editHolidayForm.date, "MMM d, yyyy") : "Select date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={editHolidayForm.date}
                            onSelect={(date) => setEditHolidayForm({ ...editHolidayForm, date })}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-2">
                      <Label>Work Mode</Label>
                      <Select
                        value={editHolidayForm.workMode}
                        onValueChange={(value) => setEditHolidayForm({ ...editHolidayForm, workMode: value })}
                      >
                        <SelectTrigger data-testid="select-edit-work-mode">
                          <SelectValue placeholder="Select mode" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Full-Time">Full-Time</SelectItem>
                          <SelectItem value="Part-Time">Part-Time</SelectItem>
                          <SelectItem value="Totally Off">Totally Off</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex justify-end gap-2 pt-4">
                      <Button
                        variant="outline"
                        onClick={() => setEditHolidayDialogOpen(false)}
                        data-testid="button-cancel-edit-holiday"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleSaveEditHoliday}
                        disabled={!editHolidayForm.title.trim() || !editHolidayForm.date}
                        data-testid="button-save-edit-holiday"
                      >
                        Save Changes
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
