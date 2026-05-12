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

const PRIORITY_COLOR = { High: "#ff6b76", Medium: "#f5c84b", Low: "#62e296" };
const CARD_PALETTE = ["#e6192b", "#62e296", "#f5c84b", "#ff9a3c", "#4285f4", "#bd10e0"];

// Map gap-area → concrete one-line action recommendation
function gapAction(area) {
    const a = (area || "").toLowerCase();
    if (a.includes("ai")) return "Seed FAQ/listicle content on Reddit, Quora and Wikipedia for category queries.";
    if (a.includes("cadence") || a.includes("posting")) return "Lock a 3-posts-per-week cadence (1 reel · 1 carousel · 1 longform).";
    if (a.includes("engagement")) return "Reply to every comment in <2h for 14 days and publish 2 polls to spike reach.";
    if (a.includes("sentiment")) return "Respond to every review (good or bad) within 48h and ship 2 customer case studies.";
    if (a.includes("brand")) return "Tighten brand voice across all channels and publish a founder POV every week.";
    return "Pick the largest gap above and run it as the focus for the next sprint.";
}

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

    // Build [You, comp1, comp2…] with colors assigned
    const rows = useMemo(() => {
        if (!scores?.you) return [];
        const out = [
            {
                key: "you",
                name: "You",
                is_you: true,
                brand: scores.you.brand_score ?? 0,
                ai: scores.you.ai_visibility ?? 0,
                sentiment: scores.you.sentiment ?? 0,
                color: "#e6192b",
                platform: null,
                handle: "Your brand",
                summary: scores.you.summary,
            },
        ];
        (scores.competitors || []).forEach((c, i) => {
            out.push({
                key: c.id,
                name: c.handle,
                is_you: false,
                brand: c.brand_score ?? 0,
                ai: c.ai_visibility ?? 0,
                sentiment: c.sentiment ?? 0,
                color: CARD_PALETTE[(i + 1) % CARD_PALETTE.length],
                platform: c.platform,
                handle: c.handle,
                summary: c.summary,
                _id: c.id,
            });
        });
        return out;
    }, [scores]);

    const maxBrand = Math.max(100, ...rows.map((r) => r.brand));

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

            {/* Empty state when no scores yet */}
            {rows.length === 0 && (
                <div className="pg-card p-10 text-center" data-testid="no-scores">
                    <div className="font-mono-tech text-[10px] text-[#a0a0ab] mb-3">// no analysis yet</div>
                    <h2 className="font-display uppercase tracking-tight font-bold text-2xl mb-3">
                        Add competitors, then refresh
                    </h2>
                    <p className="text-[#a0a0ab] text-sm max-w-md mx-auto">
                        Add 3–5 competitors above (you can mix platforms). Then hit{" "}
                        <span className="text-[#e6192b]">↻ Refresh intelligence</span> — we'll score
                        each one and surface the biggest gaps to close.
                    </p>
                </div>
            )}

            {/* Per-competitor dashlets */}
            {rows.length > 0 && (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-10">
                        {rows.map((r) => (
                            <CompetitorCard
                                key={r.key}
                                row={r}
                                onSync={r._id ? () => syncOne(r._id) : null}
                                onRemove={r._id ? () => remove(r._id) : null}
                                busy={r._id ? busy === `sync-${r._id}` : false}
                            />
                        ))}
                    </div>

                    {/* Brand score comparison (horizontal bars) */}
                    <div className="pg-card p-6 mb-8" data-testid="comparison-chart">
                        <Brackets />
                        <div className="font-mono-tech text-[10px] text-[#a0a0ab] mb-1 inline-flex items-center gap-2">
                            // overall brand score · side by side
                            <InfoTip>
                                Brand Score blends channels live, cadence, AI visibility and an
                                LLM perception pass into a single 0-100 number. Same formula is
                                applied to every competitor so this comparison is apples-to-apples.
                            </InfoTip>
                        </div>
                        <h3 className="font-display uppercase tracking-tight font-bold text-xl mb-5">
                            Brand score comparison
                        </h3>
                        <div className="space-y-3">
                            {rows.map((r) => (
                                <div key={r.key} className="flex items-center gap-4">
                                    <div className="w-32 truncate flex items-center gap-2">
                                        <div
                                            className="w-2.5 h-2.5 rounded-full"
                                            style={{
                                                background: r.color,
                                                boxShadow: `0 0 6px ${r.color}`,
                                            }}
                                        />
                                        <span className="font-display uppercase tracking-tight font-bold text-sm truncate">
                                            {r.is_you ? "You" : r.name}
                                        </span>
                                    </div>
                                    <div className="flex-1 h-3 bg-[#fafafa]/[0.05] relative">
                                        <div
                                            className="h-full transition-all duration-700"
                                            style={{
                                                width: `${Math.max(2, (r.brand / maxBrand) * 100)}%`,
                                                background: `linear-gradient(90deg, ${r.color}, ${r.color}cc)`,
                                                boxShadow: `0 0 10px ${r.color}88`,
                                            }}
                                        />
                                    </div>
                                    <div
                                        className="w-12 text-right font-display font-black text-xl tabular-nums"
                                        style={{ color: r.color }}
                                    >
                                        {r.brand}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Gap analysis */}
                    {(scores?.biggest_gaps || []).length > 0 && (
                        <div data-testid="gap-analysis">
                            <div className="flex items-end justify-between mb-2">
                                <div>
                                    <div className="font-mono-tech text-[10px] text-[#a0a0ab] mb-1 inline-flex items-center gap-2">
                                        // close these first
                                        <InfoTip>
                                            For each metric we compare your number to the best
                                            competitor. Priority and the action recommendation
                                            reflect how big the gap is and the highest-leverage way
                                            to close it.
                                        </InfoTip>
                                    </div>
                                    <h3 className="font-display uppercase tracking-tight font-bold text-2xl">
                                        Competitor gap analysis
                                    </h3>
                                    <div className="text-xs text-[#a0a0ab] mt-1">
                                        Biggest opportunity gaps to close
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                                {scores.biggest_gaps.map((g, i) => (
                                    <GapCard key={i} gap={g} />
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

function CompetitorCard({ row, onSync, onRemove, busy }) {
    const { is_you, name, color, brand, ai, sentiment, platform, summary } = row;
    return (
        <div
            className="pg-card p-5 relative overflow-hidden"
            style={{ boxShadow: `inset 4px 0 0 0 ${color}` }}
            data-testid={is_you ? "competitor-card-you" : `competitor-card-${row._id}`}
        >
            <Brackets />
            <div
                className="absolute -top-12 -right-12 w-44 h-44 opacity-[0.1] pointer-events-none"
                style={{ background: `radial-gradient(circle, ${color}, transparent 70%)` }}
            />

            {/* header */}
            <div className="flex items-center justify-between mb-4 relative">
                <div className="flex items-center gap-2 min-w-0">
                    {platform && <PlatformIcon platform={platform} size={20} />}
                    <div className="font-display uppercase tracking-tight font-bold text-base truncate">
                        {name}
                    </div>
                </div>
                {is_you ? (
                    <span
                        className="inline-flex items-center px-2 py-1 text-[10px] font-mono uppercase tracking-widest"
                        style={{
                            background: `${color}20`,
                            color,
                            border: `1px solid ${color}66`,
                        }}
                    >
                        ● YOU
                    </span>
                ) : (
                    <div className="flex gap-1">
                        <button onClick={onSync} disabled={busy} className="pg-btn-ghost !text-[10px]">
                            {busy ? "…" : "Sync"}
                        </button>
                        <button onClick={onRemove} className="pg-btn-ghost !text-[10px]">×</button>
                    </div>
                )}
            </div>

            {/* Big overall score ring */}
            <div className="flex items-center gap-4 mb-5 relative">
                <RadialGauge score={brand} color={color} />
                <div>
                    <div className="text-[10px] font-mono text-[#a0a0ab] uppercase tracking-widest mb-1">
                        Overall score
                    </div>
                    <div className="text-[10px] font-mono text-[#a0a0ab] uppercase tracking-widest">
                        out of 100
                    </div>
                </div>
            </div>

            {/* AI Visibility + Sentiment horizontal bars */}
            <MetricBar
                label="AI Visibility"
                value={ai}
                color={color}
                tip="% of tracked queries where this brand surfaces in LLM answers (GPT-5.2, Claude, Gemini)."
            />
            <MetricBar
                label="Sentiment"
                value={sentiment}
                color={color}
                tip="0-100 view of how positively the market speaks about this brand."
            />

            {summary && (
                <div className="text-xs text-[#a0a0ab] leading-relaxed border-t border-[#a0a0ab]/10 pt-3 mt-2 relative">
                    {summary}
                </div>
            )}
        </div>
    );
}

function RadialGauge({ score, color }) {
    const size = 86;
    const stroke = 8;
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const offset = c - (score / 100) * c;
    return (
        <div className="relative shrink-0" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="-rotate-90">
                <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(160,160,171,0.15)" strokeWidth={stroke} fill="none" />
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    stroke={color}
                    strokeWidth={stroke}
                    strokeLinecap="round"
                    fill="none"
                    strokeDasharray={c}
                    strokeDashoffset={offset}
                    style={{
                        transition: "stroke-dashoffset 800ms cubic-bezier(0.4,0,0.2,1)",
                        filter: `drop-shadow(0 0 6px ${color}66)`,
                    }}
                />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
                <div
                    className="font-display font-black text-2xl tabular-nums leading-none"
                    style={{ color }}
                >
                    <AnimatedNumber value={score} />
                </div>
            </div>
        </div>
    );
}

function MetricBar({ label, value, color, tip }) {
    return (
        <div className="mb-3">
            <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-widest mb-1.5">
                <span className="inline-flex items-center gap-1 text-[#a0a0ab]">
                    {label}
                    {tip && <InfoTip>{tip}</InfoTip>}
                </span>
                <span className="font-display font-bold text-sm" style={{ color }}>
                    {value}
                </span>
            </div>
            <div className="h-1.5 bg-[#fafafa]/[0.05] relative overflow-hidden">
                <div
                    className="h-full transition-all duration-700"
                    style={{
                        width: `${Math.max(2, value)}%`,
                        background: `linear-gradient(90deg, ${color}, ${color}aa)`,
                        boxShadow: `0 0 8px ${color}66`,
                    }}
                />
            </div>
        </div>
    );
}

function GapCard({ gap }) {
    const priorityColor = PRIORITY_COLOR[gap.priority] || "#a0a0ab";
    const action = gapAction(gap.area);
    const ptsBehind = Math.max(0, Math.round((gap.best || 0) - (gap.you || 0)));
    return (
        <div
            className="pg-card p-5 relative overflow-hidden"
            style={{ boxShadow: `inset 4px 0 0 0 ${priorityColor}` }}
        >
            <Brackets />
            <div className="flex items-start justify-between gap-3 mb-3 relative">
                <h4 className="font-display uppercase tracking-tight font-bold text-base leading-tight">
                    {gap.area}
                </h4>
                <span
                    className="inline-flex items-center px-2 py-1 text-[10px] font-mono uppercase tracking-widest whitespace-nowrap"
                    style={{
                        background: "rgba(255,107,118,0.1)",
                        color: "#ff6b76",
                        border: "1px solid rgba(255,107,118,0.4)",
                    }}
                >
                    -{ptsBehind} pts behind
                </span>
            </div>
            <div className="text-xs font-mono text-[#a0a0ab] uppercase tracking-widest mb-3">
                Leader scored <span className="text-[#fafafa] font-bold">{gap.best}</span>{" "}
                <span>·</span> You scored <span className="text-[#fafafa] font-bold">{gap.you}</span>
            </div>
            <div className="text-sm text-[#fafafa] leading-relaxed mb-4">{gap.rationale}</div>

            <div
                className="border p-3 mb-3"
                style={{
                    borderColor: "rgba(98,226,150,0.35)",
                    background: "rgba(98,226,150,0.06)",
                }}
            >
                <div className="text-[10px] font-mono uppercase tracking-widest text-[#62e296] mb-1 inline-flex items-center gap-1.5">
                    💡 Action recommendation
                </div>
                <div className="text-sm text-[#fafafa] leading-relaxed">{action}</div>
            </div>

            <div className="flex items-center gap-2">
                <span
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-mono uppercase tracking-widest"
                    style={{
                        background: `${priorityColor}10`,
                        color: priorityColor,
                        border: `1px solid ${priorityColor}55`,
                    }}
                >
                    ● {gap.priority} priority
                </span>
            </div>
        </div>
    );
}
