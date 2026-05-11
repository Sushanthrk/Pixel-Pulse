import { useEffect, useMemo, useState } from "react";
import { api, formatApiError, platformLabel } from "../lib/api";
import { useClientQuery } from "../contexts/AuthContext";
import { RecDot, HairlineDivider, Brackets } from "../components/Pieces";
import { toast } from "sonner";
import {
    BarChart,
    Bar,
    ResponsiveContainer,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
} from "recharts";

export default function Analytics() {
    const cq = useClientQuery();
    const [posts, setPosts] = useState([]);
    const [channels, setChannels] = useState([]);
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState({
        channel_id: "",
        title: "",
        snippet: "",
        url: "",
        posted_at: new Date().toISOString().slice(0, 16),
        likes: 0,
        comments: 0,
        shares: 0,
        views: 0,
        media_type: "text",
        hashtags: "",
    });

    const load = async () => {
        try {
            const [p, c] = await Promise.all([
                api.get("/posts", cq),
                api.get("/channels", cq),
            ]);
            setPosts(p.data);
            setChannels(c.data);
        } catch (_) {}
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(cq)]);

    const submit = async (e) => {
        e.preventDefault();
        try {
            const payload = {
                ...form,
                likes: +form.likes || 0,
                comments: +form.comments || 0,
                shares: +form.shares || 0,
                views: +form.views || 0,
                posted_at: new Date(form.posted_at).toISOString(),
                hashtags: form.hashtags
                    .split(",")
                    .map((h) => h.trim().replace(/^#/, ""))
                    .filter(Boolean),
            };
            await api.post("/posts", payload, cq);
            toast.success("Manual post added");
            setOpen(false);
            load();
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail) || e.message);
        }
    };

    const remove = async (id) => {
        if (!window.confirm("Delete post?")) return;
        try {
            await api.delete(`/posts/${id}`);
            load();
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail) || e.message);
        }
    };

    const frequency = useMemo(() => {
        const buckets = {};
        const now = new Date();
        for (let i = 11; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i * 7);
            const key = d.toISOString().slice(0, 10);
            buckets[key] = 0;
        }
        const sortedKeys = Object.keys(buckets);
        posts.forEach((p) => {
            const ts = new Date(p.posted_at).getTime();
            for (let i = sortedKeys.length - 1; i >= 0; i--) {
                const k = sortedKeys[i];
                if (ts >= new Date(k).getTime()) {
                    buckets[k] += 1;
                    break;
                }
            }
        });
        return sortedKeys.map((day) => ({ day: day.slice(5), posts: buckets[day] }));
    }, [posts]);

    return (
        <div data-testid="analytics-page">
            <div className="flex items-center gap-3 mb-2">
                <RecDot />
                <span className="font-mono-tech text-[10px] text-[#a0a0ab]">
                    // own channels / feed
                </span>
            </div>
            <div className="flex flex-wrap justify-between items-end gap-4 mb-8">
                <h1 className="font-display uppercase tracking-tight font-black text-4xl sm:text-5xl">
                    Post feed
                </h1>
                <button
                    onClick={() => setOpen(true)}
                    className="pg-btn-primary"
                    data-testid="add-manual-post-btn"
                >
                    + Manual entry
                </button>
            </div>
            <HairlineDivider className="mb-6" />

            <div className="pg-card p-6 mb-8">
                <Brackets />
                <div className="font-mono-tech text-[10px] text-[#a0a0ab] mb-3">
                    // posting frequency / weekly buckets
                </div>
                <h3 className="font-display uppercase tracking-tight font-bold text-xl mb-4">
                    Cadence
                </h3>
                <div className="h-56">
                    <ResponsiveContainer>
                        <BarChart data={frequency}>
                            <CartesianGrid stroke="rgba(160,160,171,0.1)" />
                            <XAxis dataKey="day" stroke="#a0a0ab" fontSize={11} tickLine={false} />
                            <YAxis stroke="#a0a0ab" fontSize={11} tickLine={false} axisLine={false} />
                            <Tooltip
                                contentStyle={{
                                    background: "#050505",
                                    border: "1px solid rgba(160,160,171,0.2)",
                                    borderRadius: 0,
                                    fontFamily: "monospace",
                                    fontSize: 11,
                                }}
                            />
                            <Bar dataKey="posts" fill="#e6192b" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="pg-card p-0 overflow-hidden">
                <div className="px-6 py-4 flex justify-between items-center">
                    <h3 className="font-display uppercase tracking-tight font-bold text-xl">
                        Recent posts
                    </h3>
                    <span className="font-mono-tech text-[10px] text-[#a0a0ab]">
                        {posts.length} entries
                    </span>
                </div>
                <HairlineDivider />
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="font-mono-tech text-[10px] text-[#a0a0ab]">
                            <tr className="border-b border-[#a0a0ab]/15">
                                <th className="text-left px-6 py-3">Date</th>
                                <th className="text-left px-6 py-3">Platform</th>
                                <th className="text-left px-6 py-3">Title</th>
                                <th className="text-left px-6 py-3">Source</th>
                                <th className="text-right px-6 py-3">♥</th>
                                <th className="text-right px-6 py-3">✎</th>
                                <th className="text-right px-6 py-3">↺</th>
                                <th className="text-right px-6 py-3">▶</th>
                                <th className="px-6 py-3" />
                            </tr>
                        </thead>
                        <tbody className="font-body">
                            {posts.length === 0 && (
                                <tr>
                                    <td
                                        colSpan="9"
                                        className="text-[#a0a0ab] text-sm px-6 py-8 text-center"
                                    >
                                        No posts yet. Sync a connected channel or add a manual entry.
                                    </td>
                                </tr>
                            )}
                            {posts.map((p) => (
                                <tr
                                    key={p.id}
                                    className="border-b border-[#a0a0ab]/10 hover:bg-[#fafafa]/[0.03]"
                                    data-testid={`post-row-${p.id}`}
                                >
                                    <td className="px-6 py-3 font-mono text-xs text-[#a0a0ab] tabular-nums">
                                        {new Date(p.posted_at).toISOString().slice(0, 10)}
                                    </td>
                                    <td className="px-6 py-3 text-xs uppercase tracking-widest text-[#a0a0ab] font-mono">
                                        {platformLabel(p.platform)}
                                    </td>
                                    <td className="px-6 py-3 max-w-sm">
                                        <a
                                            href={p.url || "#"}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[#fafafa] hover:text-[#e6192b]"
                                        >
                                            {(p.title || p.snippet || "Untitled").slice(0, 80)}
                                        </a>
                                    </td>
                                    <td className="px-6 py-3">
                                        <span
                                            className={`pg-badge ${p.source === "auto" ? "connected" : p.source === "mock" ? "mock" : ""}`}
                                        >
                                            ● {p.source}
                                        </span>
                                    </td>
                                    <td className="px-6 py-3 text-right font-mono tabular-nums">{p.likes}</td>
                                    <td className="px-6 py-3 text-right font-mono tabular-nums">{p.comments}</td>
                                    <td className="px-6 py-3 text-right font-mono tabular-nums">{p.shares}</td>
                                    <td className="px-6 py-3 text-right font-mono tabular-nums">{p.views}</td>
                                    <td className="px-6 py-3 text-right">
                                        <button
                                            onClick={() => remove(p.id)}
                                            className="pg-btn-ghost"
                                            data-testid={`remove-post-${p.id}`}
                                        >
                                            ×
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {open && (
                <div
                    className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                    onClick={() => setOpen(false)}
                >
                    <form
                        onClick={(e) => e.stopPropagation()}
                        onSubmit={submit}
                        className="pg-card p-8 w-full max-w-lg"
                        data-testid="manual-post-modal"
                    >
                        <span className="bracket tl !opacity-100" />
                        <span className="bracket br !opacity-100" />
                        <h2 className="font-display uppercase font-bold text-2xl tracking-tight mb-1">
                            Manual post entry
                        </h2>
                        <p className="text-[#a0a0ab] text-sm mb-5">
                            For platforms with no free API (LinkedIn, X). Paste link + numbers.
                        </p>
                        <label className="pg-label">Channel</label>
                        <select
                            required
                            value={form.channel_id}
                            onChange={(e) => setForm({ ...form, channel_id: e.target.value })}
                            className="pg-input mt-2 mb-3"
                            data-testid="manual-post-channel"
                        >
                            <option value="">— pick a channel —</option>
                            {channels.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {platformLabel(c.platform)} · {c.handle || c.url}
                                </option>
                            ))}
                        </select>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="pg-label">Posted at</label>
                                <input
                                    type="datetime-local"
                                    value={form.posted_at}
                                    onChange={(e) => setForm({ ...form, posted_at: e.target.value })}
                                    className="pg-input mt-2"
                                />
                            </div>
                            <div>
                                <label className="pg-label">Media type</label>
                                <select
                                    value={form.media_type}
                                    onChange={(e) => setForm({ ...form, media_type: e.target.value })}
                                    className="pg-input mt-2"
                                >
                                    <option value="text">Text</option>
                                    <option value="image">Image</option>
                                    <option value="video">Video</option>
                                </select>
                            </div>
                        </div>

                        <label className="pg-label mt-3 block">Title</label>
                        <input
                            value={form.title}
                            onChange={(e) => setForm({ ...form, title: e.target.value })}
                            className="pg-input mt-2 mb-3"
                            data-testid="manual-post-title"
                        />

                        <label className="pg-label">Snippet / caption</label>
                        <textarea
                            rows={2}
                            value={form.snippet}
                            onChange={(e) => setForm({ ...form, snippet: e.target.value })}
                            className="pg-input mt-2 mb-3"
                        />

                        <label className="pg-label">Post URL</label>
                        <input
                            value={form.url}
                            onChange={(e) => setForm({ ...form, url: e.target.value })}
                            className="pg-input mt-2 mb-3"
                            placeholder="https://…"
                        />

                        <div className="grid grid-cols-4 gap-3">
                            {["likes", "comments", "shares", "views"].map((k) => (
                                <div key={k}>
                                    <label className="pg-label">{k}</label>
                                    <input
                                        type="number"
                                        value={form[k]}
                                        onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                                        className="pg-input mt-2"
                                    />
                                </div>
                            ))}
                        </div>

                        <label className="pg-label mt-3 block">Hashtags (comma sep)</label>
                        <input
                            value={form.hashtags}
                            onChange={(e) => setForm({ ...form, hashtags: e.target.value })}
                            className="pg-input mt-2 mb-5"
                            placeholder="brand, india, b2b"
                        />

                        <div className="flex gap-3">
                            <button type="button" className="pg-btn-secondary" onClick={() => setOpen(false)}>
                                Cancel
                            </button>
                            <button type="submit" className="pg-btn-primary" data-testid="save-manual-post">
                                Save post
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}
