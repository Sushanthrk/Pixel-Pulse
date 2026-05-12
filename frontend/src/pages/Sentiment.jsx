import { useEffect, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { useClientQuery } from "../contexts/AuthContext";
import { RecDot, HairlineDivider, Brackets } from "../components/Pieces";
import InfoTip from "../components/InfoTip";
import PlatformIcon from "../components/PlatformIcon";
import AnimatedNumber from "../components/AnimatedNumber";
import { platformMeta } from "../lib/platforms";
import { toast } from "sonner";

const PRIORITY_COLOR = { High: "#ff6b76", Medium: "#f5c84b", Low: "#62e296" };
const SENT_COLOR = { Positive: "#62e296", Neutral: "#a0a0ab", Negative: "#ff6b76" };

export default function Sentiment() {
    const cq = useClientQuery();
    const [data, setData] = useState(null);
    const [busy, setBusy] = useState(false);

    const load = async () => {
        try {
            const { data } = await api.get("/sentiment/deep", cq);
            setData(data);
        } catch (_) {}
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(cq)]);

    const run = async () => {
        setBusy(true);
        try {
            await api.post("/sentiment/deep", {}, cq);
            toast.success("Sentiment refreshed");
            load();
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail) || e.message);
        }
        setBusy(false);
    };

    const score = data?.overall_score ?? 0;
    const ring = scoreRing(score);

    return (
        <div data-testid="sentiment-page">
            <div className="flex items-center gap-3 mb-2">
                <RecDot />
                <span className="font-mono-tech text-[10px] text-[#a0a0ab]">
                    // voice of customer · sentiment
                </span>
            </div>
            <div className="flex flex-wrap items-end justify-between gap-4 mb-3">
                <h1 className="font-display uppercase tracking-tight font-black text-4xl sm:text-5xl">
                    Sentiment lab
                </h1>
                <button onClick={run} disabled={busy} className="pg-btn-primary" data-testid="run-sentiment-btn">
                    {busy ? "Analysing…" : data?.ready ? "↻ Refresh analysis" : "▶ Run analysis"}
                </button>
            </div>
            <p className="text-[#a0a0ab] text-sm max-w-3xl mb-6 leading-relaxed">
                Pulls your last 40 public posts/reviews across connected channels and asks Claude
                Sonnet 4.5 to produce a per-platform sentiment breakdown, the dominant themes
                (with representative quotes) and an actionable response plan ranked by priority.
            </p>
            <HairlineDivider className="mb-6" />

            {!data?.ready && !busy && (
                <div className="pg-card p-10 text-center" data-testid="sentiment-empty">
                    <div className="font-mono-tech text-[10px] text-[#a0a0ab] mb-3">// nothing analysed yet</div>
                    <p className="text-[#a0a0ab] text-sm max-w-md mx-auto">
                        Click <span className="text-[#e6192b]">Run analysis</span> above. Make sure
                        you have at least a few posts synced or entered manually.
                    </p>
                </div>
            )}

            {data?.ready && (
                <>
                    {/* Top dashlets: overall + breakdown ring */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-8">
                        <div className="pg-card p-6 relative overflow-hidden lg:col-span-1" style={{ boxShadow: `inset 3px 0 0 0 ${ring.color}` }}>
                            <Brackets />
                            <div className="absolute -top-10 -right-10 w-40 h-40 opacity-[0.1] pointer-events-none" style={{ background: `radial-gradient(circle, ${ring.color}, transparent 70%)` }} />
                            <div className="font-mono-tech text-[10px] text-[#a0a0ab] mb-1 inline-flex items-center gap-2">
                                Overall sentiment
                                <InfoTip>
                                    Single 0-100 number. 0 = very negative, 50 = neutral, 100 = very
                                    positive. Computed by an LLM reading recent public posts.
                                </InfoTip>
                            </div>
                            <div className="text-[11px] font-mono text-[#a0a0ab] uppercase tracking-widest mb-4">
                                {ring.label}
                            </div>
                            <div className="flex items-center gap-5">
                                <RadialGauge score={score} color={ring.color} />
                            </div>
                            <div className="text-[10px] font-mono text-[#a0a0ab] uppercase tracking-widest mt-3">
                                Updated {new Date(data.updated_at).toLocaleString()}
                            </div>
                        </div>

                        {/* By platform */}
                        <div className="pg-card p-6 lg:col-span-2">
                            <Brackets />
                            <div className="font-mono-tech text-[10px] text-[#a0a0ab] mb-1 inline-flex items-center gap-2">
                                // per-platform breakdown
                                <InfoTip>
                                    Each connected channel gets its own sentiment score, sample size
                                    (how many posts contributed), and a 1-line summary.
                                </InfoTip>
                            </div>
                            <h3 className="font-display uppercase tracking-tight font-bold text-xl mb-4">
                                Where the signal lives
                            </h3>
                            <div className="space-y-3">
                                {(data.by_platform || []).map((p, i) => {
                                    const meta = platformMeta(p.platform);
                                    const c = p.score >= 70 ? "#62e296" : p.score >= 40 ? "#f5c84b" : "#ff6b76";
                                    return (
                                        <div key={i} className="grid grid-cols-12 gap-3 items-center border border-[#a0a0ab]/10 p-3" data-testid={`sentiment-platform-${p.platform}`}>
                                            <div className="col-span-3 flex items-center gap-2">
                                                <PlatformIcon platform={p.platform} size={18} />
                                                <div>
                                                    <div className="font-display uppercase tracking-tight font-bold text-xs">
                                                        {meta.label}
                                                    </div>
                                                    <div className="text-[9px] font-mono uppercase tracking-widest text-[#a0a0ab]">
                                                        n = {p.sample_size}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="col-span-2">
                                                <div className="font-display text-2xl font-black" style={{ color: c }}>
                                                    <AnimatedNumber value={p.score} />
                                                </div>
                                            </div>
                                            <div className="col-span-7 text-xs text-[#a0a0ab] leading-relaxed">{p.summary}</div>
                                        </div>
                                    );
                                })}
                                {(data.by_platform || []).length === 0 && <div className="text-[#a0a0ab] text-sm">No platform breakdown.</div>}
                            </div>
                        </div>
                    </div>

                    {/* Key themes */}
                    <div className="pg-card p-6 mb-8">
                        <Brackets />
                        <div className="font-mono-tech text-[10px] text-[#a0a0ab] mb-1 inline-flex items-center gap-2">
                            // dominant themes
                            <InfoTip>
                                The 4-6 topics that keep coming up in conversation about your brand,
                                with a representative paraphrased quote. <strong>Weight</strong> =
                                how loudly the theme is showing up.
                            </InfoTip>
                        </div>
                        <h3 className="font-display uppercase tracking-tight font-bold text-xl mb-4">Key themes</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {(data.key_themes || []).map((t, i) => {
                                const c = SENT_COLOR[t.sentiment] || "#a0a0ab";
                                return (
                                    <div key={i} className="border border-[#a0a0ab]/15 p-4" style={{ boxShadow: `inset 3px 0 0 0 ${c}` }} data-testid={`theme-${i}`}>
                                        <div className="flex justify-between items-start gap-3 mb-2">
                                            <div className="font-display uppercase tracking-tight font-bold text-base">{t.theme}</div>
                                            <span className="inline-flex items-center gap-1 px-2 py-[2px] border text-[9px] font-mono uppercase tracking-widest" style={{ borderColor: `${c}55`, color: c, background: `${c}10` }}>
                                                ● {t.sentiment}
                                            </span>
                                        </div>
                                        {t.quote && (
                                            <blockquote className="text-sm text-[#fafafa] italic border-l border-[#a0a0ab]/30 pl-3 mb-2 leading-relaxed">"{t.quote}"</blockquote>
                                        )}
                                        {t.rationale && <div className="text-xs text-[#a0a0ab] leading-relaxed">{t.rationale}</div>}
                                        <div className="text-[9px] font-mono uppercase tracking-widest mt-2 text-[#a0a0ab]">
                                            weight: {t.weight}
                                        </div>
                                    </div>
                                );
                            })}
                            {(data.key_themes || []).length === 0 && <div className="text-[#a0a0ab] text-sm col-span-full">No themes detected.</div>}
                        </div>
                    </div>

                    {/* Action plan */}
                    <div className="pg-card p-6">
                        <Brackets />
                        <div className="font-mono-tech text-[10px] text-[#a0a0ab] mb-1 inline-flex items-center gap-2">
                            // sentiment action plan
                            <InfoTip>
                                Specific moves your team can run to lift sentiment over the next
                                weeks. High-priority items go to the top of the queue.
                            </InfoTip>
                        </div>
                        <h3 className="font-display uppercase tracking-tight font-bold text-xl mb-4">What to do next</h3>
                        <ol className="space-y-3">
                            {(data.action_plan || []).map((a, i) => {
                                const c = PRIORITY_COLOR[a.priority] || "#a0a0ab";
                                return (
                                    <li key={i} className="grid grid-cols-[auto_1fr_auto] gap-4 items-start border border-[#a0a0ab]/15 p-4" data-testid={`sent-action-${i}`}>
                                        <div className="font-display text-2xl font-black tabular-nums" style={{ color: i === 0 ? "#e6192b" : "#fafafa", opacity: i === 0 ? 1 : 0.5 }}>
                                            {String(i + 1).padStart(2, "0")}
                                        </div>
                                        <div>
                                            <div className="font-display uppercase tracking-tight font-bold text-sm mb-1">{a.title}</div>
                                            <div className="text-xs text-[#a0a0ab] leading-relaxed">{a.description}</div>
                                            {a.timeframe && (
                                                <div className="text-[9px] font-mono uppercase tracking-widest mt-1 text-[#a0a0ab]">⏱ {a.timeframe}</div>
                                            )}
                                        </div>
                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 border text-[10px] font-mono uppercase tracking-widest" style={{ borderColor: `${c}55`, color: c, background: `${c}10` }}>
                                            ● {a.priority}
                                        </span>
                                    </li>
                                );
                            })}
                        </ol>
                    </div>
                </>
            )}
        </div>
    );
}

function scoreRing(s) {
    if (s >= 75) return { color: "#62e296", label: "Positive" };
    if (s >= 50) return { color: "#f5c84b", label: "Mixed / Neutral" };
    if (s >= 25) return { color: "#ff9a3c", label: "Mostly negative" };
    return { color: "#ff6b76", label: "Negative" };
}

function RadialGauge({ score, color }) {
    const size = 140;
    const stroke = 12;
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const offset = c - (score / 100) * c;
    return (
        <div className="relative" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="-rotate-90">
                <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(160,160,171,0.15)" strokeWidth={stroke} fill="none" />
                <circle
                    cx={size / 2} cy={size / 2} r={r}
                    stroke={color} strokeWidth={stroke} strokeLinecap="round" fill="none"
                    strokeDasharray={c} strokeDashoffset={offset}
                    style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.4,0,0.2,1)", filter: `drop-shadow(0 0 8px ${color}66)` }}
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="font-display font-black text-4xl tabular-nums leading-none text-[#fafafa]"><AnimatedNumber value={score} /></div>
                <div className="text-[9px] font-mono text-[#a0a0ab] uppercase tracking-widest mt-1">/ 100</div>
            </div>
        </div>
    );
}
