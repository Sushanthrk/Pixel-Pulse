import { useEffect, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { useClientQuery } from "../contexts/AuthContext";
import { RecDot, HairlineDivider, Brackets, StatusBadge } from "../components/Pieces";
import {
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
import { toast } from "sonner";

export default function Dashboard() {
    const cq = useClientQuery();
    const [summary, setSummary] = useState(null);
    const [scores, setScores] = useState(null);
    const [posts, setPosts] = useState([]);
    const [refreshingSentiment, setRefreshingSentiment] = useState(false);

    const load = async () => {
        try {
            const [s, sc, p] = await Promise.all([
                api.get("/dashboard/summary", cq),
                api.get("/dashboard/scores", cq),
                api.get("/posts", cq),
            ]);
            setSummary(s.data);
            setScores(sc.data);
            setPosts(p.data);
        } catch (_) {}
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(cq)]);

    const refreshSentiment = async () => {
        setRefreshingSentiment(true);
        try {
            await api.post("/dashboard/sentiment/refresh", {}, cq);
            toast.success("Sentiment refreshed");
            load();
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail) || e.message);
        }
        setRefreshingSentiment(false);
    };

    const trendData = buildTrend(posts);

    return (
        <div data-testid="dashboard-page">
            <div className="flex items-center gap-3 mb-2">
                <RecDot />
                <span className="font-mono-tech text-[10px] text-[#a0a0ab]">
                    // overview / pulse
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

            <HairlineDivider className="mb-8" />

            {/* ----- 3 hero scores ----- */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                <ScoreDashlet
                    label="Brand score"
                    sublabel="Overall digital presence"
                    score={scores?.brand_score ?? 0}
                    color="#e6192b"
                    detail={
                        scores ? (
                            <div className="text-[10px] font-mono text-[#a0a0ab] uppercase tracking-widest space-y-1">
                                <div className="flex justify-between"><span>Channels</span><span>{scores.brand_subscores.channels}/40</span></div>
                                <div className="flex justify-between"><span>Cadence</span><span>{scores.brand_subscores.cadence}/30</span></div>
                                <div className="flex justify-between"><span>AI visibility</span><span>{scores.brand_subscores.ai}/30</span></div>
                            </div>
                        ) : null
                    }
                />
                <ScoreDashlet
                    label="AI visibility"
                    sublabel="Cited in GPT-5.2 / Claude / Gemini"
                    score={scores?.ai_visibility?.score ?? 0}
                    color="#62e296"
                    detail={
                        scores ? (
                            <div className="text-[10px] font-mono text-[#a0a0ab] uppercase tracking-widest space-y-1">
                                {(scores.ai_visibility.engines || []).map((e) => (
                                    <div key={e.engine} className="flex justify-between">
                                        <span>{e.engine}</span>
                                        <span>{e.rate}% · {e.hits}/{e.total}</span>
                                    </div>
                                ))}
                                {scores.ai_visibility.total === 0 && (
                                    <div className="text-[#a0a0ab]/70 normal-case tracking-normal mt-1">
                                        Add queries in the Geo tab and Run scan.
                                    </div>
                                )}
                            </div>
                        ) : null
                    }
                />
                <ScoreDashlet
                    label="Brand sentiment"
                    sublabel="How customers feel about you"
                    score={scores?.sentiment?.score ?? 0}
                    color="#f5c84b"
                    notReady={!scores?.sentiment?.ready}
                    detail={
                        <div className="space-y-2">
                            {scores?.sentiment?.ready ? (
                                <>
                                    {scores.sentiment.summary && (
                                        <div className="text-xs text-[#a0a0ab] leading-relaxed">
                                            {scores.sentiment.summary}
                                        </div>
                                    )}
                                    {scores.sentiment.breakdown && (
                                        <SentimentBar breakdown={scores.sentiment.breakdown} />
                                    )}
                                </>
                            ) : (
                                <div className="text-xs text-[#a0a0ab] leading-relaxed">
                                    Click <strong>Refresh</strong> to analyse your last 30 posts and
                                    score how the market is responding to your brand.
                                </div>
                            )}
                            <button
                                onClick={refreshSentiment}
                                disabled={refreshingSentiment}
                                className="pg-btn-secondary !text-[10px] !px-3 !py-1.5"
                                data-testid="refresh-sentiment-btn"
                            >
                                {refreshingSentiment ? "Analysing…" : "↻ Refresh"}
                            </button>
                        </div>
                    }
                />
            </div>

            {/* ----- Channel performance ----- */}
            <div className="flex items-end justify-between gap-4 mb-4">
                <div>
                    <div className="font-mono-tech text-[10px] text-[#a0a0ab] mb-1">
                        // visibility · across every channel you own
                    </div>
                    <h2 className="font-display uppercase tracking-tight font-bold text-2xl">
                        Channel performance
                    </h2>
                </div>
                <div className="font-mono-tech text-[10px] text-[#a0a0ab]">
                    Last 30 days
                </div>
            </div>
            <div className="pg-card p-0 overflow-hidden mb-10" data-testid="channel-performance">
                <div className="grid grid-cols-12 px-5 py-3 font-mono-tech text-[10px] text-[#a0a0ab] border-b border-[#a0a0ab]/10">
                    <div className="col-span-3">Channel</div>
                    <div className="col-span-5">Visibility</div>
                    <div className="col-span-1 text-right">Posts</div>
                    <div className="col-span-2 text-right">Engagement</div>
                    <div className="col-span-1 text-right">Status</div>
                </div>
                {(scores?.channel_performance || []).map((row) => {
                    const meta = platformMeta(row.platform);
                    return (
                        <div
                            key={row.id}
                            className="grid grid-cols-12 px-5 py-4 items-center border-b border-[#a0a0ab]/10 hover:bg-[#fafafa]/[0.03] transition-colors"
                            data-testid={`channel-perf-${row.id}`}
                        >
                            <div className="col-span-3 flex items-center gap-3 min-w-0">
                                <PlatformIcon platform={row.platform} size={22} />
                                <div className="min-w-0">
                                    <div className="font-display uppercase tracking-tight font-semibold text-sm truncate">
                                        {meta.label}
                                    </div>
                                    <div className="text-[10px] font-mono text-[#a0a0ab] uppercase tracking-widest truncate">
                                        {row.og?.title || row.handle}
                                    </div>
                                </div>
                            </div>
                            <div className="col-span-5 pr-4">
                                <div className="h-2 w-full bg-[#fafafa]/[0.05] relative overflow-hidden">
                                    <div
                                        className="h-full transition-all duration-700"
                                        style={{
                                            width: `${Math.max(2, row.visibility)}%`,
                                            background: `linear-gradient(90deg, ${meta.color}, ${meta.color}88)`,
                                            boxShadow: `0 0 8px ${meta.color}66`,
                                        }}
                                    />
                                </div>
                                <div className="text-[10px] font-mono uppercase tracking-widest text-[#a0a0ab] mt-1">
                                    {row.visibility}% relative · cadence {row.cadence}/100
                                </div>
                            </div>
                            <div className="col-span-1 text-right font-display font-bold tabular-nums">
                                {row.posts_30d}
                            </div>
                            <div className="col-span-2 text-right font-display font-bold tabular-nums" style={{ color: meta.color }}>
                                {row.engagement_30d.toLocaleString()}
                            </div>
                            <div className="col-span-1 flex justify-end">
                                <StatusBadge status={row.status} sync_mode={row.sync_mode} />
                            </div>
                        </div>
                    );
                })}
                {(!scores || (scores.channel_performance || []).length === 0) && (
                    <div className="px-5 py-8 text-[#a0a0ab] text-sm font-mono text-center">
                        No channels yet — head to the Channels tab to wire one.
                    </div>
                )}
            </div>

            {/* ----- KPI strip + trend + hero (existing) ----- */}
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
                                <Area type="monotone" dataKey="engagement" stroke="#e6192b" strokeWidth={2} fill="url(#engGrad)" />
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

            {/* ----- existing channel health (kept) ----- */}
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
                                    <StatusBadge status={info.status} sync_mode={info.channel.sync_mode} />
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
                        );
                    })}
            </div>
        </div>
    );
}

