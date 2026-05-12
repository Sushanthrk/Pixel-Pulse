import { useEffect, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { useClientQuery } from "../contexts/AuthContext";
import { RecDot, HairlineDivider, Brackets } from "../components/Pieces";
import InfoTip from "../components/InfoTip";
import AnimatedNumber from "../components/AnimatedNumber";
import { toast } from "sonner";

const PRIORITY_COLOR = { High: "#ff6b76", Medium: "#f5c84b", Low: "#62e296" };
const ENGINE_COLOR = { "gpt-5.2": "#10a37f", "claude-sonnet-4.5": "#d08770", "gemini-3-flash": "#4285f4" };

export default function AIActionPlan() {
    const cq = useClientQuery();
    const [data, setData] = useState(null);
    const [busy, setBusy] = useState(false);

    const load = async () => {
        try {
            const { data } = await api.get("/ai-action-plan", cq);
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
            await api.post("/ai-action-plan/generate", {}, cq);
            toast.success("AI plan ready");
            load();
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail) || e.message);
        }
        setBusy(false);
    };

    const stats = data?.stats || {};
    const months = data?.estimated_months || 6;
    const timeline = (data?.timeline || []).slice(0, 6);

    return (
        <div data-testid="ai-action-plan-page">
            <div className="flex items-center gap-3 mb-2">
                <RecDot />
                <span className="font-mono-tech text-[10px] text-[#a0a0ab]">
                    // generative engine optimisation · ranking plan
                </span>
            </div>
            <div className="flex flex-wrap items-end justify-between gap-4 mb-3">
                <h1 className="font-display uppercase tracking-tight font-black text-4xl sm:text-5xl">
                    AI ranking plan
                </h1>
                <button onClick={run} disabled={busy} className="pg-btn-primary" data-testid="run-ai-plan-btn">
                    {busy ? "Generating…" : data?.updated_at ? "↻ Regenerate" : "▶ Generate plan"}
                </button>
            </div>
            <p className="text-[#a0a0ab] text-sm max-w-3xl mb-6 leading-relaxed">
                A concrete plan to start surfacing in <strong>ChatGPT (GPT-5.2), Claude Sonnet 4.5
                and Gemini 3 Flash</strong> when buyers ask about your category. We look at your
                current AI visibility, which competitors are being cited instead, and produce a
                ranked playbook with monthly milestones — a separate, deeper layer on top of the
                per-query plans you can run from the Geo tab.
            </p>
            <HairlineDivider className="mb-6" />

            {!data?.updated_at && !busy && (
                <div className="pg-card p-10 text-center" data-testid="ai-plan-empty">
                    <div className="font-mono-tech text-[10px] text-[#a0a0ab] mb-3">// no plan yet</div>
                    <p className="text-[#a0a0ab] text-sm max-w-md mx-auto">
                        Tip: add a few queries on the <strong>Geo</strong> tab and Run scan first.
                        Then hit <span className="text-[#e6192b]">Generate plan</span> to get a
                        plan that's grounded in your actual mention data.
                    </p>
                </div>
            )}

            {data?.updated_at && (
                <>
                    {/* Top strip */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-8">
                        <div className="pg-card p-6 relative overflow-hidden" style={{ boxShadow: "inset 3px 0 0 0 #e6192b" }}>
                            <Brackets />
                            <div className="absolute -top-12 -right-12 w-44 h-44 opacity-[0.1] pointer-events-none" style={{ background: "radial-gradient(circle, #e6192b, transparent 70%)" }} />
                            <div className="font-mono-tech text-[10px] text-[#a0a0ab] mb-1 inline-flex items-center gap-2">
                                Time to first mention
                                <InfoTip>
                                    Realistic months until your brand starts surfacing in LLM
                                    answers if you execute this plan consistently.
                                </InfoTip>
                            </div>
                            <div className="flex items-baseline gap-3 mt-3">
                                <div className="font-display font-black text-7xl text-[#e6192b] leading-none"><AnimatedNumber value={months} /></div>
                                <div className="font-display uppercase tracking-tight font-bold text-2xl text-[#fafafa]">mo</div>
                            </div>
                            <div className="text-[10px] font-mono text-[#a0a0ab] uppercase tracking-widest mt-2">
                                projection
                            </div>
                        </div>

                        <div className="pg-card p-6 lg:col-span-2">
                            <Brackets />
                            <div className="font-mono-tech text-[10px] text-[#a0a0ab] mb-1 inline-flex items-center gap-2">
                                // diagnosis
                                <InfoTip>
                                    Where you are today and what we're aiming for. The numbers come
                                    from your latest Geo scan.
                                </InfoTip>
                            </div>
                            <h3 className="font-display uppercase tracking-tight font-bold text-xl mb-3">
                                Current state → target state
                            </h3>
                            {data.current_state && (
                                <p className="text-sm text-[#fafafa] leading-relaxed mb-2">
                                    <span className="font-mono uppercase tracking-widest text-[9px] text-[#a0a0ab] mr-2">now:</span>
                                    {data.current_state}
                                </p>
                            )}
                            {data.target_state && (
                                <p className="text-sm leading-relaxed text-[#fafafa]">
                                    <span className="font-mono uppercase tracking-widest text-[9px] text-[#62e296] mr-2">target:</span>
                                    {data.target_state}
                                </p>
                            )}
                            <div className="grid grid-cols-3 gap-3 mt-5">
                                <Stat label="Queries scanned" value={stats.scanned ?? 0} />
                                <Stat label="Mention hits" value={stats.hits ?? 0} color="#62e296" />
                                <Stat label="Mention misses" value={stats.misses ?? 0} color="#ff6b76" />
                            </div>
                        </div>
                    </div>

                    {/* Competitors stealing oxygen */}
                    {(stats.top_competitors || []).length > 0 && (
                        <div className="pg-card p-6 mb-8" data-testid="competitors-mentioned">
                            <Brackets />
                            <div className="font-mono-tech text-[10px] text-[#a0a0ab] mb-1 inline-flex items-center gap-2">
                                // who is being cited instead
                                <InfoTip>Competitors that the LLMs surfaced when your brand didn't.</InfoTip>
                            </div>
                            <h3 className="font-display uppercase tracking-tight font-bold text-xl mb-4">
                                Stealing the oxygen
                            </h3>
                            <div className="flex flex-wrap gap-2">
                                {(stats.top_competitors || []).map((c) => (
                                    <span key={c.handle} className="inline-flex items-center gap-2 px-3 py-1 border border-[#ff6b76]/40 bg-[#ff6b76]/5 text-[#ff6b76] text-[10px] font-mono uppercase tracking-widest">
                                        {c.handle} <span className="text-[#fafafa]/70">·</span> {c.mentions}×
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Recommendations + Timeline */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-10">
                        <div className="pg-card p-6 lg:col-span-2">
                            <Brackets />
                            <div className="font-mono-tech text-[10px] text-[#a0a0ab] mb-1 inline-flex items-center gap-2">
                                // ranked recommendations
                                <InfoTip>
                                    Each move is tagged by priority, effort and which engines it
                                    most affects. Tackle High-priority Low-effort items first.
                                </InfoTip>
                            </div>
                            <h3 className="font-display uppercase tracking-tight font-bold text-xl mb-4">
                                Playbook
                            </h3>
                            <ol className="space-y-4">
                                {(data.recommendations || []).map((r, i) => {
                                    const c = PRIORITY_COLOR[r.priority] || "#a0a0ab";
                                    return (
                                        <li key={i} className="grid grid-cols-[auto_1fr] gap-4" data-testid={`ai-rec-${i}`}>
                                            <div className="font-display text-2xl font-black tabular-nums leading-none" style={{ color: i === 0 ? "#e6192b" : "#fafafa", opacity: i === 0 ? 1 : 0.45 }}>
                                                {String(i + 1).padStart(2, "0")}
                                            </div>
                                            <div>
                                                <div className="font-display uppercase tracking-tight font-bold text-sm mb-1">{r.title}</div>
                                                <div className="text-xs text-[#a0a0ab] leading-relaxed mb-2">{r.description}</div>
                                                <div className="flex flex-wrap gap-2">
                                                    <span className="inline-flex items-center gap-1 px-2 py-[2px] border text-[9px] font-mono uppercase tracking-widest" style={{ borderColor: `${c}55`, color: c, background: `${c}10` }}>
                                                        ● {r.priority}
                                                    </span>
                                                    {r.effort && (
                                                        <span className="inline-flex items-center px-2 py-[2px] border border-[#a0a0ab]/25 text-[9px] font-mono uppercase tracking-widest text-[#a0a0ab]">
                                                            {r.effort} effort
                                                        </span>
                                                    )}
                                                    {r.timeframe && (
                                                        <span className="inline-flex items-center px-2 py-[2px] border border-[#a0a0ab]/25 text-[9px] font-mono uppercase tracking-widest text-[#a0a0ab]">
                                                            {r.timeframe}
                                                        </span>
                                                    )}
                                                    {(r.engines_affected || []).map((eng) => (
                                                        <span key={eng} className="inline-flex items-center px-2 py-[2px] border text-[9px] font-mono uppercase tracking-widest" style={{ borderColor: `${ENGINE_COLOR[eng] || "#a0a0ab"}55`, color: ENGINE_COLOR[eng] || "#a0a0ab" }}>
                                                            {eng}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ol>
                        </div>

                        <div className="pg-card p-6">
                            <Brackets />
                            <div className="font-mono-tech text-[10px] text-[#a0a0ab] mb-1 inline-flex items-center gap-2">
                                // milestones month-by-month
                                <InfoTip>Map of what should be true at the end of each month.</InfoTip>
                            </div>
                            <h3 className="font-display uppercase tracking-tight font-bold text-xl mb-4">Timeline</h3>
                            <div className="relative pl-6">
                                <div className="absolute left-2 top-2 bottom-2 w-px bg-gradient-to-b from-[#e6192b] via-[#a0a0ab]/30 to-transparent" />
                                {timeline.map((t, i) => (
                                    <div key={i} className="relative pb-5 last:pb-0">
                                        <div
                                            className="absolute -left-[18px] top-1 w-3 h-3 rounded-full border-2"
                                            style={{
                                                background: i === timeline.length - 1 ? "#62e296" : "#e6192b",
                                                borderColor: "#050505",
                                                boxShadow: `0 0 8px ${i === timeline.length - 1 ? "#62e296" : "#e6192b"}`,
                                            }}
                                        />
                                        <div className="font-mono text-[10px] uppercase tracking-widest text-[#a0a0ab] mb-1">Month {t.month}</div>
                                        <div className="text-sm text-[#fafafa] leading-relaxed">{t.milestone}</div>
                                    </div>
                                ))}
                                {timeline.length === 0 && <div className="text-[#a0a0ab] text-sm">No timeline.</div>}
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

function Stat({ label, value, color = "#fafafa" }) {
    return (
        <div className="border border-[#a0a0ab]/15 p-3">
            <div className="text-[9px] font-mono uppercase tracking-widest text-[#a0a0ab]">{label}</div>
            <div className="font-display text-2xl font-black mt-1" style={{ color }}>
                <AnimatedNumber value={value} />
            </div>
        </div>
    );
}
