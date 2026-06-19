import { NavLink, Route, Routes } from "react-router-dom";
import {
  Inbox as InboxIcon,
  Plus,
  Settings as SettingsIcon,
  Plane,
  Sparkles,
} from "lucide-react";
import { Toaster } from "sonner";
import { cn } from "@/lib/utils";
import Inbox from "./pages/Inbox";
import ItemDetail from "./pages/ItemDetail";
import Capture from "./pages/Capture";
import Settings from "./pages/Settings";
import Ask from "./pages/Ask";

type TabDef = {
  to: string;
  end?: boolean;
  label: string;
  icon: typeof InboxIcon;
  primary?: boolean;
};

const TABS: TabDef[] = [
  { to: "/", end: true, label: "Inbox", icon: InboxIcon },
  { to: "/ask", label: "Chiedi", icon: Sparkles },
  { to: "/capture", label: "Cattura", icon: Plus, primary: true },
  { to: "/settings", label: "Impostazioni", icon: SettingsIcon },
];

function Tab({ to, end, label, icon: Icon, primary }: TabDef) {
  return (
    <NavLink
      to={to}
      end={end}
      className="group relative flex flex-1 flex-col items-center justify-center gap-1 rounded-xl py-1 text-[11px] font-medium press"
    >
      {({ isActive }) => (
        <>
          <span
            className={cn(
              "grid h-9 w-9 place-items-center rounded-xl transition-colors",
              primary
                ? "bg-aurora text-white glow"
                : isActive
                  ? "bg-elevated text-foreground"
                  : "text-muted-foreground group-hover:text-foreground",
            )}
          >
            <Icon className="h-[18px] w-[18px]" strokeWidth={2.2} aria-hidden />
          </span>
          <span
            className={cn(
              "transition-colors",
              isActive ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {label}
          </span>
          {isActive && !primary && (
            <span className="absolute -top-px h-0.5 w-7 rounded-full bg-aurora" aria-hidden />
          )}
        </>
      )}
    </NavLink>
  );
}

export default function App() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-[720px] flex-col">
      <div className="app-bg" aria-hidden />

      <header className="glass sticky top-0 z-10 flex items-center gap-2.5 border-b border-border px-4 pb-3 pt-safe">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-aurora text-white glow">
          <Plane className="h-[18px] w-[18px]" strokeWidth={2.4} aria-hidden />
        </span>
        <span className="font-display text-xl font-bold tracking-tight text-gradient">
          AlVolo
        </span>
        <span className="text-[13px] text-muted-foreground">cattura al volo</span>
      </header>

      <main className="flex-1 px-4 pb-28 pt-4">
        <Routes>
          <Route path="/" element={<Inbox />} />
          <Route path="/item/:id" element={<ItemDetail />} />
          <Route path="/ask" element={<Ask />} />
          <Route path="/capture" element={<Capture />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>

      <nav className="glass fixed inset-x-0 bottom-0 z-10 mx-auto flex max-w-[720px] items-stretch gap-1 border-t border-border px-2 pt-2 pb-safe">
        {TABS.map((t) => (
          <Tab key={t.to} {...t} />
        ))}
      </nav>

      <Toaster
        theme="dark"
        position="top-center"
        toastOptions={{
          style: {
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            color: "var(--color-foreground)",
          },
        }}
      />
    </div>
  );
}
