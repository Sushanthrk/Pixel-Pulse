import { useEffect, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { RecDot, HairlineDivider } from "../components/Pieces";
import { toast } from "sonner";

export default function AdminClients() {
    const { setWorkspace, scopedClientId } = useAuth();
    const [clients, setClients] = useState([]);
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState({ name: "", company: "", email: "", password: "" });

    const load = async () => {
        setLoading(true);
        try {
            const { data } = await api.get("/admin/clients");
            setClients(data);
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail) || e.message);
        }
        setLoading(false);
    };

    useEffect(() => {
        load();
    }, []);

    const create = async (e) => {
        e.preventDefault();
        try {
            const { data } = await api.post("/admin/clients", form);
            toast.success(`Client ${data.name} created`);
            setForm({ name: "", company: "", email: "", password: "" });
            setOpen(false);
            load();
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail) || e.message);
        }
    };

    const toggle = async (id) => {
        try {
            await api.patch(`/admin/clients/${id}/toggle`);
            load();
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail) || e.message);
        }
    };

    const remove = async (id) => {
        if (!window.confirm("Delete this client and all related data?")) return;
        try {
            await api.delete(`/admin/clients/${id}`);
            if (scopedClientId === id) setWorkspace(null);
            load();
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail) || e.message);
        }
    };

    return (
        <div data-testid="admin-clients-page">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <RecDot />
                        <span className="font-mono-tech text-[10px] text-[#a0a0ab]">
                            // admin console / clients
                        </span>
                    </div>
                    <h1 className="font-display uppercase tracking-tight font-black text-4xl sm:text-5xl">
                        Client roster
                    </h1>
                </div>
                <button
                    onClick={() => setOpen(true)}
                    className="pg-btn-primary"
                    data-testid="create-client-btn"
                >
                    + New client
                </button>
            </div>

            <HairlineDivider className="mb-6" />

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {clients.length === 0 && !loading && (
                    <div className="text-[#a0a0ab] text-sm font-mono col-span-full">
                        No clients yet.
                    </div>
                )}
                {clients.map((c) => (
                    <div
                        key={c.id}
                        className="pg-card p-6"
                        data-testid={`client-card-${c.id}`}
                    >
                        <span className="bracket tl" />
                        <span className="bracket br" />
                        <div className="flex items-start justify-between mb-4">
                            <div>
                                <div className="font-display uppercase tracking-tight font-bold text-xl mb-1">
                                    {c.name}
                                </div>
                                <div className="text-[#a0a0ab] text-xs font-mono uppercase tracking-widest">
                                    {c.company || "—"}
                                </div>
                            </div>
                            <span
                                className={`pg-badge ${c.is_active ? "connected" : ""}`}
                                data-testid={`client-status-${c.id}`}
                            >
                                ● {c.is_active ? "Active" : "Disabled"}
                            </span>
                        </div>
                        <div className="text-[#a0a0ab] text-sm mb-5 font-mono break-all">
                            {c.email}
                        </div>
                        <HairlineDivider className="mb-4" />
                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={() => setWorkspace(c.id)}
                                className="pg-btn-secondary !text-[10px] !px-4 !py-2"
                                data-testid={`open-${c.id}`}
                            >
                                Open
                            </button>
                            <button
                                onClick={() => toggle(c.id)}
                                className="pg-btn-secondary !text-[10px] !px-4 !py-2"
                                data-testid={`toggle-${c.id}`}
                            >
                                {c.is_active ? "Disable" : "Enable"}
                            </button>
                            <button
                                onClick={() => remove(c.id)}
                                className="pg-btn-ghost"
                                data-testid={`delete-${c.id}`}
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {open && (
                <div
                    className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                    onClick={() => setOpen(false)}
                >
                    <form
                        onClick={(e) => e.stopPropagation()}
                        onSubmit={create}
                        className="pg-card p-8 w-full max-w-md"
                        data-testid="create-client-modal"
                    >
                        <span className="bracket tl !opacity-100" />
                        <span className="bracket br !opacity-100" />
                        <h2 className="font-display uppercase font-bold text-2xl tracking-tight mb-1">
                            New client
                        </h2>
                        <p className="text-[#a0a0ab] text-sm mb-6">
                            Creates an active workspace plus a client login.
                        </p>
                        <label className="pg-label">Display name</label>
                        <input
                            required
                            value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                            className="pg-input mt-2 mb-4"
                            data-testid="new-client-name"
                        />
                        <label className="pg-label">Company</label>
                        <input
                            value={form.company}
                            onChange={(e) => setForm({ ...form, company: e.target.value })}
                            className="pg-input mt-2 mb-4"
                            data-testid="new-client-company"
                        />
                        <label className="pg-label">Email</label>
                        <input
                            required
                            type="email"
                            value={form.email}
                            onChange={(e) => setForm({ ...form, email: e.target.value })}
                            className="pg-input mt-2 mb-4"
                            data-testid="new-client-email"
                        />
                        <label className="pg-label">Temporary password</label>
                        <input
                            required
                            value={form.password}
                            onChange={(e) => setForm({ ...form, password: e.target.value })}
                            className="pg-input mt-2 mb-6"
                            data-testid="new-client-password"
                        />
                        <div className="flex gap-3">
                            <button
                                type="button"
                                className="pg-btn-secondary"
                                onClick={() => setOpen(false)}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="pg-btn-primary"
                                data-testid="save-client-btn"
                            >
                                Create client
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}
