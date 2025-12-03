import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Service } from "@shared/schema";

async function fetchServices(): Promise<Service[]> {
  const response = await fetch("/api/services");
  if (!response.ok) {
    throw new Error("Failed to fetch services");
  }
  return response.json();
}

async function seedServices(): Promise<void> {
  const response = await fetch("/api/seed", { method: "POST" });
  if (!response.ok) {
    throw new Error("Failed to seed services");
  }
}

export const ServicesListSection = (): JSX.Element => {
  const { data: services = [], isLoading } = useQuery({
    queryKey: ["services"],
    queryFn: fetchServices,
  });
  return (
    <div className="flex flex-col items-center w-full">
      <header className="flex w-full items-center justify-between gap-12 px-8 py-4 bg-white shadow-shadow-top-bar z-[4]">
        <Breadcrumb className="flex-1">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="#" className="flex items-center gap-1">
                <img
                  className="w-[18px] h-[18px]"
                  alt="Services icon"
                  src="/figmaAssets/icons-3.svg"
                />
                <span className="font-body-2-reg font-[number:var(--body-2-reg-font-weight)] text-dark-gray text-[length:var(--body-2-reg-font-size)] tracking-[var(--body-2-reg-letter-spacing)] leading-[var(--body-2-reg-line-height)] [font-style:var(--body-2-reg-font-style)]">
                  Services Request
                </span>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="font-body-2-semibold font-[number:var(--body-2-semibold-font-weight)] text-sky-blue-accent text-[length:var(--body-2-semibold-font-size)] tracking-[var(--body-2-semibold-letter-spacing)] leading-[var(--body-2-semibold-line-height)] [font-style:var(--body-2-semibold-font-style)]">
              /
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <span className="font-body-2-semibold font-[number:var(--body-2-semibold-font-weight)] text-sky-blue-accent text-[length:var(--body-2-semibold-font-size)] tracking-[var(--body-2-semibold-letter-spacing)] leading-[var(--body-2-semibold-line-height)] [font-style:var(--body-2-semibold-font-style)]">
                Bundle Services
              </span>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex items-center gap-10">
          <Select>
            <SelectTrigger className="w-[300px] h-auto px-4 py-2 bg-white rounded border-[1.5px] border-solid border-[#d1d1d1]">
              <SelectValue>
                <span className="font-medium text-dark-gray [font-family:'IBM_Plex_Sans',Helvetica] text-sm tracking-[0] leading-[19.6px]">
                  Switch Store
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="store1">Store 1</SelectItem>
              <SelectItem value="store2">Store 2</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" className="w-7 h-7 p-0">
              <img
                className="w-7 h-7"
                alt="Full width icon"
                src="/figmaAssets/icon---full-width.svg"
              />
            </Button>
            <Button variant="ghost" size="icon" className="w-7 h-7 p-0">
              <img
                className="w-7 h-7"
                alt="Notification icon"
                src="/figmaAssets/icon---notification.svg"
              />
            </Button>
          </div>
        </div>
      </header>

      <section className="flex items-center justify-between px-8 py-6 w-full z-[3]">
        <div className="flex flex-col gap-1">
          <h1 className="font-title-semibold font-[number:var(--title-semibold-font-weight)] text-dark-blue-night text-[length:var(--title-semibold-font-size)] tracking-[var(--title-semibold-letter-spacing)] leading-[var(--title-semibold-line-height)] [font-style:var(--title-semibold-font-style)]">
            Ad-hoc Services
          </h1>
          <p className="font-body-reg font-[number:var(--body-reg-font-weight)] text-dark-blue-night text-[length:var(--body-reg-font-size)] tracking-[var(--body-reg-letter-spacing)] leading-[var(--body-reg-line-height)] [font-style:var(--body-reg-font-style)]">
            Pre-packaged services to replicate a store using existing Tri-POD
            replicators
          </p>
        </div>
        <Link href="/service-requests/new">
          <Button className="bg-sky-blue-accent hover:bg-sky-blue-accent/90 text-white">
            Create New Request
          </Button>
        </Link>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-[1128px] px-8 z-[2]">
        {isLoading ? (
          <div className="col-span-3 text-center py-8">
            <p className="font-body-reg text-dark-gray">Loading services...</p>
          </div>
        ) : (
          services.map((service) => (
            <Card
              key={service.id}
              className="border border-solid border-[#f0f0f5] rounded-2xl overflow-hidden bg-white cursor-pointer hover:shadow-lg transition-shadow"
            >
              <CardContent className="p-6">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-6">
                    <h3 className="flex-1 font-body-semibold font-[number:var(--body-semibold-font-weight)] text-dark-blue-night text-[length:var(--body-semibold-font-size)] tracking-[var(--body-semibold-letter-spacing)] leading-[var(--body-semibold-line-height)] [font-style:var(--body-semibold-font-style)]">
                      {service.title}
                    </h3>
                    <span className="font-subheading-semibold font-[number:var(--subheading-semibold-font-weight)] text-sky-blue-accent text-[length:var(--subheading-semibold-font-size)] tracking-[var(--subheading-semibold-letter-spacing)] leading-[var(--subheading-semibold-line-height)] whitespace-nowrap [font-style:var(--subheading-semibold-font-style)]">
                      {service.priceRange}
                    </span>
                  </div>
                  <p className="font-body-2-reg font-[number:var(--body-2-reg-font-weight)] text-dark-blue-night text-[length:var(--body-2-reg-font-size)] tracking-[var(--body-2-reg-letter-spacing)] leading-[var(--body-2-reg-line-height)] [font-style:var(--body-2-reg-font-style)]">
                    {service.description}
                  </p>
                  {service.decorationMethods && (
                    <p className="font-body-3-reg text-dark-gray text-xs mt-2">
                      Methods: {service.decorationMethods}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </section>

      <footer className="flex items-center justify-center px-8 py-[29px] w-full max-w-[1128px] mt-12 border-t border-solid border-[#eae9f9] z-0">
        <p className="font-body-2-reg font-[number:var(--body-2-reg-font-weight)] text-blue-space-cadet text-[length:var(--body-2-reg-font-size)] tracking-[var(--body-2-reg-letter-spacing)] leading-[var(--body-2-reg-line-height)] [font-style:var(--body-2-reg-font-style)]">
          Copyright © 2025 Tri-POD All rights reserved.
        </p>
      </footer>
    </div>
  );
};
