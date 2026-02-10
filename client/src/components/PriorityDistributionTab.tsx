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
  windowSize: number;
  maxUrgent: number;
  maxHigh: number;
}

export function PriorityDistributionTab() {
  const { toast } = useToast();
  const [windowSize, setWindowSize] = useState(10);
  const [maxUrgent, setMaxUrgent] = useState(2);
  const [maxHigh, setMaxHigh] = useState(3);
  const [hasChanges, setHasChanges] = useState(false);

  const { data: settings, isLoading } = useQuery<PriorityDistribution>({
    queryKey: ["/api/admin/priority-distribution"],
  });

  useEffect(() => {
    if (settings) {
      setWindowSize(settings.windowSize);
      setMaxUrgent(settings.maxUrgent);
      setMaxHigh(settings.maxHigh);
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
    if (maxUrgent < 0 || maxHigh < 0 || windowSize < 1) {
      toast({
        title: "Invalid values",
        description: "Window size must be at least 1, and quotas cannot be negative.",
        variant: "destructive",
      });
      return;
    }
    if (maxUrgent + maxHigh > windowSize) {
      toast({
        title: "Invalid quotas",
        description: "Combined urgent and high quotas cannot exceed the window size.",
        variant: "destructive",
      });
      return;
    }
    updateMutation.mutate({ windowSize, maxUrgent, maxHigh });
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

  const urgentPercentage = windowSize > 0 ? Math.round((maxUrgent / windowSize) * 100) : 0;
  const highPercentage = windowSize > 0 ? Math.round((maxHigh / windowSize) * 100) : 0;
  const normalLowPercentage = windowSize > 0 ? Math.max(0, 100 - urgentPercentage - highPercentage) : 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle data-testid="text-priority-settings-title">Priority Quota Settings</CardTitle>
          <CardDescription>
            Configure how many active jobs a client can have at each priority level.
            These quotas are enforced when clients submit new jobs or change job priorities.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label htmlFor="windowSize">Active Jobs Window</Label>
              <Input
                id="windowSize"
                type="number"
                min={1}
                value={windowSize}
                onChange={(e) => handleChange(setWindowSize, e.target.value)}
                data-testid="input-window-size"
              />
              <p className="text-xs text-muted-foreground">
                Number of active jobs considered for quota enforcement
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxUrgent">
                Max Urgent Jobs
                <Badge variant="outline" className="ml-2 border-red-500 text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30 text-xs">
                  Urgent
                </Badge>
              </Label>
              <Input
                id="maxUrgent"
                type="number"
                min={0}
                max={windowSize}
                value={maxUrgent}
                onChange={(e) => handleChange(setMaxUrgent, e.target.value)}
                data-testid="input-max-urgent"
              />
              <p className="text-xs text-muted-foreground">
                Maximum active jobs a client can have marked as Urgent
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxHigh">
                Max High Jobs
                <Badge variant="outline" className="ml-2 border-orange-500 text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30 text-xs">
                  High
                </Badge>
              </Label>
              <Input
                id="maxHigh"
                type="number"
                min={0}
                max={windowSize}
                value={maxHigh}
                onChange={(e) => handleChange(setMaxHigh, e.target.value)}
                data-testid="input-max-high"
              />
              <p className="text-xs text-muted-foreground">
                Maximum active jobs a client can have marked as High
              </p>
            </div>
          </div>

          <Card className="bg-muted/50">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start gap-2 mb-3">
                <AlertTriangle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <p className="text-sm text-muted-foreground">
                  Quota Distribution Preview (per client, across their active jobs)
                </p>
              </div>
              <div className="flex gap-1 h-8 rounded-md overflow-hidden">
                {urgentPercentage > 0 && (
                  <div
                    className="bg-red-500 flex items-center justify-center text-white text-xs font-medium"
                    style={{ width: `${urgentPercentage}%` }}
                    data-testid="bar-urgent"
                  >
                    {maxUrgent} Urgent
                  </div>
                )}
                {highPercentage > 0 && (
                  <div
                    className="bg-orange-500 flex items-center justify-center text-white text-xs font-medium"
                    style={{ width: `${highPercentage}%` }}
                    data-testid="bar-high"
                  >
                    {maxHigh} High
                  </div>
                )}
                {normalLowPercentage > 0 && (
                  <div
                    className="bg-blue-500 flex items-center justify-center text-white text-xs font-medium"
                    style={{ width: `${normalLowPercentage}%` }}
                    data-testid="bar-normal-low"
                  >
                    {windowSize - maxUrgent - maxHigh} Normal/Low
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Out of {windowSize} active jobs, a client can have up to {maxUrgent} Urgent, {maxHigh} High, and {windowSize - maxUrgent - maxHigh} Normal or Low priority jobs.
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
