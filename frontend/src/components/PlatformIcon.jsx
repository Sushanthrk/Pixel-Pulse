import { platformMeta, platformLogoUrl } from "../lib/platforms";

/**
 * Renders a platform logo via simpleicons.org CDN.
 * If hex is omitted we use the platform brand color.
 * Falls back to a coloured dot if the icon fails to load.
 */
export default function PlatformIcon({ platform, size = 18, color, className = "" }) {
    const m = platformMeta(platform);
    const tint = color || m.color;
    return (
        <span
            className={`inline-flex items-center justify-center shrink-0 ${className}`}
            style={{ width: size, height: size }}
        >
            <img
                src={platformLogoUrl(platform, tint)}
                width={size}
                height={size}
                alt={m.label}
                onError={(e) => {
                    e.currentTarget.style.display = "none";
                    e.currentTarget.nextSibling && (e.currentTarget.nextSibling.style.display = "inline-block");
                }}
                style={{ filter: "drop-shadow(0 0 6px rgba(0,0,0,0.45))" }}
            />
            <span
                style={{
                    display: "none",
                    width: size * 0.6,
                    height: size * 0.6,
                    borderRadius: 9999,
                    background: tint,
                }}
            />
        </span>
    );
}

export function PlatformBadge({ platform }) {
    const m = platformMeta(platform);
    return (
        <span
            className="inline-flex items-center gap-1.5 px-2 py-1 border font-mono uppercase tracking-widest text-[10px]"
            style={{
                borderColor: `${m.color}55`,
                color: m.color,
                background: `${m.color}10`,
            }}
        >
            <PlatformIcon platform={platform} size={12} />
            {m.label}
        </span>
    );
}
