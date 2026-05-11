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
} from "recharts";
import { platformLabel } from "../lib/api";

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
                <Stat label="This month engagement" value={summary?.this_month?.engagement ?? 0} />
                <Stat label="Last month engagement" value={summary?.last_month?.engagement ?? 0} />
                <Stat
                    label="MoM change"
                    value={`${summary?.delta_pct ?? 0}%`}
                    accent={(summary?.delta_pct ?? 0) >= 0 ? "up" : "down"}
                />
                <Stat
                    label="Consistency score"
                    value={`${summary?.consistency_score ?? 0}/100`}
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
                            <LineChart data={trendData}>
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
                                <Line
                                    type="monotone"
                                    dataKey="engagement"
                                    stroke="#e6192b"
                                    strokeWidth={2}
                                    dot={false}
                                />
                            </LineChart>
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
                            <div className="text-xs font-mono text-[#a0a0ab] uppercase tracking-widest mb-2">
                                {platformLabel(summary.top_post.platform)}
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
                    Object.entries(summary.by_platform || {}).map(([plt, info]) => (
                        <div key={plt} className="pg-card p-5" data-testid={`health-${plt}`}>
                            <Brackets />
                            <div className="flex items-center justify-between mb-3">
                                <div className="font-display uppercase tracking-tight font-bold">
                                    {platformLabel(plt)}
                                </div>
                                <StatusBadge
                                    status={info.status}
                                    sync_mode={info.channel.sync_mode}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3 text-xs font-mono uppercase tracking-widest text-[#a0a0ab]">
                                <div>
                                    <div className="text-[#a0a0ab]">Posts</div>
                                    <div className="font-display text-xl text-[#fafafa] mt-1">
                                        {info.post_count}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-[#a0a0ab]">Engagement</div>
                                    <div className="font-display text-xl text-[#fafafa] mt-1">
                                        {info.engagement}
                                    </div>
                                </div>
                            </div>
                            <div className="text-[10px] font-mono text-[#a0a0ab] uppercase tracking-widest mt-3">
                                Last sync: {info.last_sync ? new Date(info.last_sync).toLocaleString() : "never"}
                            </div>
                        </div>
                    ))}
            </div>
        </div>
    );
}

function Stat({ label, value, accent }) {
    const color = accent === "down" ? "text-[#ff6b76]" : accent === "up" ? "text-[#62e296]" : "text-[#fafafa]";
    return (
        <div className="pg-card p-5">
            <Brackets />
            <div className="font-mono-tech text-[10px] text-[#a0a0ab] mb-2">{label}</div>
            <div className={`font-display text-3xl uppercase font-bold ${color}`}>
                {value}
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
