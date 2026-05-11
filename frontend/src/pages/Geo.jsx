import { useEffect, useMemo, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { useClientQuery } from "../contexts/AuthContext";
import { RecDot, HairlineDivider, Brackets } from "../components/Pieces";
import { toast } from "sonner";

const ENGINES = ["gpt-5.2", "claude-sonnet-4.5", "gemini-3-flash"];

export default function Geo() {
    const cq = useClientQuery();
    const [queries, setQueries] = useState([]);
    const [results, setResults] = useState([]);
    const [plans, setPlans] = useState([]);
    const [planBusy, setPlanBusy] = useState(null);
    const [form, setForm] = useState({ query: "", brand_terms: "" });
    const [scanning, setScanning] = useState(false);

    const load = async () => {
        try {
            const [q, r, p] = await Promise.all([
                api.get("/geo/queries", cq),
                api.get("/geo/results", cq),
                api.get("/geo/recommendations", cq),
            ]);
            setQueries(q.data);
            setResults(r.data);
            setPlans(p.data);
        } catch (_) {}
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(cq)]);

    const add = async (e) => {
        e.preventDefault();
        try {
            await api.post(
                "/geo/queries",
                {
                    query: form.query,
                    brand_terms: form.brand_terms.split(",").map((b) => b.trim()).filter(Boolean),
                },
                cq,
            );
            toast.success("Query added");
            setForm({ query: "", brand_terms: "" });
            load();
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail) || e.message);
        }
    };

    const remove = async (id) => {
        try {
            await api.delete(`/geo/queries/${id}`);
            load();
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail) || e.message);
        }
    };

    const scan = async () => {
        if (queries.length === 0) {
            toast("Add at least one query first.");
            return;
        }
        setScanning(true);
        try {
            // Run each engine as a separate HTTP call in parallel so a single
            // slow engine can't blow past the ingress 60s idle timeout.
            const calls = ENGINES.map((engine) =>
                api
                    .post("/geo/scan", { engines: [engine] }, cq)
                    .then((r) => ({ engine, ok: true, count: r.data.count }))
                    .catch((e) => ({ engine, ok: false, error: formatApiError(e.response?.data?.detail) || e.message })),
            );
            const outcomes = await Promise.all(calls);
            const okEngines = outcomes.filter((o) => o.ok);
            const failed = outcomes.filter((o) => !o.ok);
            if (okEngines.length > 0) toast.success(`Scanned ${okEngines.length}/${ENGINES.length} engines`);
            failed.forEach((f) => toast.error(`${f.engine}: ${f.error}`));
            load();
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail) || e.message);
        }
        setScanning(false);
    };

    const generatePlan = async (queryId) => {
        setPlanBusy(queryId);
        try {
            await api.post(`/geo/recommendations/${queryId}`, {}, cq);
            toast.success("Action plan ready");
            load();
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail) || e.message);
        }
        setPlanBusy(null);
    };

    const removePlan = async (planId) => {
        try {
            await api.delete(`/geo/recommendations/${planId}`);
            load();
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail) || e.message);
        }
    };

    const mentionRate = useMemo(() => {
        // per engine: % of latest queries where mentioned=true
        const grouped = {};
        ENGINES.forEach((e) => (grouped[e] = []));
        // pick latest per (query_id, engine)
        const latest = {};
        results.forEach((r) => {
            const k = `${r.query_id}::${r.engine}`;
            if (!latest[k] || new Date(r.ran_at) > new Date(latest[k].ran_at)) latest[k] = r;
        });
        Object.values(latest).forEach((r) => {
            if (grouped[r.engine]) grouped[r.engine].push(r);
        });
        return ENGINES.map((engine) => {
            const arr = grouped[engine] || [];
            const total = arr.length;
            const hits = arr.filter((r) => r.mentioned).length;
            return { engine, total, hits, rate: total ? Math.round((hits / total) * 100) : 0 };
        });
    }, [results]);

    const competitorTable = useMemo(() => {
        const c = {};
        results.forEach((r) => (r.competitor_mentions || []).forEach((h) => (c[h] = (c[h] || 0) + 1)));
        return Object.entries(c).sort((a, b) => b[1] - a[1]);
    }, [results]);

    return (
        <div data-testid="geo-page">
            <div className="flex items-center gap-3 mb-2">
                <RecDot />
                <span className="font-mono-tech text-[10px] text-[#a0a0ab]">
                    // generative engine optimisation · brand mention tracker
                </span>
            </div>
            <div className="flex flex-wrap justify-between items-end gap-4 mb-8">
                <h1 className="font-display uppercase tracking-tight font-black text-4xl sm:text-5xl">
                    Geo radar
                </h1>
                <button
                    onClick={scan}
                    disabled={scanning}
                    className="pg-btn-primary"
                    data-testid="run-scan-btn"
                >
                    {scanning ? "Scanning…" : "▶ Run scan (all engines)"}
                </button>
            </div>
            <HairlineDivider className="mb-6" />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-10">
                {mentionRate.map((m) => (
                    <div key={m.engine} className="pg-card p-5" data-testid={`engine-${m.engine}`}>
                        <Brackets />
                        <div className="font-mono-tech text-[10px] text-[#a0a0ab] mb-2">
                            {m.engine}
                        </div>
                        <div className="font-display text-4xl uppercase font-bold">
                            {m.rate}
                            <span className="text-[#a0a0ab] text-xl"> %</span>
                        </div>
                        <div className="text-[10px] font-mono uppercase tracking-widest text-[#a0a0ab] mt-2">
                            {m.hits} / {m.total} queries mention the brand
                        </div>
                    </div>
                ))}
            </div>

            <div className="grid lg:grid-cols-3 gap-6 mb-10">
                <form onSubmit={add} className="pg-card p-6">
                    <Brackets />
                    <div className="font-mono-tech text-[10px] text-[#a0a0ab] mb-3">
                        // add query
                    </div>
                    <h3 className="font-display uppercase tracking-tight font-bold text-xl mb-4">
                        Track a question
                    </h3>
                    <label className="pg-label">Query</label>
                    <input
                        required
                        value={form.query}
                        onChange={(e) => setForm({ ...form, query: e.target.value })}
                        className="pg-input mt-2 mb-4"
                        placeholder="best B2B branding agency in India"
                        data-testid="geo-query-input"
                    />
                    <label className="pg-label">Brand terms (comma sep)</label>
                    <input
                        required
                        value={form.brand_terms}
                        onChange={(e) => setForm({ ...form, brand_terms: e.target.value })}
                        className="pg-input mt-2 mb-5"
                        placeholder="Pixelgrok, pixelgrok.com"
                        data-testid="geo-brand-terms-input"
                    />
                    <button type="submit" className="pg-btn-primary w-full justify-center">
                        Add query
                    </button>
                </form>

                <div className="lg:col-span-2 pg-card p-0 overflow-hidden">
                    <div className="px-6 py-4 flex justify-between items-center">
                        <h3 className="font-display uppercase tracking-tight font-bold text-xl">
                            Queries
                        </h3>
                        <span className="font-mono-tech text-[10px] text-[#a0a0ab]">
                            {queries.length} tracked
                        </span>
                    </div>
                    <HairlineDivider />
                    <div className="divide-y divide-[#a0a0ab]/10">
                        {queries.length === 0 && (
                            <div className="px-6 py-6 text-[#a0a0ab] text-sm">
                                Add 10–20 target queries to track brand-mention rate across GPT-5.2,
                                Claude Sonnet 4.5, Gemini 3 Flash.
                            </div>
                        )}
                        {queries.map((q) => (
                            <div
                                key={q.id}
                                className="px-6 py-4 flex justify-between items-start gap-4"
                            >
                                <div>
                                    <div className="font-body">{q.query}</div>
                                    <div className="text-[10px] font-mono text-[#a0a0ab] uppercase tracking-widest mt-1">
                                        Brand terms: {(q.brand_terms || []).join(", ") || "—"}
                                    </div>
                                </div>
                                <button
                                    onClick={() => remove(q.id)}
                                    className="pg-btn-ghost"
                                    data-testid={`remove-query-${q.id}`}
                                >
                                    Remove
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="pg-card p-6 mb-10">
                <Brackets />
                <div className="font-mono-tech text-[10px] text-[#a0a0ab] mb-3">
                    // mentioned instead
                </div>
                <h3 className="font-display uppercase tracking-tight font-bold text-xl mb-4">
                    Competitors surfacing in answers
                </h3>
                {competitorTable.length === 0 ? (
                    <div className="text-[#a0a0ab] text-sm">
                        After a scan, any of your tracked competitor handles found in the LLM
                        answers will be listed here.
                    </div>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="font-mono-tech text-[10px] text-[#a0a0ab]">
                            <tr className="border-b border-[#a0a0ab]/15">
                                <th className="text-left py-2">Competitor</th>
                                <th className="text-right py-2">Times mentioned</th>
                            </tr>
                        </thead>
                        <tbody>
                            {competitorTable.map(([handle, n]) => (
                                <tr
                                    key={handle}
                                    className="border-b border-[#a0a0ab]/10 hover:bg-[#fafafa]/[0.03]"
                                >
                                    <td className="py-2">{handle}</td>
                                    <td className="py-2 text-right font-mono tabular-nums">{n}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            <div className="pg-card p-6">
                <Brackets />
                <div className="font-mono-tech text-[10px] text-[#a0a0ab] mb-3">
                    // raw transcripts
                </div>
                <h3 className="font-display uppercase tracking-tight font-bold text-xl mb-4">
                    Latest scan results
                </h3>
                <div className="space-y-4">
                    {results.slice(0, 18).map((r) => (
                        <div key={r.id} className="border-l-2 border-[#a0a0ab]/15 pl-4">
                            <div className="flex justify-between items-center text-[10px] font-mono uppercase tracking-widest text-[#a0a0ab] mb-1">
                                <span>
                                    {r.engine} · {new Date(r.ran_at).toLocaleString()}
                                </span>
                                <span
                                    className={`pg-badge ${r.mentioned ? "connected" : ""}`}
                                >
                                    ● {r.mentioned ? "Mentioned" : "Not mentioned"}
                                </span>
                            </div>
                            <div className="text-sm font-body mb-2 text-[#fafafa]">
                                Q: {r.query}
                            </div>
                            <div className="text-sm text-[#a0a0ab] whitespace-pre-wrap">
                                {r.response.slice(0, 600)}
                                {r.response.length > 600 && "…"}
                            </div>
                        </div>
                    ))}
                    {results.length === 0 && (
                        <div className="text-[#a0a0ab] text-sm">No scans yet — hit Run scan.</div>
                    )}
                </div>
            </div>

            <GeoActionPlans
                queries={queries}
                plans={plans}
                planBusy={planBusy}
                onGenerate={generatePlan}
                onRemove={removePlan}
            />
        </div>
    );
}


// ---------- Action plans ----------
function GeoActionPlans({ queries, plans, planBusy, onGenerate, onRemove }) {
    const plansByQuery = useMemo(() => {
        const m = {};
        plans.forEach((p) => (m[p.query_id] = p));
        return m;
    }, [plans]);

    return (
        <div className="pg-card p-8 mt-10 relative overflow-hidden" data-testid="geo-action-plans">
            <Brackets />
            <div
                className="absolute -top-20 -right-20 w-72 h-72 opacity-[0.08] pointer-events-none"
                style={{
                    background: "radial-gradient(circle, #e6192b, transparent 70%)",
                }}
            />
            <div className="flex items-center gap-3 mb-3 relative">
                <RecDot label="STRATEGY" />
                <span className="font-mono-tech text-[10px] text-[#a0a0ab]">
                    // action plans · how to actually rank
                </span>
            </div>
            <h2 className="font-display uppercase tracking-tight font-black text-3xl sm:text-4xl mb-3 relative">
                GEO playbook
            </h2>
            <p className="text-[#a0a0ab] text-sm max-w-3xl mb-8 leading-relaxed relative">
                For every tracked query, generate a structured plan (built by Claude Sonnet 4.5)
                with diagnosis, ranked actions, monthly milestones, and a realistic projection of
                when your brand should start surfacing in LLM answers.
            </p>

            {queries.length === 0 && (
                <div className="text-[#a0a0ab] text-sm font-mono">
                    Add at least one query above to generate a plan.
                </div>
            )}

            <div className="space-y-8">
                {queries.map((q) => (
                    <GeoPlanCard
                        key={q.id}
                        query={q}
                        plan={plansByQuery[q.id]}
                        busy={planBusy === q.id}
                        onGenerate={() => onGenerate(q.id)}
                        onRemove={plansByQuery[q.id] ? () => onRemove(plansByQuery[q.id].id) : null}
                    />
                ))}
            </div>
        </div>
    );
}

function GeoPlanCard({ query, plan, busy, onGenerate, onRemove }) {
    return (
        <div
            className="border border-[#a0a0ab]/15 bg-[#0a0a0a] relative"
            data-testid={`plan-card-${query.id}`}
        >
            {/* header */}
            <div className="flex flex-wrap items-start justify-between gap-3 p-5 border-b border-[#a0a0ab]/10">
                <div>
                    <div className="font-mono-tech text-[10px] text-[#a0a0ab] mb-1">
                        // query
                    </div>
                    <div className="font-display uppercase tracking-tight font-bold text-lg leading-tight">
                        {query.query}
                    </div>
                    {(query.brand_terms || []).length > 0 && (
                        <div className="text-[10px] font-mono text-[#a0a0ab] uppercase tracking-widest mt-1">
                            brand terms: {query.brand_terms.join(", ")}
                        </div>
                    )}
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={onGenerate}
                        disabled={busy}
                        className="pg-btn-primary !text-[10px] !px-4 !py-2"
                        data-testid={`generate-plan-${query.id}`}
                    >
                        {busy ? "Generating…" : plan ? "Regenerate" : "▶ Generate plan"}
                    </button>
                    {onRemove && (
                        <button onClick={onRemove} className="pg-btn-ghost">
                            Remove
                        </button>
                    )}
                </div>
            </div>

            {!plan && !busy && (
                <div className="p-8 text-[#a0a0ab] text-sm font-mono text-center">
                    No plan yet — click <span className="text-[#e6192b]">Generate plan</span> to
                    diagnose and chart a path to the first GEO mention.
                </div>
            )}

            {busy && (
                <div className="p-8 text-[#a0a0ab] text-sm font-mono text-center animate-pulse">
                    Asking Claude to architect the path…
                </div>
            )}

            {plan && <PlanBody plan={plan} />}
        </div>
    );
}

function PlanBody({ plan }) {
    const confidenceColor =
        plan.confidence === "High"
            ? "#62e296"
            : plan.confidence === "Low"
              ? "#ff6b76"
              : "#f5c84b";

    const months = Math.max(1, Math.min(12, Number(plan.estimated_months) || 6));
    const timeline = (plan.timeline || []).slice(0, 6);

    if (!plan.summary && (!plan.actions || plan.actions.length === 0)) {
        // LLM failed to give us structured JSON — show the raw text gracefully
        return (
            <div className="p-6">
                <div className="font-mono-tech text-[10px] text-[#a0a0ab] mb-2">
                    // raw plan
                </div>
                <pre className="text-sm whitespace-pre-wrap text-[#fafafa] font-body leading-relaxed">
                    {plan.raw_payload || "(empty)"}
                </pre>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3">
            {/* LEFT: projection + diagnosis */}
            <div className="p-6 border-r border-[#a0a0ab]/10 lg:col-span-1 relative">
                <div
                    className="absolute top-0 left-0 right-0 h-px"
                    style={{
                        background:
                            "linear-gradient(90deg, transparent, #e6192b, transparent)",
                    }}
                />
                <div className="font-mono-tech text-[10px] text-[#a0a0ab] mb-2">
                    // projection
                </div>
                <div className="flex items-baseline gap-3 mb-1">
                    <div className="font-display text-7xl font-black text-[#e6192b] leading-none">
                        {months}
                    </div>
                    <div className="font-display uppercase tracking-tight font-bold text-2xl text-[#fafafa] leading-none">
                        mo
                    </div>
                </div>
                <div className="text-[11px] font-mono uppercase tracking-widest text-[#a0a0ab] mb-5">
                    estimated time to first mention
                </div>

                <div className="flex items-center gap-2 mb-6">
                    <span
                        className="inline-flex items-center gap-2 px-2 py-1 border text-[10px] font-mono uppercase tracking-widest"
                        style={{
                            borderColor: `${confidenceColor}55`,
                            color: confidenceColor,
                            background: `${confidenceColor}10`,
                        }}
                    >
                        ● {plan.confidence} confidence
                    </span>
                </div>

                <div className="font-mono-tech text-[10px] text-[#a0a0ab] mb-2">
                    // diagnosis
                </div>
                <p className="text-sm text-[#fafafa] leading-relaxed">{plan.summary}</p>
            </div>

            {/* MIDDLE: numbered actions */}
            <div className="p-6 border-r border-[#a0a0ab]/10 lg:col-span-1">
                <div className="font-mono-tech text-[10px] text-[#a0a0ab] mb-3">
                    // playbook
                </div>
                <div className="font-display uppercase tracking-tight font-bold text-lg mb-4">
                    Ranked actions
                </div>
                <ol className="space-y-4">
                    {(plan.actions || []).map((a, i) => (
                        <li
                            key={i}
                            className="grid grid-cols-[auto_1fr] gap-3 group"
                        >
                            <div
                                className="font-display text-2xl font-black tabular-nums leading-none"
                                style={{ color: i === 0 ? "#e6192b" : "#fafafa", opacity: i === 0 ? 1 : 0.45 }}
                            >
                                {String(i + 1).padStart(2, "0")}
                            </div>
                            <div>
                                <div className="font-display uppercase tracking-tight font-semibold text-sm mb-1 text-[#fafafa]">
                                    {a.title}
                                </div>
                                <div className="text-xs text-[#a0a0ab] leading-relaxed mb-2">
                                    {a.rationale}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {a.effort && (
                                        <EffortBadge effort={a.effort} />
                                    )}
                                    {a.timeframe && (
                                        <span className="inline-flex items-center px-2 py-[2px] border border-[#a0a0ab]/25 text-[9px] font-mono uppercase tracking-widest text-[#a0a0ab]">
                                            {a.timeframe}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </li>
                    ))}
                </ol>
            </div>

            {/* RIGHT: monthly timeline */}
            <div className="p-6 lg:col-span-1">
                <div className="font-mono-tech text-[10px] text-[#a0a0ab] mb-3">
                    // timeline · month-by-month
                </div>
                <div className="font-display uppercase tracking-tight font-bold text-lg mb-4">
                    Milestones
                </div>
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
                            <div className="font-mono text-[10px] uppercase tracking-widest text-[#a0a0ab] mb-1">
                                Month {t.month}
                            </div>
                            <div className="text-sm text-[#fafafa] leading-relaxed">
                                {t.milestone}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function EffortBadge({ effort }) {
    const map = {
        Low: { color: "#62e296", dots: 1 },
        Medium: { color: "#f5c84b", dots: 2 },
        High: { color: "#ff6b76", dots: 3 },
    };
    const m = map[effort] || map.Medium;
    return (
        <span
            className="inline-flex items-center gap-1.5 px-2 py-[2px] border text-[9px] font-mono uppercase tracking-widest"
            style={{ borderColor: `${m.color}55`, color: m.color, background: `${m.color}10` }}
        >
            <span className="inline-flex gap-[2px]">
                {[1, 2, 3].map((d) => (
                    <span
                        key={d}
                        className="w-[5px] h-[5px] rounded-full"
                        style={{ background: d <= m.dots ? m.color : `${m.color}30` }}
                    />
                ))}
            </span>
            {effort} effort
        </span>
    );
}
