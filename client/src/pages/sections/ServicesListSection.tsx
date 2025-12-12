import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Service } from "@shared/schema";

interface CurrentUser {
  userId: string;
  role: string;
  username: string;
}

async function getDefaultUser(): Promise<CurrentUser> {
  const response = await fetch("/api/default-user");
  if (!response.ok) {
    throw new Error("Failed to get default user");
  }
  return response.json();
}

const SERVICE_ORDER = [
  "Vectorization & Color Separation",
  "Artwork Touch-Ups (DTF / DTG)",
  "Embroidery Digitization",
  "Creative Art",
  "Artwork Composition",
  "Dye-Sublimation Template",
  "Store Creation",
  "Store Banner Design",
  "Flyer Design",
  "Blank Product - PSD",
];

function sortServices(services: Service[]): Service[] {
  return [...services].sort((a, b) => {
    const indexA = SERVICE_ORDER.indexOf(a.title);
    const indexB = SERVICE_ORDER.indexOf(b.title);
    const orderA = indexA === -1 ? 999 : indexA;
    const orderB = indexB === -1 ? 999 : indexB;
    return orderA - orderB;
  });
}

async function fetchServices(): Promise<Service[]> {
  const response = await fetch("/api/services");
  if (!response.ok) {
    throw new Error("Failed to fetch services");
  }
  return response.json();
}

export const ServicesListSection = (): JSX.Element => {
  const [pricingModalOpen, setPricingModalOpen] = useState(false);
  
  const { data: services = [], isLoading } = useQuery({
    queryKey: ["services"],
    queryFn: fetchServices,
  });

  const { data: currentUser } = useQuery({
    queryKey: ["/api/default-user"],
    queryFn: getDefaultUser,
  });

  // Hide pricing until user role is confirmed (default to hiding for security)
  const isDesigner = currentUser?.role === "designer";
  const showPricing = currentUser && currentUser.role !== "designer";

  const handlePricingClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPricingModalOpen(true);
  };

  return (
    <div className="flex flex-col items-center w-full flex-1 px-8 py-6">
      <section className="flex items-center justify-between w-full max-w-6xl mb-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-dark-blue-night">
            Available Services
          </h1>
          <p className="text-dark-gray">
            Choose from our range of artwork services for promotional products
          </p>
        </div>
        <Link href="/service-requests/new">
          <Button className="bg-sky-blue-accent hover:bg-sky-blue-accent/90 text-white">
            Create New Request
          </Button>
        </Link>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-6xl">
        {isLoading ? (
          <div className="col-span-3 text-center py-8">
            <p className="text-dark-gray">Loading services...</p>
          </div>
        ) : services.length === 0 ? (
          <div className="col-span-3 text-center py-8">
            <p className="text-dark-gray">No services available</p>
          </div>
        ) : (
          sortServices(services).map((service) => (
            <Link key={service.id} href={`/service-requests/new?serviceId=${service.id}`}>
              <Card className="border border-[#f0f0f5] rounded-2xl overflow-hidden bg-white cursor-pointer hover:shadow-lg transition-shadow h-full">
                <CardContent className="p-6">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-4">
                      <h3 className="flex-1 font-semibold text-dark-blue-night">
                        {service.title}
                      </h3>
                      {showPricing && (
                        service.title === "Store Creation" ? (
                          <button
                            onClick={handlePricingClick}
                            className="text-sm text-sky-blue-accent whitespace-nowrap underline hover:text-sky-blue-accent/80"
                            data-testid="link-store-pricing"
                          >
                            Pricing Breakdown
                          </button>
                        ) : (
                          <span className="font-semibold text-sky-blue-accent whitespace-nowrap">
                            {service.priceRange}
                          </span>
                        )
                      )}
                    </div>
                    <p className="text-sm text-dark-blue-night">
                      {service.description}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))
        )}
      </section>

      <Dialog open={pricingModalOpen} onOpenChange={setPricingModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-dark-blue-night">
              Pricing table
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-dark-blue-night mb-6">
              Depending on the amount of products entered by the user the final pricing will vary as follows:
            </p>
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 text-dark-gray font-normal">Quantity of products</th>
                  <th className="text-left py-3 text-dark-gray font-normal">$ per item</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="py-4 text-dark-blue-night">1-50</td>
                  <td className="py-4 text-dark-blue-night">$ 1.50</td>
                </tr>
                <tr className="border-b">
                  <td className="py-4 text-dark-blue-night">51-75</td>
                  <td className="py-4 text-dark-blue-night">$ 1.30</td>
                </tr>
                <tr className="border-b">
                  <td className="py-4 text-dark-blue-night">76-100</td>
                  <td className="py-4 text-dark-blue-night">$ 1.10</td>
                </tr>
                <tr>
                  <td className="py-4 text-dark-blue-night">&gt; 101</td>
                  <td className="py-4 text-dark-blue-night">$ 1.00</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="flex justify-end">
            <Button 
              onClick={() => setPricingModalOpen(false)}
              className="bg-sky-blue-accent hover:bg-sky-blue-accent/90 text-white"
              data-testid="button-got-it"
            >
              Got It
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
