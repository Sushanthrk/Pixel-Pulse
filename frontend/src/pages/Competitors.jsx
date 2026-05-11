import { useEffect, useMemo, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { useClientQuery } from "../contexts/AuthContext";
import { RecDot, HairlineDivider, Brackets } from "../components/Pieces";
import { toast } from "sonner";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "../components/ui/select";
import PlatformIcon from "../components/PlatformIcon";
import { PLATFORM_META, PLATFORM_KEYS, platformMeta } from "../lib/platforms";

const DONUT_COLORS = ["#e6192b", "#fafafa", "#a0a0ab", "#4a0b10", "#222222"];

export default function Competitors() {
    const cq = useClientQuery();
    const [competitors, setCompetitors] = useState([]);
    const [posts, setPosts] = useState({}); // competitor_id -> posts[]
    const [selected, setSelected] = useState(null);
    const [form, setForm] = useState({ platform: "youtube", handle: "", url: "" });
    const [busy, setBusy] = useState(null);
    const [clusterText, setClusterText] = useState({});

    const load = async () => {
        try {
            const { data } = await api.get("/competitors", cq);
            setCompetitors(data);
            if (data.length > 0 && !selected) setSelected(data[0].id);
            for (const c of data) {
                const p = await api.get(`/competitors/${c.id}/posts`);
                setPosts((prev) => ({ ...prev, [c.id]: p.data }));
            }
        } catch (_) {}
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(cq)]);

    const add = async (e) => {
        e.preventDefault();
        try {
            await api.post("/competitors", form, cq);
            toast.success("Competitor added");
            setForm({ platform: "youtube", handle: "", url: "" });
            load();
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail) || e.message);
        }
    };

    const sync = async (id) => {
        setBusy(id);
        try {
            const { data } = await api.post(`/competitors/${id}/sync`);
            if (data.is_real) toast.success(`Pulled ${data.inserted} posts`);
            else toast(`Inserted ${data.inserted} mock posts (no API key)`);
            load();
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail) || e.message);
        }
        setBusy(null);
    };

    const cluster = async (id) => {
        setBusy(`cluster-${id}`);
        try {
            const { data } = await api.post(`/competitors/${id}/cluster`);
            setClusterText((s) => ({ ...s, [id]: data.clusters_text || data.note }));
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail) || e.message);
        }
        setBusy(null);
    };

    const remove = async (id) => {
        if (!window.confirm("Remove competitor?")) return;
        try {
            await api.delete(`/competitors/${id}`);
            setSelected(null);
            load();
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail) || e.message);
        }
    };

    const current = competitors.find((c) => c.id === selected);
    const currentPosts = posts[selected] || [];

    return (
        <div data-testid="competitors-page">
            <div className="flex items-center gap-3 mb-2">
                <RecDot />
                <span className="font-mono-tech text-[10px] text-[#a0a0ab]">
                    // intelligence / competitors
                </span>
            </div>
            <h1 className="font-display uppercase tracking-tight font-black text-4xl sm:text-5xl mb-8">
                Competitor radar
            </h1>
            <HairlineDivider className="mb-6" />

            <div className="grid lg:grid-cols-3 gap-6 mb-8">
                <form onSubmit={add} className="pg-card p-6" data-testid="add-competitor-form">
                    <Brackets />
                    <div className="font-mono-tech text-[10px] text-[#a0a0ab] mb-3">
                        // add competitor
                    </div>
                    <h3 className="font-display uppercase font-bold tracking-tight text-xl mb-4">
                        Track a rival
                    </h3>
                    <label className="pg-label">Platform</label>
                    <Select value={form.platform} onValueChange={(v) => setForm({ ...form, platform: v })}>
                        <SelectTrigger className="mt-2 mb-4 h-11 rounded-none bg-[#0a0a0a] border-[#a0a0ab]/30 hover:border-[#fafafa] text-[#fafafa] focus:ring-1 focus:ring-[#e6192b]">
                            <SelectValue>
                                <span className="inline-flex items-center gap-2">
                                    <PlatformIcon platform={form.platform} size={16} />
                                    <span className="font-mono uppercase tracking-widest text-xs">
                                        {platformMeta(form.platform).label}
                                    </span>
                                </span>
                            </SelectValue>
                        </SelectTrigger>
                        <SelectContent className="bg-[#0a0a0a] border-[#a0a0ab]/30 rounded-none text-[#fafafa]">
                            {PLATFORM_KEYS.map((k) => (
                                <SelectItem
                                    key={k}
                                    value={k}
                                    className="rounded-none focus:bg-[#fafafa]/10 focus:text-[#fafafa]"
                                >
                                    <span className="inline-flex items-center gap-3">
                                        <PlatformIcon platform={k} size={16} />
                                        <span className="font-mono uppercase tracking-widest text-xs">
                                            {PLATFORM_META[k].label}
                                        </span>
                                    </span>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <label className="pg-label">Handle</label>
                    <input
                        value={form.handle}
                        onChange={(e) => setForm({ ...form, handle: e.target.value })}
                        className="pg-input mt-2 mb-4"
                        data-testid="new-competitor-handle"
                    />
                    <label className="pg-label">URL / RSS</label>
                    <input
                        value={form.url}
                        onChange={(e) => setForm({ ...form, url: e.target.value })}
                        className="pg-input mt-2 mb-5"
                    />
                    <button type="submit" className="pg-btn-primary w-full justify-center">
                        Add
                    </button>
                </form>

                <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                    {competitors.length === 0 && (
                        <div className="text-[#a0a0ab] text-sm font-mono">
                            No competitors yet. Add up to 5 per platform.
                        </div>
                    )}
                    {competitors.map((c) => {
                        const meta = platformMeta(c.platform);
                        return (
                        <button
                            key={c.id}
                            onClick={() => setSelected(c.id)}
                            className={`pg-card p-4 text-left relative overflow-hidden ${selected === c.id ? "!border-[#e6192b]" : ""}`}
                            data-testid={`competitor-${c.id}`}
                            style={{ boxShadow: `inset 3px 0 0 0 ${meta.color}` }}
                        >
                            <Brackets />
                            <div
                                className="absolute top-0 right-0 w-20 h-20 opacity-[0.08] pointer-events-none"
                                style={{ background: `radial-gradient(circle at top right, ${meta.color}, transparent 70%)` }}
                            />
                            <div className="flex justify-between items-start relative">
                                <div className="flex items-center gap-3">
                                    <PlatformIcon platform={c.platform} size={26} />
                                    <div>
                                        <div className="font-display uppercase tracking-tight font-bold">
                                            {c.handle}
                                        </div>
                                        <div className="text-[10px] font-mono text-[#a0a0ab] uppercase tracking-widest mt-1">
                                            {meta.label}
                                        </div>
                                    </div>
                                </div>
                                <span className="font-mono text-[10px] text-[#a0a0ab]">
                                    {(posts[c.id] || []).length} posts
                                </span>
                            </div>
                        </button>
                    );})}
                </div>
            </div>

            {current && (
                <CompetitorDetail
                    competitor={current}
                    posts={currentPosts}
                    onSync={() => sync(current.id)}
                    onCluster={() => cluster(current.id)}
                    onRemove={() => remove(current.id)}
                    busy={busy}
                    clusterText={clusterText[current.id]}
                />
            )}
        </div>
    );
}

function CompetitorDetail({ competitor, posts, onSync, onCluster, onRemove, busy, clusterText }) {
    const mix = useMemo(() => {
        const counts = { text: 0, image: 0, video: 0 };
        posts.forEach((p) => {
            counts[p.media_type || "text"] = (counts[p.media_type || "text"] || 0) + 1;
        });
        return Object.entries(counts)
            .filter(([, v]) => v > 0)
            .map(([name, value]) => ({ name, value }));
    }, [posts]);

    const heatmap = useMemo(() => {
        // 7 days × 24 hours
        const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
        posts.forEach((p) => {
            const d = new Date(p.posted_at);
            grid[d.getUTCDay()][d.getUTCHours()] += 1;
        });
        const max = Math.max(1, ...grid.flat());
        return { grid, max };
    }, [posts]);

    const topHashtags = useMemo(() => {
        const c = {};
        posts.forEach((p) => (p.hashtags || []).forEach((h) => (c[h] = (c[h] || 0) + 1)));
        return Object.entries(c)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);
    }, [posts]);

    const dayNames = ["S", "M", "T", "W", "T", "F", "S"];

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-12">
            <div className="pg-card p-6 lg:col-span-2">
                <Brackets />
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <div className="font-mono-tech text-[10px] text-[#a0a0ab]">
                            // heatmap · UTC
                        </div>
                        <h3 className="font-display uppercase tracking-tight font-bold text-xl">
                            {competitor.handle} · posting heatmap
                        </h3>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={onSync}
                            disabled={!!busy}
                            className="pg-btn-secondary !text-[10px] !px-4 !py-2"
                            data-testid="sync-competitor"
                        >
                            {busy === competitor.id ? "Syncing…" : "Sync"}
                        </button>
                        <button
                            onClick={onCluster}
                            disabled={!!busy}
                            className="pg-btn-secondary !text-[10px] !px-4 !py-2"
                            data-testid="cluster-competitor"
                        >
                            {busy === `cluster-${competitor.id}` ? "Clustering…" : "Cluster topics"}
                        </button>
                        <button onClick={onRemove} className="pg-btn-ghost">
                            Remove
                        </button>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="text-[10px] font-mono">
                        <tbody>
                            {heatmap.grid.map((row, d) => (
                                <tr key={d}>
                                    <td className="text-[#a0a0ab] pr-2">{dayNames[d]}</td>
                                    {row.map((v, h) => (
                                        <td key={h} className="p-px">
                                            <div
                                                className="heatmap-cell"
                                                style={{
                                                    background:
                                                        v === 0
                                                            ? "transparent"
                                                            : `rgba(230,25,43,${0.15 + (v / heatmap.max) * 0.85})`,
                                                    width: 14,
                                                    height: 14,
                                                }}
                                                title={`${dayNames[d]} ${h}:00 → ${v}`}
                                            />
                                        </td>
                                    ))}
                                </tr>
                            ))}
                            <tr>
                                <td />
                                {Array.from({ length: 24 }).map((_, h) => (
                                    <td
                                        key={h}
                                        className="text-[#a0a0ab] text-[8px] text-center"
                                    >
                                        {h % 4 === 0 ? h : ""}
                                    </td>
                                ))}
                            </tr>
                        </tbody>
                    </table>
                </div>
                <HairlineDivider className="my-5" />
                <div>
                    <div className="font-mono-tech text-[10px] text-[#a0a0ab] mb-2">
                        // top hashtags
                    </div>
                    {topHashtags.length === 0 && (
                        <div className="text-[#a0a0ab] text-sm">No hashtags captured yet.</div>
                    )}
                    <div className="flex flex-wrap gap-2">
                        {topHashtags.map(([h, n]) => (
                            <span key={h} className="pg-badge">
                                #{h} · {n}
                            </span>
                        ))}
                    </div>
                </div>
            </div>

            <div className="pg-card p-6">
                <Brackets />
                <div className="font-mono-tech text-[10px] text-[#a0a0ab] mb-2">
                    // content mix
                </div>
                <h3 className="font-display uppercase tracking-tight font-bold text-xl mb-4">
                    Format split
                </h3>
                <div className="h-48">
                    <ResponsiveContainer>
                        <PieChart>
                            <Pie
                                data={mix}
                                innerRadius={45}
                                outerRadius={75}
                                dataKey="value"
                                stroke="#050505"
                                strokeWidth={2}
                            >
                                {mix.map((_, i) => (
                                    <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip
                                contentStyle={{
                                    background: "#050505",
                                    border: "1px solid rgba(160,160,171,0.2)",
                                    borderRadius: 0,
                                    fontFamily: "monospace",
                                    fontSize: 11,
                                }}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3">
                    {mix.map((m, i) => (
                        <div key={m.name} className="text-[10px] font-mono uppercase tracking-widest">
                            <span
                                className="inline-block w-2 h-2 mr-1"
                                style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }}
                            />
                            {m.name} · {m.value}
                        </div>
                    ))}
                </div>
                <HairlineDivider className="my-5" />
                <div className="font-mono-tech text-[10px] text-[#a0a0ab] mb-2">
                    // topic clusters (LLM)
                </div>
                {clusterText ? (
                    <pre className="text-xs whitespace-pre-wrap text-[#fafafa] font-body">
                        {clusterText}
                    </pre>
                ) : (
                    <div className="text-[#a0a0ab] text-sm">
                        Hit "Cluster topics" to ask Claude to theme this competitor's recent posts.
                    </div>
                )}
            </div>
        </div>
    );
}
