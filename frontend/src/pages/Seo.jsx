import { useEffect, useMemo, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { useClientQuery } from "../contexts/AuthContext";
import { RecDot, HairlineDivider, Brackets } from "../components/Pieces";
import { toast } from "sonner";
import {
    LineChart,
    Line,
    ResponsiveContainer,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
} from "recharts";

export default function Seo() {
    const cq = useClientQuery();
    const [keywords, setKeywords] = useState([]);
    const [ranks, setRanks] = useState([]);
    const [form, setForm] = useState({ keyword: "", domain: "" });
    const [rankForm, setRankForm] = useState({ keyword_id: "", rank: "", note: "" });

    const load = async () => {
        try {
            const [k, r] = await Promise.all([
                api.get("/seo/keywords", cq),
                api.get("/seo/ranks", cq),
            ]);
            setKeywords(k.data);
            setRanks(r.data);
        } catch (_) {}
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(cq)]);

    const addKeyword = async (e) => {
        e.preventDefault();
        try {
            await api.post("/seo/keywords", form, cq);
            setForm({ keyword: "", domain: "" });
            toast.success("Keyword added");
            load();
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail) || e.message);
        }
    };

    const removeKeyword = async (id) => {
        try {
            await api.delete(`/seo/keywords/${id}`);
            load();
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail) || e.message);
        }
    };

    const recordRank = async (e) => {
        e.preventDefault();
        try {
            await api.post(`/seo/keywords/${rankForm.keyword_id}/manual-rank`, {
                keyword_id: rankForm.keyword_id,
                rank: +rankForm.rank || 0,
                note: rankForm.note,
            });
            setRankForm({ keyword_id: "", rank: "", note: "" });
            toast.success("Rank recorded");
            load();
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail) || e.message);
        }
    };

    const autoRank = async (id) => {
        try {
            await api.post(`/seo/keywords/${id}/auto-rank`);
            toast.success("Auto rank recorded");
            load();
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail) || e.message);
        }
    };

    const chartData = useMemo(() => {
        // map per keyword
        const by = {};
        keywords.forEach((k) => (by[k.id] = []));
        ranks.forEach((r) => {
            if (by[r.keyword_id]) by[r.keyword_id].push(r);
        });
        // sort and produce series
        Object.keys(by).forEach((k) =>
            by[k].sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at)),
        );
        return by;
    }, [ranks, keywords]);

    return (
        <div data-testid="seo-page">
            <div className="flex items-center gap-3 mb-2">
                <RecDot />
                <span className="font-mono-tech text-[10px] text-[#a0a0ab]">
                    // organic search · keyword ranking
                </span>
            </div>
            <h1 className="font-display uppercase tracking-tight font-black text-4xl sm:text-5xl mb-8">
                Search rank
            </h1>
            <HairlineDivider className="mb-6" />

            <div className="grid lg:grid-cols-3 gap-6 mb-10">
                <form onSubmit={addKeyword} className="pg-card p-6">
                    <Brackets />
                    <div className="font-mono-tech text-[10px] text-[#a0a0ab] mb-3">
                        // add keyword
                    </div>
                    <h3 className="font-display uppercase tracking-tight font-bold text-xl mb-4">
                        Track a keyword
                    </h3>
                    <label className="pg-label">Keyword</label>
                    <input
                        required
                        value={form.keyword}
                        onChange={(e) => setForm({ ...form, keyword: e.target.value })}
                        className="pg-input mt-2 mb-4"
                        data-testid="seo-keyword-input"
                    />
                    <label className="pg-label">Your domain</label>
                    <input
                        value={form.domain}
                        onChange={(e) => setForm({ ...form, domain: e.target.value })}
                        className="pg-input mt-2 mb-5"
                        placeholder="pixelgrok.com"
                    />
                    <button type="submit" className="pg-btn-primary w-full justify-center">
                        Add
                    </button>
                </form>

                <form onSubmit={recordRank} className="pg-card p-6">
                    <Brackets />
                    <div className="font-mono-tech text-[10px] text-[#a0a0ab] mb-3">
                        // manual rank entry
                    </div>
                    <h3 className="font-display uppercase tracking-tight font-bold text-xl mb-4">
                        Log a position
                    </h3>
                    <label className="pg-label">Keyword</label>
                    <select
                        required
                        value={rankForm.keyword_id}
                        onChange={(e) => setRankForm({ ...rankForm, keyword_id: e.target.value })}
                        className="pg-input mt-2 mb-4"
                    >
                        <option value="">— pick —</option>
                        {keywords.map((k) => (
                            <option key={k.id} value={k.id}>
                                {k.keyword}
                            </option>
                        ))}
                    </select>
                    <label className="pg-label">Rank</label>
                    <input
                        required
                        type="number"
                        min="1"
                        max="100"
                        value={rankForm.rank}
                        onChange={(e) => setRankForm({ ...rankForm, rank: e.target.value })}
                        className="pg-input mt-2 mb-4"
                        data-testid="seo-rank-input"
                    />
                    <label className="pg-label">Note</label>
                    <input
                        value={rankForm.note}
                        onChange={(e) => setRankForm({ ...rankForm, note: e.target.value })}
                        className="pg-input mt-2 mb-5"
                    />
                    <button type="submit" className="pg-btn-primary w-full justify-center">
                        Record
                    </button>
                </form>

                <div className="pg-card p-6">
                    <Brackets />
                    <div className="font-mono-tech text-[10px] text-[#a0a0ab] mb-3">
                        // mode
                    </div>
                    <h3 className="font-display uppercase tracking-tight font-bold text-xl mb-4">
                        Tracking source
                    </h3>
                    <p className="text-sm text-[#a0a0ab] leading-relaxed mb-4">
                        Default to manual entry. If you've set
                        <span className="font-mono"> GOOGLE_CSE_ID</span> and
                        <span className="font-mono"> GOOGLE_CSE_KEY</span> in <code>.env</code>,
                        click <strong>Auto rank</strong> next to a keyword to pull live position
                        from Google Programmable Search (free 100 q/day).
                    </p>
                    <span className="pg-badge auto">FREE · 100/day quota</span>
                </div>
            </div>

            <div className="space-y-5">
                {keywords.length === 0 && (
                    <div className="text-[#a0a0ab] text-sm font-mono">No keywords tracked yet.</div>
                )}
                {keywords.map((k) => {
                    const data = (chartData[k.id] || []).map((r) => ({
                        date: new Date(r.recorded_at).toISOString().slice(5, 10),
                        rank: r.rank,
                    }));
                    return (
                        <div
                            key={k.id}
                            className="pg-card p-6"
                            data-testid={`keyword-${k.id}`}
                        >
                            <Brackets />
                            <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                                <div>
                                    <div className="font-display uppercase tracking-tight font-bold text-xl">
                                        {k.keyword}
                                    </div>
                                    <div className="text-[10px] font-mono uppercase tracking-widest text-[#a0a0ab] mt-1">
                                        {k.domain || "no domain"}
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => autoRank(k.id)}
                                        className="pg-btn-secondary !text-[10px] !px-4 !py-2"
                                    >
                                        Auto rank
                                    </button>
                                    <button onClick={() => removeKeyword(k.id)} className="pg-btn-ghost">
                                        Remove
                                    </button>
                                </div>
                            </div>
                            <div className="h-44">
                                {data.length === 0 ? (
                                    <div className="text-[#a0a0ab] text-sm h-full flex items-center font-mono">
                                        No rank entries yet.
                                    </div>
                                ) : (
                                    <ResponsiveContainer>
                                        <LineChart data={data}>
                                            <CartesianGrid stroke="rgba(160,160,171,0.1)" />
                                            <XAxis dataKey="date" stroke="#a0a0ab" fontSize={11} tickLine={false} />
                                            <YAxis
                                                stroke="#a0a0ab"
                                                fontSize={11}
                                                tickLine={false}
                                                axisLine={false}
                                                reversed
                                                domain={[1, 100]}
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
                                                dataKey="rank"
                                                stroke="#e6192b"
                                                strokeWidth={2}
                                                dot={{ fill: "#e6192b", r: 3 }}
                                            />
                                        </LineChart>
                                    </ResponsiveContainer>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
