import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, Building2 } from "lucide-react";

interface ClientOnboardingModalProps {
  onComplete: () => void;
}

export default function ClientOnboardingModal({ onComplete }: ClientOnboardingModalProps) {
  const { toast } = useToast();
  const [companyName, setCompanyName] = useState("");
  const [website, setWebsite] = useState("");
  const [phone, setPhone] = useState("");
  const [industry, setIndustry] = useState("");
  const [address, setAddress] = useState("");
  const [asiNumber, setAsiNumber] = useState("");
  const [ppaiNumber, setPpaiNumber] = useState("");
  const [isTripodUser, setIsTripodUser] = useState(false);
  const [tripodWorkspaceUrl, setTripodWorkspaceUrl] = useState("");

  const onboardingMutation = useMutation({
    mutationFn: async (data: Record<string, string | null>) => {
      const res = await apiRequest("POST", "/api/client-companies/onboarding", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/default-user"] });
      toast({ title: "Company profile created", description: "Welcome! Your company profile has been set up." });
      onComplete();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save company information. Please try again.", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) {
      toast({ title: "Required field", description: "Please enter your company name.", variant: "destructive" });
      return;
    }
    onboardingMutation.mutate({
      companyName: companyName.trim(),
      website: website.trim() || null,
      phone: phone.trim() || null,
      industry: industry.trim() || null,
      address: address.trim() || null,
      asiNumber: asiNumber.trim() || null,
      ppaiNumber: ppaiNumber.trim() || null,
      tripodWorkspaceUrl: isTripodUser ? tripodWorkspaceUrl.trim() || null : null,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm" data-testid="modal-client-onboarding">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto px-4">
        <Card>
          <CardHeader className="text-center gap-2">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-2xl" data-testid="text-onboarding-heading">Set Up Your Company Profile</CardTitle>
            <CardDescription data-testid="text-onboarding-description">
              Tell us about your company so we can personalize your experience.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="companyName">Company Name <span className="text-destructive">*</span></Label>
                  <Input
                    id="companyName"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Your company name"
                    required
                    data-testid="input-company-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="website">Website</Label>
                  <Input
                    id="website"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="https://example.com"
                    data-testid="input-website"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(555) 123-4567"
                    data-testid="input-phone"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="industry">Industry</Label>
                  <Input
                    id="industry"
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    placeholder="e.g. Promotional Products"
                    data-testid="input-industry"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Street address, city, state, ZIP"
                  data-testid="input-address"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="asiNumber">ASI#</Label>
                  <Input
                    id="asiNumber"
                    value={asiNumber}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, "");
                      setAsiNumber(val);
                    }}
                    placeholder="Numeric ASI number"
                    inputMode="numeric"
                    data-testid="input-asi-number"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ppaiNumber">PPAI#</Label>
                  <Input
                    id="ppaiNumber"
                    value={ppaiNumber}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, "");
                      setPpaiNumber(val);
                    }}
                    placeholder="Numeric PPAI number"
                    inputMode="numeric"
                    data-testid="input-ppai-number"
                  />
                </div>
              </div>

              <div className="space-y-3 rounded-md border p-4">
                <div className="flex items-center gap-3">
                  <Checkbox
                    id="isTripodUser"
                    checked={isTripodUser}
                    onCheckedChange={(checked) => setIsTripodUser(checked === true)}
                    data-testid="checkbox-tripod-user"
                  />
                  <Label htmlFor="isTripodUser" className="cursor-pointer font-normal">
                    Are you a Tri-POD Platform User Already?
                  </Label>
                </div>
                {isTripodUser && (
                  <div className="space-y-2 pl-7">
                    <Label htmlFor="tripodWorkspaceUrl">Add your Tri-POD Workspace URL</Label>
                    <Input
                      id="tripodWorkspaceUrl"
                      value={tripodWorkspaceUrl}
                      onChange={(e) => setTripodWorkspaceUrl(e.target.value)}
                      placeholder="https://your-workspace.tri-pod.com"
                      data-testid="input-tripod-workspace-url"
                    />
                  </div>
                )}
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={onboardingMutation.isPending || !companyName.trim()}
                data-testid="button-complete-onboarding"
              >
                {onboardingMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Continue"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
