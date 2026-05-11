import { useEffect, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { useClientQuery } from "../contexts/AuthContext";
import { RecDot, HairlineDivider, Brackets } from "../components/Pieces";
import { toast } from "sonner";

export default function Plan() {
    const cq = useClientQuery();
    const [recs, setRecs] = useState([]);
    const [busy, setBusy] = useState(null);
    const [seed, setSeed] = useState("");

    const load = async () => {
        try {
            const { data } = await api.get("/recommendations", cq);
            setRecs(data);
        } catch (_) {}
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(cq)]);

    const runKeywords = async () => {
        setBusy("kw");
        try {
            await api.post(
                "/recommendations/keywords",
                { seed_text: seed, geography: "India" },
                cq,
            );
            toast.success("Keyword brief generated");
            load();
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail) || e.message);
        }
        setBusy(null);
    };

    const runPlan = async () => {
        setBusy("plan");
        try {
            await api.post("/recommendations/plan", {}, cq);
            toast.success("6-month plan generated");
            load();
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail) || e.message);
        }
        setBusy(null);
    };

    return (
        <div data-testid="plan-page">
            <div className="flex items-center gap-3 mb-2">
                <RecDot />
                <span className="font-mono-tech text-[10px] text-[#a0a0ab]">
                    // strategy / plan
                </span>
            </div>
            <h1 className="font-display uppercase tracking-tight font-black text-4xl sm:text-5xl mb-8">
                Strategy lab
            </h1>
            <HairlineDivider className="mb-6" />

            <div className="grid lg:grid-cols-2 gap-6 mb-10">
                <div className="pg-card p-6">
                    <Brackets />
                    <div className="font-mono-tech text-[10px] text-[#a0a0ab] mb-3">
                        // long-tail keyword brief · GPT-5.2
                    </div>
                    <h3 className="font-display uppercase tracking-tight font-bold text-xl mb-4">
                        Keyword recommendations
                    </h3>
                    <label className="pg-label">Seed text (optional — defaults to your latest posts)</label>
                    <textarea
                        rows={4}
                        value={seed}
                        onChange={(e) => setSeed(e.target.value)}
                        className="pg-input mt-2 mb-5"
                        placeholder="Describe your audience, topics, or paste a paragraph from a recent post."
                        data-testid="kw-seed"
                    />
                    <button
                        onClick={runKeywords}
                        disabled={busy === "kw"}
                        className="pg-btn-primary"
                        data-testid="gen-keywords-btn"
                    >
                        {busy === "kw" ? "Generating…" : "Generate 20 keywords"}
                    </button>
                </div>

                <div className="pg-card p-6">
                    <Brackets />
                    <div className="font-mono-tech text-[10px] text-[#a0a0ab] mb-3">
                        // 6-month plan · Gemini 3 Flash
                    </div>
                    <h3 className="font-display uppercase tracking-tight font-bold text-xl mb-4">
                        Content + outreach plan
                    </h3>
                    <p className="text-sm text-[#a0a0ab] leading-relaxed mb-5">
                        Uses your active channels and brand context. Plain text, month-by-month —
                        no PDF export per your spec.
                    </p>
                    <button
                        onClick={runPlan}
                        disabled={busy === "plan"}
                        className="pg-btn-primary"
                        data-testid="gen-plan-btn"
                    >
                        {busy === "plan" ? "Generating…" : "Generate 6-month plan"}
                    </button>
                </div>
            </div>

            <h2 className="font-display uppercase tracking-tight font-bold text-2xl mb-4">
                History
            </h2>
            <div className="space-y-5">
                {recs.length === 0 && (
                    <div className="text-[#a0a0ab] text-sm font-mono">
                        Nothing generated yet. Run a brief above.
                    </div>
                )}
                {recs.map((r) => (
                    <div key={r.id} className="pg-card p-6" data-testid={`rec-${r.id}`}>
                        <Brackets />
                        <div className="flex justify-between items-center mb-3">
                            <div className="font-mono-tech text-[10px] text-[#a0a0ab]">
                                {r.kind === "keywords" ? "// keyword brief" : "// 6-month plan"}
                            </div>
                            <span className="font-mono text-[10px] text-[#a0a0ab] uppercase tracking-widest">
                                {new Date(r.created_at).toLocaleString()}
                            </span>
                        </div>
                        <pre className="whitespace-pre-wrap text-sm font-body text-[#fafafa] leading-relaxed">
                            {r.payload}
                        </pre>
                    </div>
                ))}
            </div>
        </div>
    );
}
