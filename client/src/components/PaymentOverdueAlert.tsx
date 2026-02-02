import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

interface ClientProfileStatus {
  paymentOverdue: boolean;
  paymentRetryCount?: number;
  paymentOverdueAt?: string;
}

interface CurrentUser {
  userId: string;
  role: string;
  username: string;
  clientProfileId?: string | null;
}

async function fetchClientPaymentStatus(clientProfileId: string): Promise<ClientProfileStatus | null> {
  try {
    const response = await fetch(`/api/client-profiles/${clientProfileId}/payment-status`);
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

async function getDefaultUser(): Promise<CurrentUser> {
  const response = await fetch("/api/default-user");
  if (!response.ok) {
    throw new Error("Failed to get default user");
  }
  return response.json();
}

export function PaymentOverdueAlert() {
  const { data: currentUser } = useQuery({
    queryKey: ["/api/default-user"],
    queryFn: getDefaultUser,
    staleTime: 5 * 60 * 1000,
  });

  const clientProfileId = currentUser?.clientProfileId;
  const isClient = currentUser?.role && ["client", "client_member"].includes(currentUser.role);

  const { data: paymentStatus } = useQuery({
    queryKey: ["/api/client-profiles", clientProfileId, "payment-status"],
    queryFn: () => fetchClientPaymentStatus(clientProfileId!),
    enabled: !!clientProfileId && !!isClient,
    staleTime: 60 * 1000,
  });

  if (!isClient || !paymentStatus?.paymentOverdue) {
    return null;
  }

  return (
    <Alert variant="destructive" className="mb-4" data-testid="alert-payment-overdue">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Payment Overdue</AlertTitle>
      <AlertDescription className="flex items-center justify-between gap-4 flex-wrap">
        <span>
          Your account has an outstanding payment. Please resolve this to continue submitting new service requests.
        </span>
        <Link href="/payments">
          <Button variant="outline" size="sm" data-testid="button-resolve-payment">
            Resolve Payment
          </Button>
        </Link>
      </AlertDescription>
    </Alert>
  );
}
