import { useEffect, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { useClientQuery } from "../contexts/AuthContext";
import { RecDot, HairlineDivider, Brackets } from "../components/Pieces";
import InfoTip from "../components/InfoTip";
import { toast } from "sonner";

const PRIORITY_COLOR = { High: "#ff6b76", Medium: "#f5c84b", Low: "#62e296" };
const PRIORITY_ORDER = { High: 0, Medium: 1, Low: 2 };

export default function ContentPlan() {
    const cq = useClientQuery();
    const [plan, setPlan] = useState(null);
    const [busy, setBusy] = useState(false);

    const load = async () => {
        try {
            const { data } = await api.get("/content-plan", cq);
            setPlan(data);
        } catch (_) {}
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(cq)]);

    const generate = async () => {
        setBusy(true);
        try {
            await api.post("/content-plan/generate", {}, cq);
            toast.success("Content plan ready");
            load();
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail) || e.message);
        }
        setBusy(false);
    };

    const gaps = [...(plan?.content_gaps || [])].sort(
        (a, b) => (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3),
    );
    const blogs = [...(plan?.blog_topics || [])].sort(
        (a, b) => (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3),
    );
    const wp = plan?.weekly_plan || {};

    return (
        <div data-testid="content-plan-page">
            <div className="flex items-center gap-3 mb-2">
                <RecDot />
                <span className="font-mono-tech text-[10px] text-[#a0a0ab]">
                    // strategy / content plan
                </span>
            </div>
            <div className="flex flex-wrap items-end justify-between gap-4 mb-3">
                <h1 className="font-display uppercase tracking-tight font-black text-4xl sm:text-5xl">
                    Content plan
                </h1>
                <button onClick={generate} disabled={busy} className="pg-btn-primary" data-testid="gen-content-plan-btn">
                    {busy ? "Generating…" : plan?.updated_at ? "↻ Regenerate plan" : "▶ Generate plan"}
                </button>
            </div>
            <p className="text-[#a0a0ab] text-sm max-w-3xl mb-6 leading-relaxed">
                The plan your clients actually execute. Built from your post history + observed
                competitor activity. <strong>Content gaps</strong> show what rivals are winning on
                that you're not posting. <strong>Blog topics</strong> are SEO-ready titles. The{" "}
                <strong>weekly plan</strong> covers reels/shorts ideas, paid ad concepts, longform
                drops and outreach moves — copy-paste it into your team's calendar.
            </p>
            {plan?.updated_at && (
                <div className="text-[10px] font-mono text-[#a0a0ab] uppercase tracking-widest mb-4">
                    Updated {new Date(plan.updated_at).toLocaleString()}
                </div>
            )}
            <HairlineDivider className="mb-6" />

            {/* Empty state */}
            {!plan?.updated_at && !busy && (
                <div className="pg-card p-10 text-center" data-testid="content-plan-empty">
                    <div className="font-mono-tech text-[10px] text-[#a0a0ab] mb-3">// no plan yet</div>
                    <h2 className="font-display uppercase tracking-tight font-bold text-2xl mb-3">
                        Build your first plan
                    </h2>
                    <p className="text-[#a0a0ab] text-sm max-w-md mx-auto mb-6">
                        Hit <span className="text-[#e6192b]">Generate plan</span> above and we'll
                        analyse your channels + competitor posts to ship a complete content brief.
                    </p>
                </div>
            )}

            {plan?.updated_at && (
                <>
                    {/* Content gaps */}
                    <Section
                        title="Content gaps"
                        subtitle="What competitors are winning on that you're not posting"
                        info="Each gap is ranked by how big a window it leaves open. Close the High-priority ones first — they're typically the easiest wins."
                    >
                        <div className="space-y-3">
                            {gaps.length === 0 && (
                                <div className="text-[#a0a0ab] text-sm font-mono">No gaps identified yet.</div>
                            )}
                            {gaps.map((g, i) => (
                                <div
                                    key={i}
                                    className="grid grid-cols-12 gap-4 items-start border border-[#a0a0ab]/15 p-4 hover:border-[#fafafa]/40 transition-colors"
                                    data-testid={`gap-${i}`}
                                >
                                    <div className="col-span-12 md:col-span-3">
                                        <div className="font-display uppercase tracking-tight font-bold text-sm">{g.topic}</div>
                                        {g.competitor_handle && (
                                            <div className="text-[10px] font-mono text-[#a0a0ab] uppercase tracking-widest mt-1">
                                                Winning: {g.competitor_handle}
                                            </div>
                                        )}
                                    </div>
                                    <div className="col-span-12 md:col-span-7 text-sm text-[#fafafa] leading-relaxed">
                                        {g.rationale}
                                        {g.priority_reason && (
                                            <div className="text-[11px] text-[#a0a0ab] mt-2">
                                                <span className="font-mono uppercase tracking-widest text-[9px]">why this priority:</span>{" "}
                                                {g.priority_reason}
                                            </div>
                                        )}
                                    </div>
                                    <div className="col-span-12 md:col-span-2 flex md:justify-end">
                                        <PriorityChip priority={g.priority} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Section>

                    {/* Blog topics */}
                    <Section
                        title="Blog topics to write"
                        subtitle="SEO-ready titles with angle + target keyword"
                        info="Each title is sized for SERP display (under 70 chars). Target keyword is what to optimise the page for."
                    >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {blogs.length === 0 && (
                                <div className="text-[#a0a0ab] text-sm font-mono col-span-full">
                                    No topics yet.
                                </div>
                            )}
                            {blogs.map((b, i) => (
                                <div
                                    key={i}
                                    className="border border-[#a0a0ab]/15 p-4 hover:border-[#fafafa]/40 transition-colors"
                                    data-testid={`blog-${i}`}
                                >
                                    <div className="flex items-start justify-between gap-3 mb-2">
                                        <div className="font-display uppercase tracking-tight font-bold text-base leading-tight">
                                            {b.title}
                                        </div>
                                        <PriorityChip priority={b.priority} compact />
                                    </div>
                                    <div className="text-sm text-[#a0a0ab] leading-relaxed mb-3">{b.angle}</div>
                                    {b.target_keyword && (
                                        <div className="text-[10px] font-mono text-[#62e296] uppercase tracking-widest border border-[#62e296]/30 bg-[#62e296]/5 inline-block px-2 py-1">
                                            kw: {b.target_keyword}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </Section>

                    {/* Weekly plan */}
                    <Section
                        title={wp.week_label || "This week's plan"}
                        subtitle="Reels / Shorts ideas, paid ads, longform drops, outreach moves"
                        info="A copy-paste-ready brief for your team. Reels = short vertical video. Longform = blog / LinkedIn essay / YouTube. Outreach = manual relationship moves."
                    >
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <SubBucket label="Reels / Shorts ideas" color="#e6192b">
                                {(wp.reels_shorts || []).map((r, i) => (
                                    <div key={i} className="border-l-2 pl-3 mb-3" style={{ borderColor: "#e6192b" }}>
                                        <div className="font-display uppercase tracking-tight font-semibold text-sm mb-1">{r.title}</div>
                                        {r.hook && <div className="text-xs text-[#fafafa] mb-1"><span className="font-mono uppercase tracking-widest text-[9px] text-[#a0a0ab] mr-1">hook:</span>{r.hook}</div>}
                                        {r.cta && <div className="text-xs text-[#a0a0ab]"><span className="font-mono uppercase tracking-widest text-[9px] mr-1">cta:</span>{r.cta}</div>}
                                        {r.platform && (
                                            <div className="text-[9px] font-mono uppercase tracking-widest mt-1 text-[#a0a0ab]">→ {r.platform}</div>
                                        )}
                                    </div>
                                ))}
                                {(wp.reels_shorts || []).length === 0 && <Empty />}
                            </SubBucket>

                            <SubBucket label="Paid ad recommendations" color="#62e296">
                                {(wp.paid_ads || []).map((a, i) => (
                                    <div key={i} className="border-l-2 pl-3 mb-3" style={{ borderColor: "#62e296" }}>
                                        <div className="font-display uppercase tracking-tight font-semibold text-sm mb-1">
                                            {a.platform} · {a.concept}
                                        </div>
                                        {a.audience && <div className="text-xs text-[#a0a0ab] mb-1"><span className="font-mono uppercase tracking-widest text-[9px] mr-1">audience:</span>{a.audience}</div>}
                                        {a.budget_band && <div className="text-[10px] font-mono text-[#62e296] uppercase tracking-widest">budget: {a.budget_band}</div>}
                                    </div>
                                ))}
                                {(wp.paid_ads || []).length === 0 && <Empty />}
                            </SubBucket>

                            <SubBucket label="Longform drops" color="#f5c84b">
                                {(wp.longform || []).map((l, i) => (
                                    <div key={i} className="border-l-2 pl-3 mb-3" style={{ borderColor: "#f5c84b" }}>
                                        <div className="font-display uppercase tracking-tight font-semibold text-sm mb-1">{l.topic}</div>
                                        <div className="text-[10px] font-mono uppercase tracking-widest text-[#a0a0ab]">
                                            {l.platform} · {l.format}
                                        </div>
                                    </div>
                                ))}
                                {(wp.longform || []).length === 0 && <Empty />}
                            </SubBucket>

                            <SubBucket label="Outreach moves" color="#ff9a3c">
                                {(wp.outreach || []).map((o, i) => (
                                    <div key={i} className="border-l-2 pl-3 mb-3" style={{ borderColor: "#ff9a3c" }}>
                                        <div className="font-display uppercase tracking-tight font-semibold text-sm mb-1">{o.action}</div>
                                        <div className="text-[10px] font-mono uppercase tracking-widest text-[#a0a0ab]">
                                            target: {o.target} · via {o.channel}
                                        </div>
                                    </div>
                                ))}
                                {(wp.outreach || []).length === 0 && <Empty />}
                            </SubBucket>
                        </div>
                    </Section>
                </>
            )}
        </div>
    );
}

function Section({ title, subtitle, info, children }) {
    return (
        <div className="pg-card p-6 mb-8">
            <Brackets />
            <div className="flex items-start justify-between gap-3 mb-1">
                <div>
                    <div className="font-mono-tech text-[10px] text-[#a0a0ab] mb-1 inline-flex items-center gap-2">
                        // {subtitle}
                        {info && <InfoTip>{info}</InfoTip>}
                    </div>
                    <h3 className="font-display uppercase tracking-tight font-bold text-xl">{title}</h3>
                </div>
            </div>
            <div className="mt-4">{children}</div>
        </div>
    );
}

function SubBucket({ label, color, children }) {
    return (
        <div className="border border-[#a0a0ab]/15 p-4" style={{ boxShadow: `inset 3px 0 0 0 ${color}` }}>
            <div className="font-mono-tech text-[10px] text-[#a0a0ab] mb-3">{label}</div>
            {children}
        </div>
    );
}

function Empty() {
    return <div className="text-[#a0a0ab] text-xs font-mono">No items.</div>;
}

function PriorityChip({ priority, compact = false }) {
    const color = PRIORITY_COLOR[priority] || "#a0a0ab";
    return (
        <span
            className={`inline-flex items-center gap-1.5 ${compact ? "px-2 py-[2px]" : "px-3 py-1"} border text-[10px] font-mono uppercase tracking-widest whitespace-nowrap`}
            style={{ borderColor: `${color}55`, color, background: `${color}10` }}
        >
            ● {priority}
        </span>
    );
}
