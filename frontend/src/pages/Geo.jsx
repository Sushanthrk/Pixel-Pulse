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
    const [form, setForm] = useState({ query: "", brand_terms: "" });
    const [scanning, setScanning] = useState(false);

    const load = async () => {
        try {
            const [q, r] = await Promise.all([
                api.get("/geo/queries", cq),
                api.get("/geo/results", cq),
            ]);
            setQueries(q.data);
            setResults(r.data);
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
        </div>
    );
}
