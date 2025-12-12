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
import { useToast } from "@/hooks/use-toast";
import { Building2, Search, Eye } from "lucide-react";
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

  const getVendorProfile = (userId: string): VendorProfile | undefined => {
    return vendorProfiles.find((p) => p.userId === userId);
  };

  const filteredVendors = vendorUsers.filter((vendor) => {
    const profile = getVendorProfile(vendor.id);
    const companyName = profile?.companyName || "";
    return (
      vendor.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (vendor.email?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false)
    );
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
          <div className="flex items-center gap-3 mb-6">
            <Building2 className="h-8 w-8 text-sky-blue-accent" />
            <h1 className="font-title-semibold text-dark-blue-night text-2xl">
              Vendors
            </h1>
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
              <div className="space-y-2">
                {filteredVendors.length === 0 ? (
                  <p className="text-dark-gray text-center py-8">No vendors found</p>
                ) : (
                  filteredVendors.map((vendor) => {
                    const profile = getVendorProfile(vendor.id);
                    return (
                      <div
                        key={vendor.id}
                        className="flex items-center justify-between p-4 border rounded-md"
                        data-testid={`row-vendor-${vendor.id}`}
                      >
                        <div className="flex items-center gap-6 flex-1">
                          <div className="min-w-[200px]">
                            <p className="font-semibold text-dark-blue-night">
                              {profile?.companyName || "No Company Name"}
                            </p>
                            <p className="text-xs text-dark-gray">Company</p>
                          </div>
                          <div className="min-w-[150px]">
                            <p className="text-dark-blue-night">{vendor.username}</p>
                            <p className="text-xs text-dark-gray">Primary Contact</p>
                          </div>
                          <div className="min-w-[200px]">
                            <p className="text-dark-blue-night">{vendor.email || "No email"}</p>
                            <p className="text-xs text-dark-gray">Email</p>
                          </div>
                          {!vendor.isActive && (
                            <Badge
                              variant="outline"
                              className="bg-destructive/10 text-destructive border-destructive/20"
                            >
                              Inactive
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            <Label
                              htmlFor={`toggle-vendor-${vendor.id}`}
                              className="text-sm text-dark-gray"
                            >
                              Active
                            </Label>
                            <Switch
                              id={`toggle-vendor-${vendor.id}`}
                              checked={vendor.isActive}
                              onCheckedChange={(checked) =>
                                toggleVendorActiveMutation.mutate({
                                  userId: vendor.id,
                                  isActive: checked,
                                })
                              }
                              data-testid={`switch-vendor-active-${vendor.id}`}
                            />
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setLocation(`/vendors/${vendor.id}`)}
                            data-testid={`button-view-vendor-${vendor.id}`}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            View
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
