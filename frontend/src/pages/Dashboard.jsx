import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useClientQuery } from "../contexts/AuthContext";
import { RecDot, HairlineDivider, Brackets, StatusBadge } from "../components/Pieces";
import {
    LineChart,
    Line,
    ResponsiveContainer,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
    Area,
    AreaChart,
} from "recharts";
import { platformMeta } from "../lib/platforms";
import PlatformIcon from "../components/PlatformIcon";
import AnimatedNumber from "../components/AnimatedNumber";

export default function Dashboard() {
    const cq = useClientQuery();
    const [summary, setSummary] = useState(null);
    const [posts, setPosts] = useState([]);

    useEffect(() => {
        (async () => {
            try {
                const [s, p] = await Promise.all([
                    api.get("/dashboard/summary", cq),
                    api.get("/posts", cq),
                ]);
                setSummary(s.data);
                setPosts(p.data);
            } catch (_) {}
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(cq)]);

    const trendData = buildTrend(posts);

    return (
        <div data-testid="dashboard-page">
            <div className="flex items-center gap-3 mb-2">
                <RecDot />
                <span className="font-mono-tech text-[10px] text-[#a0a0ab]">
                    // dashboard / pulse
                </span>
            </div>
            <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
                <h1 className="font-display uppercase tracking-tight font-black text-4xl sm:text-5xl">
                    Brand pulse
                </h1>
                {summary && (
                    <div className="font-mono-tech text-[10px] text-[#a0a0ab]">
                        Channels online: {summary.channels_count} · Posts tracked:{" "}
                        {summary.total_posts}
                    </div>
                )}
            </div>

            <HairlineDivider className="mb-6" />

            <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-10">
                <Stat label="This month engagement" value={summary?.this_month?.engagement ?? 0} stripe="#e6192b" />
                <Stat label="Last month engagement" value={summary?.last_month?.engagement ?? 0} stripe="#a0a0ab" />
                <Stat
                    label="MoM change"
                    value={summary?.delta_pct ?? 0}
                    suffix="%"
                    accent={(summary?.delta_pct ?? 0) >= 0 ? "up" : "down"}
                    stripe={(summary?.delta_pct ?? 0) >= 0 ? "#62e296" : "#ff6b76"}
                />
                <Stat
                    label="Consistency score"
                    value={summary?.consistency_score ?? 0}
                    suffix="/100"
                    stripe="#f5c84b"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-10">
                <div className="pg-card p-6 lg:col-span-2">
                    <Brackets />
                    <div className="font-mono-tech text-[10px] text-[#a0a0ab] mb-3">
                        // engagement trend / last 30 days
                    </div>
                    <h3 className="font-display uppercase tracking-tight font-bold text-xl mb-4">
                        Signal over time
                    </h3>
                    <div className="h-64">
                        <ResponsiveContainer>
                            <AreaChart data={trendData}>
                                <defs>
                                    <linearGradient id="engGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#e6192b" stopOpacity={0.45} />
                                        <stop offset="100%" stopColor="#e6192b" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid stroke="rgba(160,160,171,0.1)" />
                                <XAxis
                                    dataKey="day"
                                    stroke="#a0a0ab"
                                    fontSize={11}
                                    tickLine={false}
                                />
                                <YAxis
                                    stroke="#a0a0ab"
                                    fontSize={11}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <Tooltip
                                    contentStyle={{
                                        background: "#050505",
                                        border: "1px solid rgba(160,160,171,0.2)",
                                        borderRadius: 0,
                                        fontFamily: "monospace",
                                        fontSize: 11,
                                    }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="engagement"
                                    stroke="#e6192b"
                                    strokeWidth={2}
                                    fill="url(#engGrad)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="pg-card p-6">
                    <Brackets />
                    <div className="font-mono-tech text-[10px] text-[#a0a0ab] mb-3">
                        // top performer
                    </div>
                    <h3 className="font-display uppercase tracking-tight font-bold text-xl mb-4">
                        Hero post
                    </h3>
                    {summary?.top_post ? (
                        <div>
                            <div className="text-xs font-mono text-[#a0a0ab] uppercase tracking-widest mb-2 inline-flex items-center gap-2">
                                <PlatformIcon platform={summary.top_post.platform} size={14} />
                                {platformMeta(summary.top_post.platform).label}
                            </div>
                            <div className="font-display font-semibold text-lg mb-2 leading-tight">
                                {summary.top_post.title || summary.top_post.snippet || "Untitled"}
                            </div>
                            <div className="text-sm text-[#a0a0ab] mb-4">
                                {summary.top_post.snippet}
                            </div>
                            <div className="flex gap-4 text-xs font-mono text-[#a0a0ab] uppercase tracking-widest">
                                <span>♥ {summary.top_post.likes}</span>
                                <span>↺ {summary.top_post.shares}</span>
                                <span>✎ {summary.top_post.comments}</span>
                                <span>▶ {summary.top_post.views}</span>
                            </div>
                            {summary.top_post.url && (
                                <a
                                    href={summary.top_post.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="pg-btn-ghost mt-4 inline-block"
                                >
                                    Open ↗
                                </a>
                            )}
                        </div>
                    ) : (
                        <div className="text-[#a0a0ab] text-sm">
                            No posts yet — connect a channel or add a manual entry.
                        </div>
                    )}
                </div>
            </div>

            <h2 className="font-display uppercase tracking-tight font-bold text-2xl mb-4">
                Channel health
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {summary && Object.entries(summary.by_platform || {}).length === 0 && (
                    <div className="text-[#a0a0ab] text-sm font-mono col-span-full">
                        No channels configured yet.
                    </div>
                )}
                {summary &&
                    Object.entries(summary.by_platform || {}).map(([plt, info]) => {
                        const meta = platformMeta(plt);
                        return (
                        <div
                            key={plt}
                            className="pg-card p-5 relative overflow-hidden"
                            data-testid={`health-${plt}`}
                            style={{ boxShadow: `inset 3px 0 0 0 ${meta.color}` }}
                        >
                            <Brackets />
                            <div
                                className="absolute -top-8 -right-8 w-32 h-32 opacity-[0.12] pointer-events-none"
                                style={{ background: `radial-gradient(circle, ${meta.color}, transparent 70%)` }}
                            />
                            <div className="flex items-center justify-between mb-4 relative">
                                <div className="flex items-center gap-3">
                                    <PlatformIcon platform={plt} size={28} />
                                    <div className="font-display uppercase tracking-tight font-bold leading-none">
                                        {meta.label}
                                    </div>
                                </div>
                                <StatusBadge
                                    status={info.status}
                                    sync_mode={info.channel.sync_mode}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3 text-xs font-mono uppercase tracking-widest text-[#a0a0ab]">
                                <div>
                                    <div className="text-[#a0a0ab]">Posts</div>
                                    <div className="font-display text-2xl text-[#fafafa] mt-1">
                                        <AnimatedNumber value={info.post_count} />
                                    </div>
                                </div>
                                <div>
                                    <div className="text-[#a0a0ab]">Engagement</div>
                                    <div className="font-display text-2xl mt-1" style={{ color: meta.color }}>
                                        <AnimatedNumber value={info.engagement} />
                                    </div>
                                </div>
                            </div>
                            <div className="text-[10px] font-mono text-[#a0a0ab] uppercase tracking-widest mt-3">
                                Last sync: {info.last_sync ? new Date(info.last_sync).toLocaleString() : "never"}
                            </div>
                        </div>
                    );})}
            </div>
        </div>
    );
}

function Stat({ label, value, suffix = "", prefix = "", accent, stripe = "#e6192b" }) {
    const color =
        accent === "down" ? "text-[#ff6b76]" : accent === "up" ? "text-[#62e296]" : "text-[#fafafa]";
    return (
        <div
            className="pg-card p-5 relative overflow-hidden"
            style={{ boxShadow: `inset 3px 0 0 0 ${stripe}` }}
        >
            <Brackets />
            <div
                className="absolute -top-8 -right-8 w-28 h-28 opacity-[0.1] pointer-events-none"
                style={{ background: `radial-gradient(circle, ${stripe}, transparent 70%)` }}
            />
            <div className="font-mono-tech text-[10px] text-[#a0a0ab] mb-2 relative">{label}</div>
            <div className={`font-display text-3xl uppercase font-bold relative ${color}`}>
                <AnimatedNumber value={value} prefix={prefix} suffix={suffix} />
            </div>
        </div>
    );
}

function buildTrend(posts) {
    const days = {};
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(5, 10);
        days[key] = 0;
    }
    posts.forEach((p) => {
        const d = new Date(p.posted_at);
        const key = d.toISOString().slice(5, 10);
        if (key in days) days[key] += (p.likes || 0) + (p.comments || 0) + (p.shares || 0);
    });
    return Object.entries(days).map(([day, engagement]) => ({ day, engagement }));
}
