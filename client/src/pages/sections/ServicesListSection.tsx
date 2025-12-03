import React from "react";
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

const servicesData = [
  {
    title: "Vectorization & Color Separation",
    price: "$ 10",
    description:
      "Turn fuzzy images into sharp vectors, ready for screen printing.",
  },
  {
    title: "Artwork Touch-Ups (DTF / DTG)",
    price: "$ 10",
    description:
      "Clean, refine, and prep your artwork for flawless digital prints.",
  },
  {
    title: "Artwork Composition",
    price: "$ 10",
    description: "Transform your logo into a polished new design or template.",
  },
  {
    title: "Creative Art",
    price: "$ 20 - $ 60",
    description: "Original artwork from just your idea, text, or inspiration.",
  },
  {
    title: "Embroidery Digitization",
    price: "$ 15",
    description: "Convert your artwork into stitch-perfect embroidery files.",
  },
  {
    title: "Dye-Sublimation Template",
    price: "$ 60",
    description:
      "Full-coverage artwork templates tailored for all-over prints.",
  },
  {
    title: "Store Banner Design",
    price: "$ 10",
    description: "Create digital banners for your Store to communicate better.",
  },
  {
    title: "Flyer Design",
    price: "$ 10",
    description: "Marketing graphics designed for print-ready impact.",
  },
  {
    title: "Store Creation",
    price: "$ 10",
    description: "Create an amazing custom store from scratch",
  },
  {
    title: "Blank Product - PSD",
    price: "$ 30",
    description:
      "Request any Blank you would like to be added to your Catalog.",
  },
];

export const ServicesListSection = (): JSX.Element => {
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

      <section className="flex flex-col items-start gap-1 px-8 py-6 w-full z-[3]">
        <h1 className="font-title-semibold font-[number:var(--title-semibold-font-weight)] text-dark-blue-night text-[length:var(--title-semibold-font-size)] tracking-[var(--title-semibold-letter-spacing)] leading-[var(--title-semibold-line-height)] [font-style:var(--title-semibold-font-style)]">
          Ad-hoc Services
        </h1>
        <p className="font-body-reg font-[number:var(--body-reg-font-weight)] text-dark-blue-night text-[length:var(--body-reg-font-size)] tracking-[var(--body-reg-letter-spacing)] leading-[var(--body-reg-line-height)] [font-style:var(--body-reg-font-style)]">
          Pre-packaged services to replicate a store using existing Tri-POD
          replicators
        </p>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-[1128px] px-8 z-[2]">
        {servicesData.map((service, index) => (
          <Card
            key={index}
            className="border border-solid border-[#f0f0f5] rounded-2xl overflow-hidden bg-white"
          >
            <CardContent className="p-6">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-6">
                  <h3 className="flex-1 font-body-semibold font-[number:var(--body-semibold-font-weight)] text-dark-blue-night text-[length:var(--body-semibold-font-size)] tracking-[var(--body-semibold-letter-spacing)] leading-[var(--body-semibold-line-height)] [font-style:var(--body-semibold-font-style)]">
                    {service.title}
                  </h3>
                  <span className="font-subheading-semibold font-[number:var(--subheading-semibold-font-weight)] text-sky-blue-accent text-[length:var(--subheading-semibold-font-size)] tracking-[var(--subheading-semibold-letter-spacing)] leading-[var(--subheading-semibold-line-height)] whitespace-nowrap [font-style:var(--subheading-semibold-font-style)]">
                    {service.price}
                  </span>
                </div>
                <p className="font-body-2-reg font-[number:var(--body-2-reg-font-weight)] text-dark-blue-night text-[length:var(--body-2-reg-font-size)] tracking-[var(--body-2-reg-letter-spacing)] leading-[var(--body-2-reg-line-height)] [font-style:var(--body-2-reg-font-style)]">
                  {service.description}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <footer className="flex items-center justify-center px-8 py-[29px] w-full max-w-[1128px] mt-12 border-t border-solid border-[#eae9f9] z-0">
        <p className="font-body-2-reg font-[number:var(--body-2-reg-font-weight)] text-blue-space-cadet text-[length:var(--body-2-reg-font-size)] tracking-[var(--body-2-reg-letter-spacing)] leading-[var(--body-2-reg-line-height)] [font-style:var(--body-2-reg-font-style)]">
          Copyright © 2025 Tri-POD All rights reserved.
        </p>
      </footer>
    </div>
  );
};
