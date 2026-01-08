import { useState } from "react";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Building2, Search, Eye, Plus, Trash2 } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { User, VendorProfile } from "@shared/schema";

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

export default function VendorsList() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newVendor, setNewVendor] = useState({
    username: "",
    email: "",
    phone: "",
    password: "",
    companyName: "",
    website: "",
  });

  const { data: currentUser } = useQuery<UserSession | null>({
    queryKey: ["/api/default-user"],
    queryFn: getDefaultUser,
  });

  const { data: vendorUsers = [], isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/users", { role: "vendor" }],
    queryFn: async () => {
      const res = await fetch("/api/users?role=vendor");
      if (!res.ok) throw new Error("Failed to fetch vendors");
      return res.json();
    },
  });

  const { data: vendorProfiles = [], isLoading: profilesLoading } = useQuery<VendorProfile[]>({
    queryKey: ["/api/vendor-profiles"],
  });

  const toggleVendorActiveMutation = useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      return apiRequest("PATCH", `/api/users/${userId}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Vendor status updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const createVendorMutation = useMutation({
    mutationFn: async (vendorData: typeof newVendor) => {
      const userRes = await apiRequest("POST", "/api/users", {
        username: vendorData.username,
        email: vendorData.email,
        phone: vendorData.phone,
        password: vendorData.password,
        role: "vendor",
      });
      const user = await userRes.json();
      
      await apiRequest("POST", "/api/vendor-profiles", {
        userId: user.id,
        companyName: vendorData.companyName,
        website: vendorData.website,
      });
      
      return user;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor-profiles"] });
      setAddDialogOpen(false);
      setNewVendor({
        username: "",
        email: "",
        phone: "",
        password: "",
        companyName: "",
        website: "",
      });
      toast({ title: "Vendor created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteVendorMutation = useMutation({
    mutationFn: async (profileId: string) => {
      return apiRequest("DELETE", `/api/vendor-profiles/${profileId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor-profiles"] });
      toast({ title: "Vendor deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const getVendorProfile = (userId: string): VendorProfile | undefined => {
    return vendorProfiles.find((p) => p.userId === userId);
  };

  const filteredVendors = vendorUsers
    .filter((vendor) => {
      const profile = getVendorProfile(vendor.id);
      const companyName = profile?.companyName || "";
      return (
        vendor.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
        companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (vendor.email?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false)
      );
    })
    .sort((a, b) => {
      if ((a as any).isInternal && !(b as any).isInternal) return -1;
      if (!(a as any).isInternal && (b as any).isInternal) return 1;
      const profileA = getVendorProfile(a.id);
      const profileB = getVendorProfile(b.id);
      return (profileA?.companyName || a.username).localeCompare(profileB?.companyName || b.username);
    });

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

  if (usersLoading || profilesLoading) {
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
          <div className="flex items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-3">
              <Building2 className="h-8 w-8 text-sky-blue-accent" />
              <h1 className="font-title-semibold text-dark-blue-night text-2xl">
                Vendors
              </h1>
            </div>
            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-vendor">
                  <Plus className="h-4 w-4 mr-2" />
                  Add New Vendor
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Add New Vendor</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Company Name<span className="text-destructive">*</span></Label>
                      <Input
                        value={newVendor.companyName}
                        onChange={(e) =>
                          setNewVendor({ ...newVendor, companyName: e.target.value })
                        }
                        placeholder="Enter company name"
                        data-testid="input-new-company-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Website</Label>
                      <Input
                        value={newVendor.website}
                        onChange={(e) =>
                          setNewVendor({ ...newVendor, website: e.target.value })
                        }
                        placeholder="https://example.com"
                        data-testid="input-new-website"
                      />
                    </div>
                  </div>
                  <div className="border-t pt-4">
                    <p className="text-sm text-dark-gray mb-4">Primary Contact (Vendor Admin)</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Username<span className="text-destructive">*</span></Label>
                        <Input
                          value={newVendor.username}
                          onChange={(e) =>
                            setNewVendor({ ...newVendor, username: e.target.value })
                          }
                          placeholder="Enter username"
                          data-testid="input-new-username"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Password<span className="text-destructive">*</span></Label>
                        <Input
                          type="password"
                          value={newVendor.password}
                          onChange={(e) =>
                            setNewVendor({ ...newVendor, password: e.target.value })
                          }
                          placeholder="Enter password"
                          data-testid="input-new-password"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Email</Label>
                        <Input
                          type="email"
                          value={newVendor.email}
                          onChange={(e) =>
                            setNewVendor({ ...newVendor, email: e.target.value })
                          }
                          placeholder="contact@company.com"
                          data-testid="input-new-email"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Phone</Label>
                        <Input
                          value={newVendor.phone}
                          onChange={(e) =>
                            setNewVendor({ ...newVendor, phone: e.target.value })
                          }
                          placeholder="(555) 123-4567"
                          data-testid="input-new-phone"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-4">
                    <Button
                      variant="outline"
                      onClick={() => setAddDialogOpen(false)}
                      data-testid="button-cancel-add-vendor"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={() => createVendorMutation.mutate(newVendor)}
                      disabled={createVendorMutation.isPending || !newVendor.username || !newVendor.password || !newVendor.companyName}
                      data-testid="button-confirm-add-vendor"
                    >
                      {createVendorMutation.isPending ? "Creating..." : "Create Vendor"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-dark-gray" />
                <Input
                  placeholder="Search vendors..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-vendors"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Vendors ({filteredVendors.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {filteredVendors.length === 0 ? (
                <p className="text-dark-gray text-center py-8">No vendors found</p>
              ) : (
                <div className="space-y-2">
                  {filteredVendors.map((vendor) => {
                    const profile = getVendorProfile(vendor.id);
                    const isInternalVendor = (vendor as any).isInternal;
                    return (
                      <div
                        key={vendor.id}
                        className={`flex items-center p-4 border rounded-md ${isInternalVendor ? 'bg-muted/50 border-primary/20' : ''}`}
                        data-testid={`row-vendor-${vendor.id}`}
                      >
                        <div className="w-12 flex-shrink-0">
                          <Switch
                            id={`toggle-vendor-${vendor.id}`}
                            checked={vendor.isActive}
                            disabled={isInternalVendor}
                            onCheckedChange={(checked) =>
                              toggleVendorActiveMutation.mutate({
                                userId: vendor.id,
                                isActive: checked,
                              })
                            }
                            data-testid={`switch-vendor-active-${vendor.id}`}
                          />
                        </div>
                        <div className="w-[200px] flex-shrink-0">
                          <p className="font-semibold text-dark-blue-night">
                            {profile?.companyName || "No Company Name"}
                          </p>
                          <div className="flex items-center gap-2">
                            <p className="text-xs text-dark-gray">Company</p>
                            {isInternalVendor && (
                              <Badge variant="secondary" className="text-xs">Internal</Badge>
                            )}
                          </div>
                        </div>
                        <div className="w-[220px] flex-shrink-0">
                          <p className="text-dark-blue-night truncate">{vendor.username}</p>
                          <p className="text-xs text-dark-gray">Primary Contact</p>
                        </div>
                        <div className="flex-1 min-w-[250px]">
                          <p className="text-dark-blue-night truncate">{vendor.email || "No email"}</p>
                          <p className="text-xs text-dark-gray">Email</p>
                        </div>
                        <div className="w-[80px] flex-shrink-0 flex justify-center">
                          {!vendor.isActive && (
                            <Badge
                              variant="outline"
                              className="bg-destructive/10 text-destructive border-destructive/20"
                            >
                              Inactive
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setLocation(`/vendors/${vendor.id}`)}
                                data-testid={`button-view-vendor-${vendor.id}`}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>View</TooltipContent>
                          </Tooltip>
                          {!isInternalVendor ? (
                            <Tooltip>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      data-testid={`button-delete-vendor-${vendor.id}`}
                                    >
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  </TooltipTrigger>
                                </AlertDialogTrigger>
                                <TooltipContent>Delete</TooltipContent>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Vendor</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to delete{" "}
                                      <strong>{profile?.companyName || vendor.username}</strong>?
                                      This will deactivate the vendor account and all associated
                                      team members. This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel data-testid="button-cancel-delete">
                                      Cancel
                                    </AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => {
                                        if (profile) {
                                          deleteVendorMutation.mutate(profile.id);
                                        }
                                      }}
                                      className="bg-destructive text-destructive-foreground"
                                      data-testid="button-confirm-delete"
                                    >
                                      {deleteVendorMutation.isPending ? "Deleting..." : "Delete Vendor"}
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </Tooltip>
                          ) : (
                            <div className="w-9" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
