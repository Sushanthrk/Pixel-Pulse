// Platform metadata: brand colors + simpleicons CDN slugs.
// simpleicons.org gives us a free, recolorable SVG per brand via:
//   https://cdn.simpleicons.org/<slug>/<hex-no-hash>
// We keep colors in sync with the editorial palette so red stays the brand
// accent and platforms get a tinted glow rather than full-blown logo color.

export const PLATFORM_META = {
    youtube: { label: "YouTube", color: "#ff0033", slug: "youtube", mode: "auto" },
    medium: { label: "Medium", color: "#fafafa", slug: "medium", mode: "auto" },
    substack: { label: "Substack", color: "#ff6719", slug: "substack", mode: "auto" },
    blog: { label: "Blog / RSS", color: "#ff9a3c", slug: "rss", mode: "auto" },
    reddit: { label: "Reddit", color: "#ff4500", slug: "reddit", mode: "auto" },
    instagram: { label: "Instagram", color: "#e1306c", slug: "instagram", mode: "manual" },
    facebook: { label: "Facebook", color: "#1877f2", slug: "facebook", mode: "manual" },
    linkedin: { label: "LinkedIn (personal)", color: "#0a66c2", slug: "linkedin", mode: "manual" },
    linkedin_company: { label: "LinkedIn (company)", color: "#0a66c2", slug: "linkedin", mode: "manual" },
    pinterest: { label: "Pinterest", color: "#bd081c", slug: "pinterest", mode: "manual" },
    twitter: { label: "X / Twitter", color: "#fafafa", slug: "x", mode: "manual" },
    custom: { label: "Custom", color: "#a0a0ab", slug: "rss", mode: "manual" },
};

export const PLATFORM_KEYS = Object.keys(PLATFORM_META);

export function platformMeta(key) {
    return PLATFORM_META[key] || { label: key, color: "#a0a0ab", slug: "rss", mode: "manual" };
}

export function platformLogoUrl(key, hex) {
    const m = platformMeta(key);
    const color = (hex || m.color).replace("#", "");
    return `https://cdn.simpleicons.org/${m.slug}/${color}`;
}
