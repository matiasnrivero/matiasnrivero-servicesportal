import React from "react";
import { NavigationMenuSection } from "./sections/NavigationMenuSection";
import { ServicesListSection } from "./sections/ServicesListSection";

export const ServicesRequestAd = (): JSX.Element => {
  return (
    <main className="flex w-full max-w-[1440px] min-w-[1440px] min-h-[700px] bg-light-grey">
      <NavigationMenuSection />
      <ServicesListSection />
    </main>
  );
};
