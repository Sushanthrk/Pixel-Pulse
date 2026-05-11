import { useEffect, useState } from "react";
import { api, formatApiError, PLATFORMS, platformLabel } from "../lib/api";
import { useClientQuery } from "../contexts/AuthContext";
import { RecDot, HairlineDivider, Brackets, StatusBadge } from "../components/Pieces";
import { toast } from "sonner";

export default function Channels() {
    const cq = useClientQuery();
    const [channels, setChannels] = useState([]);
    const [form, setForm] = useState({ platform: "youtube", handle: "", url: "" });
    const [busy, setBusy] = useState(null);

    const load = async () => {
        try {
            const { data } = await api.get("/channels", cq);
            setChannels(data);
        } catch (e) {
            // silently ignore until workspace selected
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(cq)]);

    const add = async (e) => {
        e.preventDefault();
        try {
            await api.post("/channels", form, cq);
            toast.success("Channel added");
            setForm({ platform: "youtube", handle: "", url: "" });
            load();
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail) || e.message);
        }
    };

    const sync = async (id) => {
        setBusy(id);
        try {
            const { data } = await api.post(`/sync/channel/${id}`);
            if (data.is_real) toast.success(`Synced ${data.inserted} real posts`);
            else toast(`Inserted ${data.inserted} mock posts — add a real API key to switch to live.`);
            load();
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail) || e.message);
        }
        setBusy(null);
    };

    const remove = async (id) => {
        if (!window.confirm("Remove this channel and its posts?")) return;
        try {
            await api.delete(`/channels/${id}`);
            load();
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail) || e.message);
        }
    };

    const currentPlatform = PLATFORMS.find((p) => p.key === form.platform);

    return (
        <div data-testid="channels-page">
            <div className="flex items-center gap-3 mb-2">
                <RecDot />
                <span className="font-mono-tech text-[10px] text-[#a0a0ab]">
                    // setup / channels
                </span>
            </div>
            <h1 className="font-display uppercase tracking-tight font-black text-4xl sm:text-5xl mb-8">
                Channel rig
            </h1>
            <HairlineDivider className="mb-6" />

            <div className="grid lg:grid-cols-3 gap-6 mb-10">
                <form
                    onSubmit={add}
                    className="pg-card p-6 lg:col-span-1"
                    data-testid="add-channel-form"
                >
                    <Brackets />
                    <div className="font-mono-tech text-[10px] text-[#a0a0ab] mb-3">
                        // add channel
                    </div>
                    <h3 className="font-display uppercase tracking-tight font-bold text-xl mb-5">
                        Wire a platform
                    </h3>
                    <label className="pg-label">Platform</label>
                    <select
                        value={form.platform}
                        onChange={(e) => setForm({ ...form, platform: e.target.value })}
                        className="pg-input mt-2 mb-4"
                        data-testid="new-channel-platform"
                    >
                        {PLATFORMS.map((p) => (
                            <option key={p.key} value={p.key}>
                                {p.label} {p.mode === "auto" ? "· Auto" : "· Manual"}
                            </option>
                        ))}
                    </select>

                    <label className="pg-label">
                        {form.platform === "reddit"
                            ? "Subreddit (e.g. r/marketing) or u/username"
                            : "Handle / username"}
                    </label>
                    <input
                        value={form.handle}
                        onChange={(e) => setForm({ ...form, handle: e.target.value })}
                        className="pg-input mt-2 mb-4"
                        placeholder={form.platform === "youtube" ? "@yourchannel or UC...id" : "e.g. yourbrand"}
                        data-testid="new-channel-handle"
                    />

                    <label className="pg-label">URL (RSS feed for blog/Medium/Substack)</label>
                    <input
                        value={form.url}
                        onChange={(e) => setForm({ ...form, url: e.target.value })}
                        className="pg-input mt-2 mb-5"
                        placeholder="https://…"
                        data-testid="new-channel-url"
                    />

                    <div className="text-[10px] font-mono text-[#a0a0ab] mb-4 uppercase tracking-widest">
                        {currentPlatform?.mode === "auto"
                            ? "FREE auto-sync available"
                            : "Manual entry only — paste post URL + numbers"}
                    </div>
                    <button type="submit" className="pg-btn-primary w-full justify-center">
                        Add channel
                    </button>
                </form>

                <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-5">
                    {channels.length === 0 && (
                        <div className="text-[#a0a0ab] text-sm font-mono col-span-full">
                            No channels yet — add one to the left.
                        </div>
                    )}
                    {channels.map((c) => (
                        <div
                            key={c.id}
                            className="pg-card p-5"
                            data-testid={`channel-card-${c.id}`}
                        >
                            <Brackets />
                            <div className="flex items-start justify-between mb-3">
                                <div>
                                    <div className="font-display uppercase tracking-tight font-bold text-lg">
                                        {platformLabel(c.platform)}
                                    </div>
                                    <div className="text-xs font-mono text-[#a0a0ab] uppercase tracking-widest mt-1 break-all">
                                        {c.handle || c.url}
                                    </div>
                                </div>
                                <StatusBadge status={c.status} sync_mode={c.sync_mode} />
                            </div>
                            <div className="text-[10px] font-mono text-[#a0a0ab] uppercase tracking-widest mb-4">
                                Last sync: {c.last_sync ? new Date(c.last_sync).toLocaleString() : "never"}
                            </div>
                            <div className="flex gap-2 flex-wrap">
                                {c.sync_mode === "auto" && (
                                    <button
                                        onClick={() => sync(c.id)}
                                        disabled={busy === c.id}
                                        className="pg-btn-secondary !text-[10px] !px-4 !py-2"
                                        data-testid={`sync-${c.id}`}
                                    >
                                        {busy === c.id ? "Syncing…" : "Sync now"}
                                    </button>
                                )}
                                <button
                                    onClick={() => remove(c.id)}
                                    className="pg-btn-ghost"
                                    data-testid={`remove-${c.id}`}
                                >
                                    Remove
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
