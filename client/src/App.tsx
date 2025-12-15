import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import { ServicesRequestAd } from "@/pages/ServicesRequestAd";
import ServiceRequestForm from "@/pages/ServiceRequestForm";
import ServiceRequestsList from "@/pages/ServiceRequestsList";
import JobDetailView from "@/pages/JobDetailView";
import UserManagement from "@/pages/UserManagement";
import VendorProfile from "@/pages/VendorProfile";
import VendorsList from "@/pages/VendorsList";
import VendorDetail from "@/pages/VendorDetail";
import Settings from "@/pages/Settings";
import AdminBundleLineItems from "@/pages/AdminBundleLineItems";
import AdminBundleConfigurator from "@/pages/AdminBundleConfigurator";
import AdminServicePacks from "@/pages/AdminServicePacks";

function Router() {
  return (
    <Switch>
      {/* Add pages below */}
      <Route path="/" component={ServicesRequestAd} />
      <Route path="/service-requests" component={ServiceRequestsList} />
      <Route path="/service-requests/new" component={ServiceRequestForm} />
      <Route path="/jobs/:id" component={JobDetailView} />
      <Route path="/users" component={UserManagement} />
      <Route path="/vendor-profile" component={VendorProfile} />
      <Route path="/vendors" component={VendorsList} />
      <Route path="/vendors/:id" component={VendorDetail} />
      <Route path="/settings" component={Settings} />
      <Route path="/admin/bundle-line-items" component={AdminBundleLineItems} />
      <Route path="/admin/bundles" component={AdminBundleConfigurator} />
      <Route path="/admin/service-packs" component={AdminServicePacks} />
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
