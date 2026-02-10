import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Save, Loader2, AlertTriangle } from "lucide-react";

interface PriorityDistribution {
  maxUrgentPercent: number;
  maxHighPercent: number;
}

export function PriorityDistributionTab() {
  const { toast } = useToast();
  const [maxUrgentPercent, setMaxUrgentPercent] = useState(20);
  const [maxHighPercent, setMaxHighPercent] = useState(30);
  const [hasChanges, setHasChanges] = useState(false);

  const { data: settings, isLoading } = useQuery<PriorityDistribution>({
    queryKey: ["/api/admin/priority-distribution"],
  });

  useEffect(() => {
    if (settings) {
      setMaxUrgentPercent(settings.maxUrgentPercent);
      setMaxHighPercent(settings.maxHighPercent);
      setHasChanges(false);
    }
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: async (data: PriorityDistribution) => {
      const res = await apiRequest("PUT", "/api/admin/priority-distribution", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/priority-distribution"] });
      setHasChanges(false);
      toast({
        title: "Settings saved",
        description: "Priority distribution quotas have been updated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save priority settings",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    if (maxUrgentPercent < 0 || maxHighPercent < 0) {
      toast({
        title: "Invalid values",
        description: "Percentages cannot be negative.",
        variant: "destructive",
      });
      return;
    }
    if (maxUrgentPercent + maxHighPercent > 100) {
      toast({
        title: "Invalid quotas",
        description: "Combined Urgent and High percentages cannot exceed 100%.",
        variant: "destructive",
      });
      return;
    }
    updateMutation.mutate({ maxUrgentPercent, maxHighPercent });
  };

  const handleChange = (setter: (v: number) => void, value: string) => {
    const num = parseInt(value, 10);
    if (!isNaN(num)) {
      setter(num);
      setHasChanges(true);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const normalLowPercent = Math.max(0, 100 - maxUrgentPercent - maxHighPercent);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle data-testid="text-priority-settings-title">Priority Quota Settings</CardTitle>
          <CardDescription>
            Configure the maximum percentage of active jobs a client can have at each priority level.
            These quotas are enforced dynamically based on the client's total active jobs (Pending, In Progress, and Change Request).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="maxUrgentPercent">
                Max Urgent (%)
                <Badge variant="outline" className="ml-2 border-red-500 text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30 text-xs">
                  Urgent
                </Badge>
              </Label>
              <Input
                id="maxUrgentPercent"
                type="number"
                min={0}
                max={100}
                value={maxUrgentPercent}
                onChange={(e) => handleChange(setMaxUrgentPercent, e.target.value)}
                data-testid="input-max-urgent-percent"
              />
              <p className="text-xs text-muted-foreground">
                Maximum percentage of active jobs a client can mark as Urgent
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxHighPercent">
                Max High (%)
                <Badge variant="outline" className="ml-2 border-yellow-500 text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-950/30 text-xs">
                  High
                </Badge>
              </Label>
              <Input
                id="maxHighPercent"
                type="number"
                min={0}
                max={100}
                value={maxHighPercent}
                onChange={(e) => handleChange(setMaxHighPercent, e.target.value)}
                data-testid="input-max-high-percent"
              />
              <p className="text-xs text-muted-foreground">
                Maximum percentage of active jobs a client can mark as High
              </p>
            </div>
          </div>

          <Card className="bg-muted/50">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start gap-2 mb-3">
                <AlertTriangle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <p className="text-sm text-muted-foreground">
                  Quota Distribution Preview (per client, based on % of their active jobs)
                </p>
              </div>
              <div className="flex gap-1 h-8 rounded-md overflow-hidden">
                {maxUrgentPercent > 0 && (
                  <div
                    className="bg-red-500 flex items-center justify-center text-white text-xs font-medium"
                    style={{ width: `${maxUrgentPercent}%` }}
                    data-testid="bar-urgent"
                  >
                    {maxUrgentPercent}% Urgent
                  </div>
                )}
                {maxHighPercent > 0 && (
                  <div
                    className="bg-yellow-500 flex items-center justify-center text-white text-xs font-medium"
                    style={{ width: `${maxHighPercent}%` }}
                    data-testid="bar-high"
                  >
                    {maxHighPercent}% High
                  </div>
                )}
                {normalLowPercent > 0 && (
                  <div
                    className="bg-blue-500 flex items-center justify-center text-white text-xs font-medium"
                    style={{ width: `${normalLowPercent}%` }}
                    data-testid="bar-normal-low"
                  >
                    {normalLowPercent}% Normal/Low
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                For example, if a client has 50 active jobs, they can have up to {Math.floor(50 * maxUrgentPercent / 100)} Urgent, {Math.floor(50 * maxHighPercent / 100)} High, and the rest Normal or Low priority.
              </p>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button
              onClick={handleSave}
              disabled={updateMutation.isPending || !hasChanges}
              data-testid="button-save-priority-settings"
            >
              {updateMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Changes
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
