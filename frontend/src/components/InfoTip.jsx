import { useState } from "react";

/**
 * Compact (i) marker that reveals a short description on hover/click.
 * Use this everywhere a dashlet needs explaining.
 */
export default function InfoTip({ children, label = "What is this?" }) {
    const [open, setOpen] = useState(false);
    return (
        <span className="relative inline-flex items-center">
            <button
                type="button"
                onMouseEnter={() => setOpen(true)}
                onMouseLeave={() => setOpen(false)}
                onFocus={() => setOpen(true)}
                onBlur={() => setOpen(false)}
                onClick={(e) => {
                    e.preventDefault();
                    setOpen((o) => !o);
                }}
                aria-label={label}
                className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-mono leading-none text-[#a0a0ab] border border-[#a0a0ab]/40 hover:text-[#fafafa] hover:border-[#fafafa] transition-colors"
                data-testid="info-tip"
            >
                i
            </button>
            {open && (
                <span
                    role="tooltip"
                    className="absolute z-50 top-full mt-2 left-1/2 -translate-x-1/2 w-64 p-3 text-[11px] leading-relaxed text-[#fafafa] bg-[#0a0a0a] border border-[#a0a0ab]/30 normal-case tracking-normal font-body"
                    style={{ boxShadow: "0 8px 28px rgba(0,0,0,0.7)" }}
                >
                    {children}
                </span>
            )}
        </span>
    );
}
