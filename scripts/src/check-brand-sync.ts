/**
 * Brand palette sync check.
 *
 * The Closa palette lives in lib/brand (hex, in src/index.ts, mirrored in
 * src/tokens.css). The web app's Tailwind theme in
 * artifacts/realestate-vault/src/index.css re-expresses those colours as
 * HSL triplets. This check fails if any of the three files diverge, so a
 * palette tweak in lib/brand can't silently leave the web app behind.
 *
 * Run: pnpm --filter @workspace/scripts run check:brand
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const read = (p: string) => readFileSync(path.join(root, p), "utf8");

const brandTs = read("lib/brand/src/index.ts");
const tokensCss = read("lib/brand/src/tokens.css");
const webCss = read("artifacts/realestate-vault/src/index.css");

let failures = 0;
const fail = (msg: string) => {
  failures++;
  console.error(`FAIL: ${msg}`);
};

// ---- Parse brand hex values from lib/brand/src/index.ts (colors block) ----
const colorsBlock = brandTs.match(/colors:\s*{([\s\S]*?)}/)?.[1];
if (!colorsBlock) throw new Error("Could not find colors block in lib/brand/src/index.ts");
const brandColors: Record<string, string> = {};
for (const m of colorsBlock.matchAll(/(\w+):\s*"(#[0-9a-fA-F]{6})"/g)) {
  brandColors[m[1]] = m[2].toLowerCase();
}
if (Object.keys(brandColors).length === 0) throw new Error("No colors parsed from lib/brand/src/index.ts");

// ---- Check tokens.css mirrors index.ts ----
const tokenToJs: Record<string, string> = {
  "--brand-ink": "ink",
  "--brand-charcoal": "charcoal",
  "--brand-graphite": "graphite",
  "--brand-offwhite": "offwhite",
  "--brand-paper": "paper",
  "--brand-accent": "accent",
  "--brand-accent-strong": "accentStrong",
  "--brand-muted-on-dark": "mutedOnDark",
  "--brand-muted-on-light": "mutedOnLight",
  "--brand-positive": "positive",
  "--brand-caution": "caution",
  "--brand-negative": "negative",
};
for (const [cssVar, jsKey] of Object.entries(tokenToJs)) {
  const m = tokensCss.match(new RegExp(`${cssVar}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) {
    fail(`tokens.css is missing ${cssVar}`);
    continue;
  }
  const expected = brandColors[jsKey];
  if (!expected) {
    fail(`lib/brand/src/index.ts is missing colors.${jsKey} (referenced by ${cssVar})`);
    continue;
  }
  if (m[1].toLowerCase() !== expected) {
    fail(`${cssVar} in tokens.css is ${m[1]} but colors.${jsKey} in index.ts is ${expected}`);
  }
}

// ---- Convert hex -> "H S% L%" (matches the web theme's triplet format) ----
function hexToHslTriplet(hex: string): string {
  const n = hex.replace("#", "");
  const r = parseInt(n.slice(0, 2), 16) / 255;
  const g = parseInt(n.slice(2, 4), 16) / 255;
  const b = parseInt(n.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

// ---- Check the web theme's HSL triplets derive from the brand palette ----
// Only variables that are direct expressions of a brand colour are checked;
// hand-tuned variants (sidebar background, input, destructive, etc.) are not.
const webVarToBrand: Record<string, string> = {
  "--background": "ink",
  "--foreground": "offwhite",
  "--border": "graphite",
  "--card": "charcoal",
  "--card-foreground": "offwhite",
  "--card-border": "graphite",
  "--sidebar-foreground": "offwhite",
  "--sidebar-primary": "accent",
  "--sidebar-primary-foreground": "ink",
  "--sidebar-accent": "graphite",
  "--sidebar-accent-foreground": "offwhite",
  "--sidebar-ring": "accent",
  "--popover": "charcoal",
  "--popover-foreground": "offwhite",
  "--popover-border": "graphite",
  "--primary": "accent",
  "--primary-foreground": "ink",
  "--secondary": "graphite",
  "--secondary-foreground": "offwhite",
  "--muted": "graphite",
  "--muted-foreground": "mutedOnDark",
  "--accent": "graphite",
  "--accent-foreground": "offwhite",
  "--ring": "accent",
  "--chart-1": "accent",
  "--chart-2": "mutedOnDark",
  "--chart-3": "caution",
  "--chart-5": "negative",
};
for (const [cssVar, jsKey] of Object.entries(webVarToBrand)) {
  const m = webCss.match(new RegExp(`${cssVar}:\\s*([\\d.]+ [\\d.]+% [\\d.]+%)`));
  if (!m) {
    fail(`realestate-vault index.css is missing ${cssVar} (expected an HSL triplet)`);
    continue;
  }
  const expected = hexToHslTriplet(brandColors[jsKey]);
  if (m[1] !== expected) {
    fail(
      `${cssVar} in realestate-vault index.css is "${m[1]}" but brand colors.${jsKey} ` +
        `(${brandColors[jsKey]}) converts to "${expected}"`,
    );
  }
}

if (failures > 0) {
  console.error(`\n${failures} brand sync problem(s). Update lib/brand and the web theme together.`);
  process.exit(1);
}
console.log("Brand palette is in sync across lib/brand and the web theme.");
