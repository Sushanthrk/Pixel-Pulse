import { NavLink, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";
import { RecDot, Timecode, HairlineDivider } from "./Pieces";

const CLIENT_NAV = [
    { to: "/dashboard", label: "Pulse" },
    { to: "/channels", label: "Channels" },
    { to: "/analytics", label: "Analytics" },
    { to: "/competitors", label: "Competitors" },
    { to: "/geo", label: "Geo" },
    { to: "/seo", label: "Seo" },
    { to: "/plan", label: "Plan" },
];

const ADMIN_NAV = [{ to: "/admin/clients", label: "Clients" }, ...CLIENT_NAV];

export default function Layout({ children }) {
    const { user, logout, scopedClientId, setWorkspace } = useAuth();
    const navigate = useNavigate();
    const [clients, setClients] = useState([]);

    useEffect(() => {
        if (user && user.role === "admin") {
            api.get("/admin/clients")
                .then((r) => setClients(r.data || []))
                .catch(() => {});
        }
    }, [user]);

    if (!user) return null;

    const nav = user.role === "admin" ? ADMIN_NAV : CLIENT_NAV;
    const currentClient =
        user.role === "client"
            ? user.client?.name
            : (clients.find((c) => c.id === scopedClientId)?.name) || "Select workspace";

    const handleLogout = async () => {
        await logout();
        navigate("/login", { replace: true });
    };

    return (
        <div className="min-h-screen bg-[#050505] text-[#fafafa] font-body">
            <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#050505]/85 border-b border-[#a0a0ab]/15">
                <div className="max-w-7xl mx-auto px-6 lg:px-8 h-14 flex items-center justify-between gap-6">
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-3" data-testid="brand">
                            <RecDot label="LIVE" />
                            <span className="font-display font-bold tracking-tight uppercase text-sm">
                                Pixelgrok
                                <span className="text-[#e6192b]">·</span>Pulse
                            </span>
                        </div>
                        <span className="hidden md:inline-block w-px h-4 bg-[#a0a0ab]/25" />
                        <Timecode />
                    </div>

                    <nav className="hidden md:flex items-center gap-6">
                        {nav.map((item) => (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                className={({ isActive }) =>
                                    `nav-link ${isActive ? "active" : ""}`
                                }
                                data-testid={`nav-${item.label.toLowerCase()}`}
                            >
                                {item.label}
                            </NavLink>
                        ))}
                    </nav>

                    <div className="flex items-center gap-4">
                        {user.role === "admin" && (
                            <select
                                value={scopedClientId || ""}
                                onChange={(e) => setWorkspace(e.target.value || null)}
                                className="pg-input !py-1 !text-xs !w-44"
                                data-testid="nav-workspace-switcher"
                            >
                                <option value="">— Workspace —</option>
                                {clients.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.name}
                                    </option>
                                ))}
                            </select>
                        )}
                        <span className="hidden md:inline text-[#a0a0ab] text-xs font-mono tracking-widest uppercase">
                            {user.role}
                        </span>
                        <button
                            className="pg-btn-ghost"
                            onClick={handleLogout}
                            data-testid="logout-btn"
                        >
                            Sign out
                        </button>
                    </div>
                </div>
                <div className="md:hidden border-t border-[#a0a0ab]/10 overflow-x-auto scrollbar-none">
                    <div className="flex gap-5 px-6 py-2 whitespace-nowrap">
                        {nav.map((item) => (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                className={({ isActive }) =>
                                    `nav-link ${isActive ? "active" : ""}`
                                }
                            >
                                {item.label}
                            </NavLink>
                        ))}
                    </div>
                </div>
            </header>
            <main className="max-w-7xl mx-auto px-6 lg:px-8 pt-10 pb-16 animate-fade-in">
                {user.role === "admin" && !scopedClientId ? (
                    <NoWorkspaceNotice clients={clients} />
                ) : (
                    children
                )}
            </main>
            <footer className="border-t border-[#a0a0ab]/10 mt-12">
                <div className="max-w-7xl mx-auto px-6 lg:px-8 py-6 flex justify-between text-[10px] uppercase tracking-widest text-[#a0a0ab]">
                    <span>Pixelgrok Pulse · Brand authority lab</span>
                    <span>Currently logged in as {user.email}</span>
                </div>
            </footer>
            <HairlineDivider />
        </div>
    );
}

function NoWorkspaceNotice({ clients }) {
    const { setWorkspace } = useAuth();
    return (
        <div className="pg-card p-10 max-w-2xl mx-auto" data-testid="no-workspace">
            <div className="font-mono-tech text-[#a0a0ab] text-xs mb-3">// Admin console</div>
            <h2 className="font-display text-3xl uppercase tracking-tight font-bold mb-3">
                Pick a client workspace
            </h2>
            <p className="text-[#a0a0ab] mb-6 text-sm leading-relaxed">
                As admin, every analytics page is scoped to a client. Select an existing
                workspace or head to the Clients tab to create one.
            </p>
            <div className="flex flex-col gap-2">
                {clients.length === 0 && (
                    <div className="text-sm text-[#a0a0ab]">
                        No clients yet — open the <strong>Clients</strong> tab to seed your first one.
                    </div>
                )}
                {clients.map((c) => (
                    <button
                        key={c.id}
                        className="text-left pg-card !p-4 cursor-pointer"
                        onClick={() => setWorkspace(c.id)}
                        data-testid={`workspace-pick-${c.id}`}
                    >
                        <div className="flex items-center justify-between">
                            <span className="font-display uppercase tracking-tight font-semibold">
                                {c.name}
                            </span>
                            <span className="font-mono text-xs text-[#a0a0ab] uppercase tracking-widest">
                                {c.company || c.email}
                            </span>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
}
