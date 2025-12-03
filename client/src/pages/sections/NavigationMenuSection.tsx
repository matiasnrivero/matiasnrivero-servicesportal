import { ChevronDownIcon } from "lucide-react";
import React from "react";
import { Link, useLocation } from "wouter";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

const menuItems = [
  {
    id: "orders",
    label: "Orders",
    icon: "/figmaAssets/icon---sidebar---orders.svg",
    hasDropdown: true,
    path: "#",
  },
  {
    id: "missing-production-files",
    label: "Missing Production Files",
    icon: "/figmaAssets/icon---sidebar---missing-production-files.svg",
    hasDropdown: false,
    path: "#",
  },
  {
    id: "proof-approvals",
    label: "Proof Approvals",
    icon: "/figmaAssets/icon---sidebar---proof-approvals.svg",
    hasDropdown: false,
    path: "#",
  },
  {
    id: "services-request",
    label: "Services Request",
    icon: "/figmaAssets/icon---sidebar---service-request.svg",
    hasDropdown: false,
    path: "/service-requests",
  },
  {
    id: "vendors",
    label: "Vendors",
    icon: "/figmaAssets/icon---sidebar---vendors.svg",
    hasDropdown: true,
    path: "#",
  },
  {
    id: "workspaces",
    label: "Workspaces",
    icon: "/figmaAssets/icon---sidebar---workspaces.svg",
    hasDropdown: false,
    path: "#",
  },
  {
    id: "tutorials",
    label: "Tutorials",
    icon: "/figmaAssets/icon---sidebar---tutorials.svg",
    hasDropdown: false,
    path: "#",
  },
  {
    id: "users",
    label: "Users",
    icon: "/figmaAssets/icon---sidebar---users.svg",
    hasDropdown: false,
    path: "#",
  },
  {
    id: "reports",
    label: "Reports",
    icon: "/figmaAssets/icon---sidebar---reports.svg",
    hasDropdown: true,
    path: "#",
  },
  {
    id: "help-center",
    label: "Help Center",
    icon: "/figmaAssets/icons-4.svg",
    hasDropdown: false,
    path: "#",
  },
  {
    id: "admin",
    label: "Admin",
    icon: "/figmaAssets/icon---sidebar---admin.svg",
    hasDropdown: true,
    path: "#",
  },
];

export const NavigationMenuSection = (): JSX.Element => {
  const [location] = useLocation();
  return (
    <aside className="flex flex-col w-full h-[700px] bg-white overflow-hidden">
      <header className="flex items-center justify-between px-4 h-[66px] border-b border-[#f0f0f5]">
        <div className="flex items-center justify-center w-36 h-12 p-[5px] bg-white">
          <img
            className="w-full h-[38px]"
            alt="Tri-POD Logo"
            src="/figmaAssets/img.svg"
          />
        </div>
        <Button variant="ghost" size="icon" className="w-6 h-6 p-0">
          <img className="w-6 h-6" alt="Menu" src="/figmaAssets/icons.svg" />
        </Button>
      </header>

      <ScrollArea className="flex-1">
        <nav className="flex flex-col gap-1.5 p-2">
          {menuItems.map((item) => {
            const isActive = location === item.path || 
                           (item.id === "services-request" && location.startsWith("/service-requests"));
            return (
              <Link key={item.id} href={item.path}>
                <Button
                  variant="ghost"
                  className={`w-full h-auto justify-between px-3.5 py-3 rounded ${
                    isActive
                      ? "bg-blue-space-cadet hover:bg-blue-space-cadet"
                      : "hover:bg-gray-100"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <img className="w-6 h-6" alt={item.label} src={item.icon} />
                    <span
                      className={`[font-family:'IBM_Plex_Sans',Helvetica] font-medium text-sm tracking-[0] leading-[19.6px] whitespace-nowrap ${
                        isActive ? "text-white" : "text-dark-blue-night"
                      }`}
                    >
                      {item.label}
                    </span>
                  </div>
                  {item.hasDropdown && (
                    <ChevronDownIcon
                      className={`w-6 h-6 ${
                        isActive ? "text-white" : "text-dark-blue-night"
                      }`}
                    />
                  )}
                </Button>
              </Link>
            );
          })}
        </nav>
      </ScrollArea>

      <footer className="flex items-center justify-between px-4 h-[66px] border-t border-[#f0f0f5]">
        <div className="flex items-center gap-2">
          <Avatar className="w-[40.09px] h-10 bg-blue-lavender border border-solid border-[#252f62]">
            <AvatarFallback className="font-dashboard-body-2-medium font-[number:var(--dashboard-body-2-medium-font-weight)] text-blue-space-cadet text-[length:var(--dashboard-body-2-medium-font-size)] tracking-[var(--dashboard-body-2-medium-letter-spacing)] leading-[var(--dashboard-body-2-medium-line-height)] [font-style:var(--dashboard-body-2-medium-font-style)]">
              JT
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col justify-center">
            <div className="font-body-2-med font-[number:var(--body-2-med-font-weight)] text-blue-space-cadet text-[length:var(--body-2-med-font-size)] tracking-[var(--body-2-med-letter-spacing)] leading-[var(--body-2-med-line-height)] whitespace-nowrap [font-style:var(--body-2-med-font-style)]">
              Justin T.
            </div>
            <div className="font-body-3-reg font-[number:var(--body-3-reg-font-weight)] text-blue-space-cadet text-[length:var(--body-3-reg-font-size)] tracking-[var(--body-3-reg-letter-spacing)] leading-[var(--body-3-reg-line-height)] whitespace-nowrap [font-style:var(--body-3-reg-font-style)]">
              Tri-POD Admin
            </div>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="w-6 h-6 p-0">
          <img
            className="w-6 h-6"
            alt="Settings"
            src="/figmaAssets/icons.svg"
          />
        </Button>
      </footer>
    </aside>
  );
};
