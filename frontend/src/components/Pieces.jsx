import { useEffect, useState } from "react";

export function RecDot({ label = "REC" }) {
    return (
        <span className="inline-flex items-center gap-2">
            <span className="rec-dot" />
            <span className="font-mono-tech text-[10px] text-[#a0a0ab]">{label}</span>
        </span>
    );
}

export function Timecode() {
    const [now, setNow] = useState(new Date());
    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(id);
    }, []);
    const fmt = (n, d = 2) => String(n).padStart(d, "0");
    const tc = `${fmt(now.getUTCHours())}:${fmt(now.getUTCMinutes())}:${fmt(
        now.getUTCSeconds(),
    )}:${fmt(Math.floor(now.getUTCMilliseconds() / 10))}`;
    return (
        <span
            className="font-mono-tech text-[10px] text-[#a0a0ab] tabular-nums"
            data-testid="live-timecode"
        >
            UTC {tc}
        </span>
    );
}

export function HairlineDivider({ className = "" }) {
    return <div className={`hairline ${className}`} />;
}

export function Brackets() {
    return (
        <>
            <span className="bracket tl" />
            <span className="bracket br" />
        </>
    );
}

export function StatusBadge({ status, sync_mode }) {
    if (sync_mode === "auto" && status === "connected")
        return <span className="pg-badge connected">● Auto-synced</span>;
    if (status === "mocked")
        return <span className="pg-badge mock">● Mocked sample</span>;
    if (sync_mode === "auto")
        return <span className="pg-badge auto">● Auto · Pending</span>;
    return <span className="pg-badge">● Manual entry</span>;
}
