/**
 * Central brand configuration for the Closa master brand.
 *
 * This is the single source of truth for the platform's identity.
 * Web, mobile, and deck artifacts must consume name, taglines, colors,
 * typography, and asset paths from here so a future rebrand is a
 * one-package change.
 */

export const brand = {
  /** Full brand name as written in prose. */
  name: "Closa",
  /** Short name / wordmark form (uppercase). */
  shortName: "CLOSA",
  /** Legacy name being replaced; useful for migration sweeps. */
  legacyName: "RealEstate Vault",
  /** Primary tagline. */
  tagline: "From opportunity to close.",
  /** Secondary tagline / positioning line. */
  taglineSecondary: "The infrastructure behind private transactions.",
  /** One-sentence positioning statement. */
  positioning:
    "One trusted network where private opportunities become transactions.",
  /** First vertical descriptor (the master brand stays asset-agnostic). */
  vertical: "Closa Real Estate",

  /**
   * Asset paths within this package (import via
   * `@workspace/brand/assets/<file>` in bundlers that support package
   * exports, or copy into an artifact's public dir).
   */
  logo: {
    /** Icon + wordmark lockup for dark backgrounds. */
    primaryDark: "logo-primary-dark.svg",
    /** Icon + wordmark lockup for light backgrounds. */
    primaryLight: "logo-primary-light.svg",
    /** Wordmark only, for dark backgrounds. */
    wordmarkDark: "wordmark-dark.svg",
    /** Wordmark only, for light backgrounds. */
    wordmarkLight: "wordmark-light.svg",
  },
  icon: {
    /** The Close Mark in jade, transparent background. */
    accent: "icon.svg",
    /** Off-white mark for dark backgrounds. */
    dark: "icon-dark.svg",
    /** Ink mark for light backgrounds. */
    light: "icon-light.svg",
    /** Monochrome (currentColor) mark. */
    mono: "icon-mono.svg",
    /** Rounded-square app icon (ink background, jade mark). */
    appIcon: "app-icon.svg",
    /** Raster app icon, 1024x1024. */
    appIconPng: "app-icon-1024.png",
    /** Favicon source SVG. */
    favicon: "favicon.svg",
    /** Raster favicons. */
    faviconPng32: "favicon-32.png",
    faviconPng16: "favicon-16.png",
  },

  colors: {
    /** Near-black ink: page backgrounds (dark), text (light). */
    ink: "#0C0D0E",
    /** Deep charcoal: elevated surfaces on dark. */
    charcoal: "#17191C",
    /** Secondary charcoal surface / borders base. */
    graphite: "#22262B",
    /** Warm off-white: light backgrounds, text on dark. */
    offwhite: "#F6F4EF",
    /** Muted warm paper tone for secondary light surfaces. */
    paper: "#ECE9E1",
    /** The single distinctive brand accent. Use sparingly. */
    accent: "#14A87D",
    /** Accent on hover / pressed. */
    accentStrong: "#0E8A66",
    /** Muted text on dark surfaces. */
    mutedOnDark: "#9AA0A6",
    /** Muted text on light surfaces. */
    mutedOnLight: "#5D615E",
    /** Semantic: positive (reuses accent family). */
    positive: "#14A87D",
    /** Semantic: caution. */
    caution: "#C7923E",
    /** Semantic: negative. */
    negative: "#C24E4E",
  },

  typography: {
    /** Display / headings. */
    display: "Sora",
    /** UI, body, and financial data (use tabular numerals for tables). */
    body: "Inter",
    /** CSS font stacks. */
    displayStack: "'Sora', 'Inter', system-ui, sans-serif",
    bodyStack: "'Inter', system-ui, sans-serif",
    /** Google Fonts URL covering both families. */
    googleFontsUrl:
      "https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&family=Inter:wght@400;500;600;700&display=swap",
  },
} as const;

export type Brand = typeof brand;