function ScoreDashlet({ label, sublabel, score, color, detail, notReady }) {
    // big radial ring rendered with SVG
    const size = 130;
    const stroke = 10;
    const radius = (size - stroke) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (score / 100) * circumference;
    return (
        <div
            className="pg-card p-6 relative overflow-hidden"
            style={{ boxShadow: `inset 3px 0 0 0 ${color}` }}
        >
            <Brackets />
            <div
                className="absolute -top-12 -right-12 w-44 h-44 opacity-[0.1] pointer-events-none"
                style={{ background: `radial-gradient(circle, ${color}, transparent 70%)` }}
            />
            <div className="font-mono-tech text-[10px] text-[#a0a0ab] mb-1 relative">{label}</div>
            <div className="text-[11px] font-mono text-[#a0a0ab]/70 uppercase tracking-widest mb-5 relative">
                {sublabel}
            </div>
            <div className="flex items-center gap-5 relative">
                <div className="relative" style={{ width: size, height: size }}>
                    <svg width={size} height={size} className="-rotate-90">
                        <circle
                            cx={size / 2}
                            cy={size / 2}
                            r={radius}
                            stroke="rgba(160,160,171,0.15)"
                            strokeWidth={stroke}
                            fill="none"
                        />
                        <circle
                            cx={size / 2}
                            cy={size / 2}
                            r={radius}
                            stroke={notReady ? "rgba(160,160,171,0.35)" : color}
                            strokeWidth={stroke}
                            strokeLinecap="round"
                            fill="none"
                            strokeDasharray={circumference}
                            strokeDashoffset={offset}
                            style={{
                                transition: "stroke-dashoffset 900ms cubic-bezier(0.4,0,0.2,1)",
                                filter: notReady ? "none" : `drop-shadow(0 0 6px ${color}66)`,
                            }}
                        />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <div
                            className="font-display font-black text-4xl tabular-nums leading-none"
                            style={{ color: notReady ? "#a0a0ab" : "#fafafa" }}
                        >
                            {notReady ? "—" : <AnimatedNumber value={score} />}
                        </div>
                        <div className="text-[9px] font-mono text-[#a0a0ab] uppercase tracking-widest mt-1">
                            / 100
                        </div>
                    </div>
                </div>
                <div className="flex-1 min-w-0">{detail}</div>
            </div>
        </div>
    );
}

function SentimentBar({ breakdown }) {
    const pos = Math.max(0, Number(breakdown.positive || 0));
    const neu = Math.max(0, Number(breakdown.neutral || 0));
    const neg = Math.max(0, Number(breakdown.negative || 0));
    const total = Math.max(1, pos + neu + neg);
    return (
        <div>
            <div className="flex h-2 overflow-hidden">
                <div style={{ width: `${(pos / total) * 100}%`, background: "#62e296" }} />
                <div style={{ width: `${(neu / total) * 100}%`, background: "#a0a0ab" }} />
                <div style={{ width: `${(neg / total) * 100}%`, background: "#ff6b76" }} />
            </div>
            <div className="grid grid-cols-3 text-[10px] font-mono uppercase tracking-widest mt-1">
                <span className="text-[#62e296]">+ {pos}%</span>
                <span className="text-[#a0a0ab] text-center">~ {neu}%</span>
                <span className="text-[#ff6b76] text-right">- {neg}%</span>
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
