import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Service } from "@shared/schema";

async function fetchServices(): Promise<Service[]> {
  const response = await fetch("/api/services");
  if (!response.ok) {
    throw new Error("Failed to fetch services");
  }
  return response.json();
}

export const ServicesListSection = (): JSX.Element => {
  const { data: services = [], isLoading } = useQuery({
    queryKey: ["services"],
    queryFn: fetchServices,
  });

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
          services.map((service) => (
            <Link key={service.id} href={`/service-requests/new?serviceId=${service.id}`}>
              <Card className="border border-[#f0f0f5] rounded-2xl overflow-hidden bg-white cursor-pointer hover:shadow-lg transition-shadow h-full">
                <CardContent className="p-6">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-4">
                      <h3 className="flex-1 font-semibold text-dark-blue-night">
                        {service.title}
                      </h3>
                      <span className="font-semibold text-sky-blue-accent whitespace-nowrap">
                        {service.priceRange}
                      </span>
                    </div>
                    <p className="text-sm text-dark-blue-night">
                      {service.description}
                    </p>
                    {service.decorationMethods && (
                      <p className="text-xs text-dark-gray mt-2">
                        Methods: {service.decorationMethods}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))
        )}
      </section>
    </div>
  );
};
