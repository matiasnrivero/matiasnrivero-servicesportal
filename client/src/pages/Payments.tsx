import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreditCard, Loader2 } from "lucide-react";
import type { User } from "@shared/schema";
import BillingTab from "@/components/BillingTab";

async function getDefaultUser(): Promise<User | null> {
  const res = await fetch("/api/default-user");
  if (!res.ok) return null;
  const data = await res.json();
  return { ...data, id: data.userId };
}

export default function Payments() {
  const { data: currentUser, isLoading: userLoading } = useQuery<User | null>({
    queryKey: ["/api/default-user"],
    queryFn: getDefaultUser,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const clientProfileId = currentUser?.clientProfileId;

  if (userLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="p-6">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </main>
      </div>
    );
  }

  const isClientAdmin = currentUser?.role === "client";
  if (!isClientAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="p-6">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <CreditCard className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">This page is only accessible to client administrators.</p>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  if (!clientProfileId) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="p-6">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <CreditCard className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No company profile found</p>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="p-6 max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold" data-testid="text-payments-title">Payments</h1>
          <p className="text-muted-foreground">Manage your billing and payment methods</p>
        </div>

        <BillingTab clientProfileId={clientProfileId} isPrimaryClient={true} />
      </main>
    </div>
  );
}
