import { useEffect, useRef, useState } from "react";

/**
 * Number that counts up smoothly to `value` over `duration` ms.
 * Used to make stat tiles feel alive without being kitschy.
 */
export default function AnimatedNumber({ value = 0, duration = 700, suffix = "", prefix = "" }) {
    const [n, setN] = useState(0);
    const start = useRef(0);
    const from = useRef(0);

    useEffect(() => {
        from.current = n;
        start.current = performance.now();
        let raf;
        const step = (t) => {
            const elapsed = t - start.current;
            const pct = Math.min(1, elapsed / duration);
            const eased = 1 - Math.pow(1 - pct, 3);
            setN(Math.round(from.current + (value - from.current) * eased));
            if (pct < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    return (
        <span className="tabular-nums">
            {prefix}
            {n.toLocaleString()}
            {suffix}
        </span>
    );
}
