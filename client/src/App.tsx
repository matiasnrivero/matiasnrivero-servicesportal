import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import { ServicesRequestAd } from "@/pages/ServicesRequestAd";
import ServiceRequestForm from "@/pages/ServiceRequestForm";
import ServiceRequestsList from "@/pages/ServiceRequestsList";

function Router() {
  return (
    <Switch>
      {/* Add pages below */}
      <Route path="/" component={ServicesRequestAd} />
      <Route path="/service-requests" component={ServiceRequestsList} />
      <Route path="/service-requests/new" component={ServiceRequestForm} />
      {/* Fallback to 404 */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
