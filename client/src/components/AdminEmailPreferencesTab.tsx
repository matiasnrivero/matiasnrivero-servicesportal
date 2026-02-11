import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";
import type { User, AdminEmailPreference } from "@shared/schema";

const EMAIL_TYPE_LABELS: Record<string, string> = {
  new_service_request: "New Service Requests",
  job_cancellation: "Job Cancellation",
  new_pack_subscription: "New Pack Subscriptions",
  pack_cancellation: "Pack Cancellation",
  pack_upgrade: "Pack Upgrade",
  pack_downgrade: "Pack Downgrade",
};

interface AdminEmailPreferencesData {
  admins: User[];
  preferences: AdminEmailPreference[];
  emailTypes: string[];
}

export default function AdminEmailPreferencesTab() {
  const { data, isLoading } = useQuery<AdminEmailPreferencesData>({
    queryKey: ["/api/admin-email-preferences"],
  });

  const toggleMutation = useMutation({
    mutationFn: async (body: { adminId: string; emailType: string; enabled: boolean }) => {
      return apiRequest("PUT", "/api/admin-email-preferences", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin-email-preferences"] });
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" data-testid="loader-email-preferences" />
        </CardContent>
      </Card>
    );
  }

  const admins = data?.admins ?? [];
  const preferences = data?.preferences ?? [];
  const emailTypes = data?.emailTypes ?? [];

  const getIsEnabled = (adminId: string, emailType: string): boolean => {
    const pref = preferences.find(p => p.adminId === adminId && p.emailType === emailType);
    if (!pref) return true;
    return pref.enabled;
  };

  const getAdminDisplayName = (admin: User): string => {
    return admin.username;
  };

  return (
    <div className="space-y-6" data-testid="container-email-preferences">
      <Card>
        <CardHeader>
          <CardTitle data-testid="text-email-preferences-title">Admin Email Preferences</CardTitle>
          <CardDescription>
            Configure which workflow email notifications each admin receives.
            Unchecking a box will stop that email type from being sent to the admin,
            but in-app notifications will still be delivered.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {admins.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground border rounded-md" data-testid="text-no-admins">
              No active admin users found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table data-testid="table-email-preferences">
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[160px]">Admin</TableHead>
                    {emailTypes.map(type => (
                      <TableHead key={type} className="text-center min-w-[120px]">
                        {EMAIL_TYPE_LABELS[type] || type}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {admins.map(admin => (
                    <TableRow key={admin.id} data-testid={`row-admin-${admin.id}`}>
                      <TableCell className="font-medium" data-testid={`text-admin-name-${admin.id}`}>
                        {getAdminDisplayName(admin)}
                      </TableCell>
                      {emailTypes.map(type => {
                        const enabled = getIsEnabled(admin.id, type);
                        return (
                          <TableCell key={type} className="text-center">
                            <div className="flex justify-center">
                              <Checkbox
                                checked={enabled}
                                disabled={toggleMutation.isPending}
                                onCheckedChange={(checked) => {
                                  toggleMutation.mutate({
                                    adminId: admin.id,
                                    emailType: type,
                                    enabled: !!checked,
                                  });
                                }}
                                data-testid={`checkbox-pref-${admin.id}-${type}`}
                              />
                            </div>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
