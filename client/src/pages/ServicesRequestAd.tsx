import React from "react";
import { ServicesListSection } from "./sections/ServicesListSection";
import { Header } from "@/components/Header";

export const ServicesRequestAd = (): JSX.Element => {
  return (
    <main className="flex flex-col w-full min-h-screen bg-light-grey">
      <Header />
      <ServicesListSection />
    </main>
  );
};
