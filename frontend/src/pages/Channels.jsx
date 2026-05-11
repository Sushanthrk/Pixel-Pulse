import { useEffect, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { useClientQuery } from "../contexts/AuthContext";
import { RecDot, HairlineDivider, Brackets, StatusBadge } from "../components/Pieces";
import { toast } from "sonner";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "../components/ui/select";
import PlatformIcon from "../components/PlatformIcon";
import { PLATFORM_META, PLATFORM_KEYS, platformMeta } from "../lib/platforms";

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

    const currentPlatform = platformMeta(form.platform);

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
                    <Select
                        value={form.platform}
                        onValueChange={(v) => setForm({ ...form, platform: v })}
                    >
                        <SelectTrigger
                            className="mt-2 mb-4 h-11 rounded-none bg-[#0a0a0a] border-[#a0a0ab]/30 hover:border-[#fafafa] text-[#fafafa] focus:ring-1 focus:ring-[#e6192b] focus:ring-offset-0"
                            data-testid="new-channel-platform"
                        >
                            <SelectValue placeholder="Pick a platform">
                                <span className="inline-flex items-center gap-2">
                                    <PlatformIcon platform={form.platform} size={16} />
                                    <span className="font-mono uppercase tracking-widest text-xs">
                                        {currentPlatform.label}
                                    </span>
                                </span>
                            </SelectValue>
                        </SelectTrigger>
                        <SelectContent className="bg-[#0a0a0a] border-[#a0a0ab]/30 rounded-none text-[#fafafa]">
                            {PLATFORM_KEYS.map((k) => {
                                const m = PLATFORM_META[k];
                                return (
                                    <SelectItem
                                        key={k}
                                        value={k}
                                        className="rounded-none focus:bg-[#fafafa]/10 focus:text-[#fafafa]"
                                    >
                                        <span className="inline-flex items-center gap-3">
                                            <PlatformIcon platform={k} size={16} />
                                            <span className="font-mono uppercase tracking-widest text-xs">
                                                {m.label}
                                            </span>
                                            <span
                                                className="ml-2 text-[9px] uppercase tracking-widest opacity-70"
                                                style={{ color: m.mode === "auto" ? "#62e296" : "#a0a0ab" }}
                                            >
                                                {m.mode === "auto" ? "Auto" : "Manual"}
                                            </span>
                                        </span>
                                    </SelectItem>
                                );
                            })}
                        </SelectContent>
                    </Select>

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
                        {currentPlatform.mode === "auto"
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
                    {channels.map((c) => {
                        const meta = platformMeta(c.platform);
                        return (
                        <div
                            key={c.id}
                            className="pg-card p-5 relative overflow-hidden"
                            data-testid={`channel-card-${c.id}`}
                            style={{ boxShadow: `inset 3px 0 0 0 ${meta.color}` }}
                        >
                            <Brackets />
                            <div
                                className="absolute top-0 right-0 w-24 h-24 opacity-[0.07] pointer-events-none"
                                style={{
                                    background: `radial-gradient(circle at top right, ${meta.color}, transparent 70%)`,
                                }}
                            />
                            <div className="flex items-start justify-between mb-3 relative">
                                <div className="flex items-center gap-3">
                                    <PlatformIcon platform={c.platform} size={28} />
                                    <div>
                                        <div className="font-display uppercase tracking-tight font-bold text-lg leading-none">
                                            {meta.label}
                                        </div>
                                        <div className="text-xs font-mono text-[#a0a0ab] uppercase tracking-widest mt-1 break-all">
                                            {c.handle || c.url}
                                        </div>
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
                    );})}
                </div>
            </div>
        </div>
    );
}
