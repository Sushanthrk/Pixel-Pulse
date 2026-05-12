import { useEffect, useMemo, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { useClientQuery } from "../contexts/AuthContext";
import { RecDot, HairlineDivider, Brackets } from "../components/Pieces";
import { toast } from "sonner";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "../components/ui/select";
import PlatformIcon from "../components/PlatformIcon";
import AnimatedNumber from "../components/AnimatedNumber";
import InfoTip from "../components/InfoTip";
import { PLATFORM_META, PLATFORM_KEYS, platformMeta } from "../lib/platforms";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    ResponsiveContainer,
    Cell,
    Tooltip as RTooltip,
} from "recharts";

const PRIORITY_COLOR = { High: "#ff6b76", Medium: "#f5c84b", Low: "#62e296" };

export default function Competitors() {
    const cq = useClientQuery();
    const [competitors, setCompetitors] = useState([]);
    const [scores, setScores] = useState(null);
    const [form, setForm] = useState({ platform: "youtube", handle: "", url: "" });
    const [refreshing, setRefreshing] = useState(false);
    const [busy, setBusy] = useState(null);

    const load = async () => {
        try {
            const [c, s] = await Promise.all([
                api.get("/competitors", cq),
                api.get("/competitors/scores", cq),
            ]);
            setCompetitors(c.data);
            setScores(s.data);
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

    const syncOne = async (id) => {
        setBusy(`sync-${id}`);
        try {
            const { data } = await api.post(`/competitors/${id}/sync`);
            toast.success(`${data.is_real ? "Pulled" : "Inserted"} ${data.inserted} posts`);
            load();
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail) || e.message);
        }
        setBusy(null);
    };

    const remove = async (id) => {
        if (!window.confirm("Remove competitor?")) return;
        try {
            await api.delete(`/competitors/${id}`);
            load();
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail) || e.message);
        }
    };

    const refreshScores = async () => {
        if (competitors.length === 0) {
            toast("Add at least one competitor first.");
            return;
        }
        setRefreshing(true);
        try {
            await api.post("/competitors/scores/refresh", {}, cq);
            toast.success("Competitor intelligence refreshed");
            load();
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail) || e.message);
        }
        setRefreshing(false);
    };

    const compareData = useMemo(() => {
        if (!scores?.you) return [];
        const rows = [
            {
                name: "You",
                "Brand": scores.you.brand_score,
                "AI": scores.you.ai_visibility,
                "Sentiment": scores.you.sentiment,
            },
        ];
        (scores.competitors || []).forEach((c) => {
            rows.push({
                name: c.handle,
                "Brand": c.brand_score,
                "AI": c.ai_visibility,
                "Sentiment": c.sentiment,
            });
        });
        return rows;
    }, [scores]);

    return (
        <div data-testid="competitors-page">
            <div className="flex items-center gap-3 mb-2">
                <RecDot />
                <span className="font-mono-tech text-[10px] text-[#a0a0ab]">
                    // intelligence / competitors
                </span>
            </div>
            <div className="flex flex-wrap items-end justify-between gap-4 mb-3">
                <h1 className="font-display uppercase tracking-tight font-black text-4xl sm:text-5xl">
                    Competitor radar
                </h1>
                <button
                    onClick={refreshScores}
                    disabled={refreshing}
                    className="pg-btn-primary"
                    data-testid="refresh-competitor-scores"
                >
                    {refreshing ? "Analysing…" : "↻ Refresh intelligence"}
                </button>
            </div>
            <p className="text-[#a0a0ab] text-sm max-w-3xl mb-6 leading-relaxed">
                Track up to <strong>5 competitors per platform</strong>. For each one we compute
                an Overall Score, AI Visibility (do LLMs cite them?) and Sentiment. The radar then
                shows how you stack up and surfaces the biggest opportunity gaps to close.
            </p>
            <HairlineDivider className="mb-6" />

            {/* Add competitor */}
            <form onSubmit={add} className="pg-card p-6 mb-8" data-testid="add-competitor-form">
                <Brackets />
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <div>
                        <label className="pg-label">Platform</label>
                        <Select value={form.platform} onValueChange={(v) => setForm({ ...form, platform: v })}>
                            <SelectTrigger className="mt-2 h-11 rounded-none bg-[#0a0a0a] border-[#a0a0ab]/30 hover:border-[#fafafa] text-[#fafafa]">
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
                                    <SelectItem key={k} value={k} className="rounded-none focus:bg-[#fafafa]/10 focus:text-[#fafafa]">
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
                    </div>
                    <div>
                        <label className="pg-label">Handle</label>
                        <input
                            value={form.handle}
                            onChange={(e) => setForm({ ...form, handle: e.target.value })}
                            className="pg-input mt-2"
                            placeholder="e.g. @rivalbrand"
                            data-testid="new-competitor-handle"
                        />
                    </div>
                    <div>
                        <label className="pg-label">URL / RSS (optional)</label>
                        <input
                            value={form.url}
                            onChange={(e) => setForm({ ...form, url: e.target.value })}
                            className="pg-input mt-2"
                            placeholder="https://…"
                        />
                    </div>
                    <button type="submit" className="pg-btn-primary justify-center">
                        + Add competitor
                    </button>
                </div>
            </form>

            {/* Brand score comparison */}
            {scores?.you && (scores.competitors || []).length > 0 && (
                <div className="pg-card p-6 mb-8" data-testid="comparison-chart">
                    <Brackets />
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <div className="font-mono-tech text-[10px] text-[#a0a0ab] mb-1 inline-flex items-center gap-2">
                                // brand score comparison
                                <InfoTip>
                                    <strong>Brand Score</strong> blends channels live, cadence and
                                    AI visibility into a single 0-100 number. We compute the same
                                    score for each competitor so the comparison is apples-to-apples.
                                </InfoTip>
                            </div>
                            <h3 className="font-display uppercase tracking-tight font-bold text-xl">
                                How you stack up
                            </h3>
                        </div>
                        <span className="font-mono text-[10px] text-[#a0a0ab] uppercase tracking-widest">
                            Updated{" "}
                            {scores.updated_at ? new Date(scores.updated_at).toLocaleString() : "—"}
                        </span>
                    </div>
                    <div className="h-72">
                        <ResponsiveContainer>
                            <BarChart data={compareData} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
                                <XAxis dataKey="name" stroke="#a0a0ab" fontSize={11} tickLine={false} interval={0} />
                                <YAxis stroke="#a0a0ab" fontSize={11} tickLine={false} axisLine={false} domain={[0, 100]} />
                                <RTooltip
                                    contentStyle={{
                                        background: "#050505",
                                        border: "1px solid rgba(160,160,171,0.2)",
                                        borderRadius: 0,
                                        fontFamily: "monospace",
                                        fontSize: 11,
                                    }}
                                />
                                <Bar dataKey="Brand" radius={[2, 2, 0, 0]}>
                                    {compareData.map((row, i) => (
                                        <Cell key={i} fill={row.name === "You" ? "#e6192b" : "#a0a0ab"} />
                                    ))}
                                </Bar>
                                <Bar dataKey="AI" radius={[2, 2, 0, 0]}>
                                    {compareData.map((row, i) => (
                                        <Cell key={i} fill={row.name === "You" ? "#62e296" : "#3a5a45"} />
                                    ))}
                                </Bar>
                                <Bar dataKey="Sentiment" radius={[2, 2, 0, 0]}>
                                    {compareData.map((row, i) => (
                                        <Cell key={i} fill={row.name === "You" ? "#f5c84b" : "#5a4d28"} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="flex flex-wrap gap-4 mt-3 text-[10px] font-mono uppercase tracking-widest">
                        <span className="inline-flex items-center gap-2"><i className="w-2 h-2 inline-block" style={{ background: "#e6192b" }} />Brand</span>
                        <span className="inline-flex items-center gap-2"><i className="w-2 h-2 inline-block" style={{ background: "#62e296" }} />AI Visibility</span>
                        <span className="inline-flex items-center gap-2"><i className="w-2 h-2 inline-block" style={{ background: "#f5c84b" }} />Sentiment</span>
                    </div>
                </div>
            )}

            {/* Gap analysis */}
            {(scores?.biggest_gaps || []).length > 0 && (
                <div className="pg-card p-6 mb-10" data-testid="gap-analysis">
                    <Brackets />
                    <div className="font-mono-tech text-[10px] text-[#a0a0ab] mb-1 inline-flex items-center gap-2">
                        // biggest opportunity gaps
                        <InfoTip>
                            For each metric we compare your number to the best competitor.
                            <strong> Priority</strong> reflects how big the gap is — close the High
                            ones first.
                        </InfoTip>
                    </div>
                    <h3 className="font-display uppercase tracking-tight font-bold text-xl mb-4">
                        Where you can win
                    </h3>
                    <div className="space-y-3">
                        {scores.biggest_gaps.map((g, i) => (
                            <div
                                key={i}
                                className="grid grid-cols-12 gap-4 items-center border border-[#a0a0ab]/15 p-4 hover:border-[#fafafa]/40 transition-colors"
                            >
                                <div className="col-span-3">
                                    <div className="font-display uppercase tracking-tight font-bold text-sm">
                                        {g.area}
                                    </div>
                                    <div className="text-[10px] font-mono text-[#a0a0ab] uppercase tracking-widest mt-1">
                                        You {g.you} · Best {g.best}
                                    </div>
                                </div>
                                <div className="col-span-7">
                                    <div className="text-sm text-[#fafafa] leading-relaxed">{g.rationale}</div>
                                </div>
                                <div className="col-span-2 flex justify-end">
                                    <PriorityChip priority={g.priority} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Per-competitor dashlets */}
            <div className="flex items-end justify-between mb-4">
                <div>
                    <div className="font-mono-tech text-[10px] text-[#a0a0ab] mb-1">
                        // individual competitor cards
                    </div>
                    <h2 className="font-display uppercase tracking-tight font-bold text-2xl">
                        Per-competitor insight
                    </h2>
                </div>
                <span className="font-mono text-[10px] text-[#a0a0ab] uppercase tracking-widest">
                    {(scores?.competitors || []).length} tracked
                </span>
            </div>

            {(!scores?.competitors || scores.competitors.length === 0) && (
                <div className="pg-card p-8 text-[#a0a0ab] text-sm font-mono text-center" data-testid="no-competitors">
                    Add competitors above and hit{" "}
                    <span className="text-[#e6192b]">Refresh intelligence</span> to see their score
                    cards.
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {(scores?.competitors || []).map((c) => (
                    <CompetitorCard
                        key={c.id}
                        comp={c}
                        you={scores.you}
                        onSync={() => syncOne(c.id)}
                        onRemove={() => remove(c.id)}
                        busy={busy === `sync-${c.id}`}
                    />
                ))}
            </div>

            {/* Manual roster (raw add list, for sync/manual snapshot) */}
            {competitors.length > 0 && (scores?.competitors || []).length === 0 && (
                <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {competitors.map((c) => {
                        const meta = platformMeta(c.platform);
                        return (
                            <div
                                key={c.id}
                                className="pg-card p-4"
                                style={{ boxShadow: `inset 3px 0 0 0 ${meta.color}` }}
                            >
                                <Brackets />
                                <div className="flex items-center gap-3 mb-3">
                                    <PlatformIcon platform={c.platform} size={22} />
                                    <div>
                                        <div className="font-display uppercase tracking-tight font-bold text-sm">
                                            {c.handle}
                                        </div>
                                        <div className="text-[10px] font-mono text-[#a0a0ab] uppercase tracking-widest mt-1">
                                            {meta.label}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => syncOne(c.id)} disabled={busy === `sync-${c.id}`} className="pg-btn-secondary !text-[10px] !px-3 !py-1.5">
                                        {busy === `sync-${c.id}` ? "Syncing…" : "Sync"}
                                    </button>
                                    <button onClick={() => remove(c.id)} className="pg-btn-ghost">Remove</button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function CompetitorCard({ comp, you, onSync, onRemove, busy }) {
    const meta = platformMeta(comp.platform);
    const ai = comp.ai_visibility ?? 0;
    const sent = comp.sentiment ?? 0;
    const brand = comp.brand_score ?? 0;
    const youAhead = (a, b) => (a > b ? "+" + (a - b) : a < b ? "-" + (b - a) : "·");
    return (
        <div
            className="pg-card p-5 relative overflow-hidden"
            style={{ boxShadow: `inset 3px 0 0 0 ${meta.color}` }}
            data-testid={`competitor-card-${comp.id}`}
        >
            <Brackets />
            <div
                className="absolute -top-10 -right-10 w-44 h-44 opacity-[0.08] pointer-events-none"
                style={{ background: `radial-gradient(circle, ${meta.color}, transparent 70%)` }}
            />
            <div className="flex items-start justify-between mb-4 relative">
                <div className="flex items-center gap-3">
                    <PlatformIcon platform={comp.platform} size={28} />
                    <div>
                        <div className="font-display uppercase tracking-tight font-bold text-base leading-none">
                            {comp.handle}
                        </div>
                        <div className="text-[10px] font-mono text-[#a0a0ab] uppercase tracking-widest mt-1">
                            {meta.label}
                        </div>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button onClick={onSync} disabled={busy} className="pg-btn-secondary !text-[10px] !px-3 !py-1.5">
                        {busy ? "Syncing…" : "Sync"}
                    </button>
                    <button onClick={onRemove} className="pg-btn-ghost">×</button>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-3 relative">
                <MiniScore
                    label="Brand"
                    value={brand}
                    color="#e6192b"
                    diff={you ? youAhead(you.brand_score, brand) : null}
                    tooltip="Composite 0-100 from channels live, posting cadence, AI visibility and an LLM perception pass."
                />
                <MiniScore
                    label="AI Visibility"
                    value={ai}
                    color="#62e296"
                    diff={you ? youAhead(you.ai_visibility, ai) : null}
                    tooltip="% of tracked queries where this competitor surfaces in LLM answers."
                />
                <MiniScore
                    label="Sentiment"
                    value={sent}
                    color="#f5c84b"
                    diff={you ? youAhead(you.sentiment, sent) : null}
                    tooltip="0-100 estimate of how positively the market speaks about this competitor."
                />
            </div>

            <div className="grid grid-cols-2 gap-3 text-[10px] font-mono uppercase tracking-widest text-[#a0a0ab] mb-3 relative">
                <div className="border border-[#a0a0ab]/15 p-2">
                    <div>Posts / 30d</div>
                    <div className="font-display text-lg text-[#fafafa] mt-1 normal-case tracking-tight">
                        <AnimatedNumber value={comp.posts_30d || 0} />
                    </div>
                </div>
                <div className="border border-[#a0a0ab]/15 p-2">
                    <div>Engagement</div>
                    <div className="font-display text-lg mt-1 normal-case tracking-tight" style={{ color: meta.color }}>
                        <AnimatedNumber value={comp.engagement_30d || 0} />
                    </div>
                </div>
            </div>

            {comp.summary && (
                <div className="text-xs text-[#a0a0ab] leading-relaxed border-t border-[#a0a0ab]/10 pt-3 relative">
                    {comp.summary}
                </div>
            )}
        </div>
    );
}

function MiniScore({ label, value, color, diff, tooltip }) {
    return (
        <div className="border border-[#a0a0ab]/15 p-2.5">
            <div className="text-[9px] font-mono text-[#a0a0ab] uppercase tracking-widest flex items-center gap-1 mb-1">
                {label}
                {tooltip && <InfoTip>{tooltip}</InfoTip>}
            </div>
            <div className="font-display text-2xl font-black leading-none" style={{ color }}>
                <AnimatedNumber value={value} />
            </div>
            {diff && (
                <div className="text-[9px] font-mono uppercase tracking-widest mt-1" style={{ color: diff.startsWith("+") ? "#62e296" : diff.startsWith("-") ? "#ff6b76" : "#a0a0ab" }}>
                    YOU {diff}
                </div>
            )}
        </div>
    );
}

function PriorityChip({ priority }) {
    const color = PRIORITY_COLOR[priority] || "#a0a0ab";
    return (
        <span
            className="inline-flex items-center gap-1.5 px-3 py-1 border text-[10px] font-mono uppercase tracking-widest whitespace-nowrap"
            style={{ borderColor: `${color}55`, color, background: `${color}10` }}
        >
            ● {priority} priority
        </span>
    );
}
