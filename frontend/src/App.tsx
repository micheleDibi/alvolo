import { NavLink, Route, Routes } from "react-router-dom";
import { Inbox as InboxIcon, Plus, Send, Settings as SettingsIcon } from "lucide-react";
import Inbox from "./pages/Inbox";
import ItemDetail from "./pages/ItemDetail";
import Capture from "./pages/Capture";
import Settings from "./pages/Settings";

export default function App() {
  return (
    <div className="app">
      <header className="topbar">
        <span className="brand-mark" aria-hidden>
          <Send size={16} strokeWidth={2.2} />
        </span>
        <span className="brand-text">
          <span className="brand">AlVolo</span>
          <span className="brand-sub">cattura al volo</span>
        </span>
      </header>

      <main className="content">
        <Routes>
          <Route path="/" element={<Inbox />} />
          <Route path="/item/:id" element={<ItemDetail />} />
          <Route path="/capture" element={<Capture />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>

      <nav className="tabbar">
        <NavLink to="/" end className="tab">
          <InboxIcon size={24} aria-hidden />
          <span>Inbox</span>
        </NavLink>
        <NavLink to="/capture" className="tab">
          <Plus size={24} aria-hidden />
          <span>Cattura</span>
        </NavLink>
        <NavLink to="/settings" className="tab">
          <SettingsIcon size={24} aria-hidden />
          <span>Impostazioni</span>
        </NavLink>
      </nav>
    </div>
  );
}
