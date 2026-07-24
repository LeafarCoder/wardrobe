import { brandMarkFor } from "./brand-icons.js";

export function BrandIcon({ brand, size = 16, className = "" }) {
  if (!brand?.trim()) return null;
  const mark = brandMarkFor(brand);
  const classes = ["brand-icon", mark.type === "wordmark" ? "is-wordmark" : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      className={classes}
      style={{ "--brand-icon-color": `#${mark.hex}`, width: size, height: size }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" focusable="false">
        {mark.type === "path" ? (
          <path d={mark.path} />
        ) : (
          <>
            <rect x="1" y="1" width="22" height="22" rx="4" />
            <text
              x="12"
              y="12.5"
              dominantBaseline="middle"
              textAnchor="middle"
              textLength={mark.glyph.length > 2 ? 14 : undefined}
              lengthAdjust={mark.glyph.length > 2 ? "spacingAndGlyphs" : undefined}
            >
              {mark.glyph}
            </text>
          </>
        )}
      </svg>
    </span>
  );
}
