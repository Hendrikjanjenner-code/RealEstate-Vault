import { brand } from "@workspace/brand";

/**
 * The Closa "Close Mark": an open C driven shut by a horizontal bar.
 * Inline SVG mirror of lib/brand/assets/icon.svg so it can inherit sizing
 * via className and render without an extra network request.
 */
export function BrandMark({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      aria-label={`${brand.name} mark`}
      role="img"
    >
      <path d="M 48.09 45.5 A 21 21 0 1 1 48.09 18.5" stroke={brand.colors.accent} strokeWidth="9" />
      <rect x="35" y="27.5" width="25" height="9" fill={brand.colors.accent} />
    </svg>
  );
}

/** Icon + wordmark lockup. */
export function BrandLogo({
  markClassName = "h-7 w-7",
  textClassName = "text-lg",
}: {
  markClassName?: string;
  textClassName?: string;
}) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <BrandMark className={markClassName} />
      <span
        className={`font-heading font-bold tracking-[0.18em] uppercase leading-none text-foreground ${textClassName}`}
      >
        {brand.shortName}
      </span>
    </span>
  );
}
