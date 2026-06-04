import { Link, useLocation } from "@tanstack/react-router";
import { Home, Sparkles, List } from "lucide-react";
import { cn } from "@/lib/utils";

type Item = { to: string; icon: typeof Home; label: string };
const items: Item[] = [
  { to: "/home", icon: Home, label: "Início" },
  { to: "/expenses", icon: List, label: "Despesas" },
  { to: "/insights", icon: Sparkles, label: "AI" },
];

export function BottomNav() {
  const { pathname } = useLocation();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto flex max-w-md items-center justify-around px-2 py-2">
        {items.map(({ to, icon: Icon, label }) => {
          const active = pathname === to;
          return (
            <Link
              key={to}
              to={to as string}
              className={cn(
                "flex flex-col items-center gap-1 px-4 py-2 text-[11px] font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
