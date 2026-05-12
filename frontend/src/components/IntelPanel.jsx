import { HairlineDivider } from "./Pieces";

/**
 * Renders the LLM-extracted public-page intelligence for a channel or competitor.
 * Same shape comes from /api/channels/{id}/analyze and /api/competitors/{id}/analyze.
 */
export default function IntelPanel({ intel }) {
    if (!intel) return null;
    const limited = intel.limited_data || (intel.fail_reason && !intel.summary);
    return (
        <div className="mt-4 border border-[#a0a0ab]/20 bg-[#0a0a0a]/60 p-4 relative" data-testid="intel-panel">
            <div className="flex items-center justify-between mb-2">
                <div className="font-mono-tech text-[10px] text-[#a0a0ab] uppercase tracking-widest inline-flex items-center gap-2">
                    ✦ Public-page intelligence
                    {limited && (
                        <span className="px-1.5 py-[1px] border border-[#f5c84b]/40 bg-[#f5c84b]/10 text-[#f5c84b] text-[8px]">
                            limited data
                        </span>
                    )}
                </div>
                {intel.analyzed_at && (
                    <span className="font-mono text-[9px] text-[#a0a0ab]/70 uppercase tracking-widest">
                        {new Date(intel.analyzed_at).toLocaleString()}
                    </span>
                )}
            </div>

            {intel.summary && (
                <p className="text-sm text-[#fafafa] leading-relaxed mb-3">{intel.summary}</p>
            )}

            {intel.positioning && (
                <div className="mb-3">
                    <div className="font-mono text-[9px] text-[#a0a0ab] uppercase tracking-widest mb-1">
                        Positioning
                    </div>
                    <div className="text-sm text-[#fafafa]/90 leading-relaxed italic">
                        “{intel.positioning}”
                    </div>
                </div>
            )}

            {(intel.themes || []).length > 0 && (
                <div className="mb-3">
                    <div className="font-mono text-[9px] text-[#a0a0ab] uppercase tracking-widest mb-2">
                        Themes
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {intel.themes.map((t, i) => (
                            <span
                                key={i}
                                className="px-2 py-[2px] border border-[#a0a0ab]/30 text-[10px] font-mono uppercase tracking-widest text-[#a0a0ab]"
                            >
                                {t}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {(intel.recent_signals || []).length > 0 && (
                <div className="mb-3">
                    <div className="font-mono text-[9px] text-[#a0a0ab] uppercase tracking-widest mb-2">
                        Recent signals
                    </div>
                    <ul className="space-y-1">
                        {intel.recent_signals.map((s, i) => (
                            <li key={i} className="text-xs text-[#fafafa]/90 leading-relaxed pl-3 relative">
                                <span className="absolute left-0 top-1.5 w-1.5 h-1.5 bg-[#e6192b] rounded-full" />
                                {s}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <div className="flex flex-wrap gap-3 mt-2">
                {intel.tone && (
                    <Pill label="Tone" value={intel.tone} color="#62e296" />
                )}
                {(intel.ctas || []).length > 0 && (
                    <Pill label="CTAs" value={intel.ctas.join(" · ")} color="#f5c84b" />
                )}
            </div>

            {limited && !intel.summary && (
                <>
                    <HairlineDivider className="my-3" />
                    <div className="text-xs text-[#a0a0ab] leading-relaxed">
                        This platform gates non-logged-in access (LinkedIn / Instagram / Facebook
                        / X all do this). We still cached whatever OpenGraph metadata is exposed —
                        for the actual posts you'll need to enter them manually from the Analytics
                        tab, or this card stays in metadata-only mode.
                    </div>
                </>
            )}
        </div>
    );
}

function Pill({ label, value, color }) {
    return (
        <span
            className="inline-flex items-center gap-1.5 px-2 py-[2px] text-[10px] font-mono uppercase tracking-widest"
            style={{
                borderColor: `${color}55`,
                color,
                background: `${color}10`,
                border: `1px solid ${color}55`,
            }}
        >
            <span className="text-[#a0a0ab]">{label}:</span>
            <span style={{ color: "#fafafa" }}>{value}</span>
        </span>
    );
}
