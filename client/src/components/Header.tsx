import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";

export function Header() {
  const [location] = useLocation();

  return (
    <header className="flex w-full items-center justify-between gap-12 px-8 py-4 bg-white shadow-shadow-top-bar">
      <div className="flex items-center gap-8">
        <Link href="/">
          <h1 className="font-title-semibold text-dark-blue-night text-xl cursor-pointer">
            Artwork Services
          </h1>
        </Link>
        <nav className="flex items-center gap-4">
          <Link href="/">
            <Button
              variant={location === "/" ? "default" : "ghost"}
              className={location === "/" ? "bg-sky-blue-accent hover:bg-sky-blue-accent/90" : ""}
            >
              Services
            </Button>
          </Link>
          <Link href="/service-requests">
            <Button
              variant={location.startsWith("/service-requests") && location !== "/service-requests/new" ? "default" : "ghost"}
              className={location.startsWith("/service-requests") && location !== "/service-requests/new" ? "bg-sky-blue-accent hover:bg-sky-blue-accent/90" : ""}
            >
              My Requests
            </Button>
          </Link>
          <Link href="/service-requests/new">
            <Button
              variant={location === "/service-requests/new" ? "default" : "ghost"}
              className={location === "/service-requests/new" ? "bg-sky-blue-accent hover:bg-sky-blue-accent/90" : ""}
            >
              New Request
            </Button>
          </Link>
        </nav>
      </div>
    </header>
  );
}
