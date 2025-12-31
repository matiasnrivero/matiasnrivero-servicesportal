import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
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
import { Building2, Search, Eye, Trash2, LogIn, Pencil, Loader2 } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { format } from "date-fns";
import type { User, ClientProfile } from "@shared/schema";

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

type ClientCompanyWithDetails = ClientProfile & {
  primaryUser?: {
    id: string;
    username: string;
    email: string | null;
    isActive: boolean;
    lastLoginAt: string | null;
  } | null;
  teamCount?: number;
};

export default function ClientCompaniesList() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");

  const { data: currentUser } = useQuery<UserSession | null>({
    queryKey: ["/api/default-user"],
    queryFn: getDefaultUser,
  });

  const { data: clientCompanies = [], isLoading } = useQuery<ClientCompanyWithDetails[]>({
    queryKey: ["/api/client-companies"],
    queryFn: async () => {
      const res = await fetch("/api/client-companies");
      if (!res.ok) throw new Error("Failed to fetch client companies");
      return res.json();
    },
  });

  const toggleClientActiveMutation = useMutation({
    mutationFn: async ({ clientProfileId, isActive }: { clientProfileId: string; isActive: boolean }) => {
      return apiRequest("PATCH", `/api/client-companies/${clientProfileId}/toggle-active`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/client-companies"] });
      toast({ title: "Client status updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteClientMutation = useMutation({
    mutationFn: async (clientProfileId: string) => {
      return apiRequest("DELETE", `/api/client-companies/${clientProfileId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/client-companies"] });
      toast({ title: "Client company deleted" });
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
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/default-user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/service-requests"] });
      toast({ title: "Now viewing as client" });
      setLocation("/");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const isAdmin = currentUser?.role === "admin";

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

  const filteredCompanies = clientCompanies.filter((company) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      company.companyName?.toLowerCase().includes(searchLower) ||
      company.primaryUser?.username?.toLowerCase().includes(searchLower) ||
      company.primaryUser?.email?.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="p-6">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-client-companies-title">Client Companies</h1>
            <p className="text-muted-foreground">Manage all client organizations</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search companies..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                  data-testid="input-search-companies"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredCompanies.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                {searchTerm ? "No companies match your search" : "No client companies found"}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-2 font-medium text-muted-foreground">Active</th>
                      <th className="text-left py-3 px-2 font-medium text-muted-foreground">Company Name</th>
                      <th className="text-left py-3 px-2 font-medium text-muted-foreground">Client Admin</th>
                      <th className="text-left py-3 px-2 font-medium text-muted-foreground">Created</th>
                      <th className="text-left py-3 px-2 font-medium text-muted-foreground">Last Login</th>
                      <th className="text-right py-3 px-2 font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCompanies.map((company) => (
                      <tr key={company.id} className="border-b last:border-0" data-testid={`row-client-company-${company.id}`}>
                        <td className="py-3 px-2">
                          <Switch
                            checked={company.primaryUser?.isActive ?? true}
                            onCheckedChange={(checked) => {
                              toggleClientActiveMutation.mutate({
                                clientProfileId: company.id,
                                isActive: checked,
                              });
                            }}
                            data-testid={`switch-active-${company.id}`}
                          />
                        </td>
                        <td className="py-3 px-2">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{company.companyName || "Unnamed Company"}</span>
                          </div>
                        </td>
                        <td className="py-3 px-2">
                          <div>
                            <div className="font-medium">{company.primaryUser?.username || "—"}</div>
                            <div className="text-sm text-muted-foreground">{company.primaryUser?.email || ""}</div>
                          </div>
                        </td>
                        <td className="py-3 px-2 text-muted-foreground">
                          {company.createdAt ? format(new Date(company.createdAt), "MMM d, yyyy") : "—"}
                        </td>
                        <td className="py-3 px-2 text-muted-foreground">
                          {company.primaryUser?.lastLoginAt
                            ? format(new Date(company.primaryUser.lastLoginAt), "MMM d, yyyy h:mm a")
                            : "—"}
                        </td>
                        <td className="py-3 px-2">
                          <div className="flex items-center justify-end gap-1">
                            {company.primaryUser && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => impersonateMutation.mutate(company.primaryUser!.id)}
                                    disabled={impersonateMutation.isPending}
                                    data-testid={`button-impersonate-${company.id}`}
                                  >
                                    <LogIn className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Login as this client</TooltipContent>
                              </Tooltip>
                            )}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setLocation(`/client-companies/${company.id}/edit`)}
                                  data-testid={`button-edit-${company.id}`}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Edit client</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setLocation(`/client-companies/${company.id}`)}
                                  data-testid={`button-view-${company.id}`}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>View details</TooltipContent>
                            </Tooltip>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  data-testid={`button-delete-${company.id}`}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Client Company</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete "{company.companyName}"? This action cannot be undone and will remove all associated team members.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteClientMutation.mutate(company.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
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
      </main>
    </div>
  );
}
