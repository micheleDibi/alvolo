import { NavLink, Route, Routes } from "react-router-dom";
import Inbox from "./pages/Inbox";
import ItemDetail from "./pages/ItemDetail";
import Capture from "./pages/Capture";
import Settings from "./pages/Settings";

export default function App() {
  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">AlVolo</span>
        <span className="brand-sub">cattura al volo</span>
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
          <span className="tab-ico">🗂️</span>
          <span>Inbox</span>
        </NavLink>
        <NavLink to="/capture" className="tab tab-primary">
          <span className="tab-ico">＋</span>
          <span>Cattura</span>
        </NavLink>
        <NavLink to="/settings" className="tab">
          <span className="tab-ico">⚙️</span>
          <span>Impostazioni</span>
        </NavLink>
      </nav>
    </div>
  );
}
