import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { brand } from "@workspace/brand";
import { BrandMark, BrandLogo } from "@/components/logo";
import {
  useListDeals,
  getListDealsQueryKey,
  useListPublicDealTeasers,
  getListPublicDealTeasersQueryKey,
  useGetPublicPlatformStats,
  getGetPublicPlatformStatsQueryKey,
} from "@workspace/api-client-react";
import {
  ArrowRight,
  ShieldCheck,
  Lock,
  Users,
  FileText,
  BadgeCheck,
  LineChart,
  Handshake,
  Store,
  Star,
  FolderLock,
  Network,
} from "lucide-react";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-bold uppercase tracking-[0.25em] text-primary mb-3">{children}</div>
  );
}

function formatPrice(deal: { askingPrice?: number | null; priceMax?: number | null; currency: string }) {
  const fmt = (n: number) => (n >= 1_000_000 ? `€${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M` : `€${(n / 1000).toFixed(0)}K`);
  if (deal.askingPrice && deal.priceMax && deal.priceMax !== deal.askingPrice) return `${fmt(deal.askingPrice)} – ${fmt(deal.priceMax)}`;
  if (deal.askingPrice) return fmt(deal.askingPrice);
  return "On request";
}

function LiveOpportunities() {
  // Signed-in visitors get the full (per-viewer redacted) deals list; for
  // anonymous visitors that call 401s, so fall back to the public,
  // server-redacted teaser endpoint.
  const dealsQuery = useListDeals(undefined, {
    query: { retry: false, queryKey: getListDealsQueryKey() },
  });
  const deals = dealsQuery.data;
  const teasersQuery = useListPublicDealTeasers(
    { limit: 3 },
    {
      query: {
        retry: false,
        enabled: !deals?.length,
        queryKey: getListPublicDealTeasersQueryKey({ limit: 3 }),
      },
    },
  );
  const preview = (deals ?? []).slice(0, 3);
  const teaserPreview = deals?.length ? [] : (teasersQuery.data ?? []).slice(0, 3);
  // Static placeholder cards only when the public API is unreachable — a
  // successful-but-empty response gets a truthful empty state instead.
  const apiUnreachable = teasersQuery.isError && !deals;
  const emptyButHealthy =
    preview.length === 0 && teaserPreview.length === 0 && !apiUnreachable;

  return (
    <section id="opportunities" className="py-20 px-6 md:px-12 border-t border-border">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-end justify-between gap-6 flex-wrap mb-10">
          <div>
            <SectionLabel>Live on the platform</SectionLabel>
            <h2 className="font-heading text-3xl md:text-4xl font-bold">Private opportunities, previewed</h2>
            <p className="text-muted-foreground mt-2 max-w-xl">
              Full details stay behind NDA. What you see before access is granted is deliberately limited.
            </p>
          </div>
          <Button variant="outline" asChild className="border-border">
            <Link href="/demo/deals">View all opportunities <ArrowRight className="ml-2 w-4 h-4" /></Link>
          </Button>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          {preview.length > 0
            ? preview.map((deal) => (
                <Link key={deal.id} href={`/demo/deals/${deal.id}`} className="group block border border-border rounded-md bg-card p-5 hover:border-primary/40 transition-colors" data-testid={`card-opportunity-${deal.id}`}>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-primary flex items-center gap-1.5">
                      <Lock className="w-3 h-3" /> {deal.confidential ? "Confidential" : "Off-market"}
                    </span>
                    <span className="text-[11px] text-muted-foreground uppercase tracking-wider">{deal.assetClass}</span>
                  </div>
                  <h3 className="font-heading font-semibold text-lg leading-snug group-hover:text-primary transition-colors">{deal.title}</h3>
                  <dl className="mt-4 space-y-1.5 text-sm [font-feature-settings:'tnum'_1]">
                    <div className="flex justify-between"><dt className="text-muted-foreground">Location</dt><dd>{deal.region || deal.country}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted-foreground">Value</dt><dd>{formatPrice(deal)}</dd></div>
                    {deal.grossYield != null && (
                      <div className="flex justify-between"><dt className="text-muted-foreground">Gross yield</dt><dd>{deal.grossYield.toFixed(1)}%</dd></div>
                    )}
                  </dl>
                </Link>
              ))
            : teaserPreview.length > 0
            ? teaserPreview.map((t) => (
                <Link key={t.id} href={`/demo/deals/${t.id}`} className="group block border border-border rounded-md bg-card p-5 hover:border-primary/40 transition-colors" data-testid={`card-opportunity-${t.id}`}>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-primary flex items-center gap-1.5">
                      <Lock className="w-3 h-3" /> {t.confidential ? "Confidential" : "Off-market"}
                    </span>
                    <span className="text-[11px] text-muted-foreground uppercase tracking-wider">{t.assetClass}</span>
                  </div>
                  <h3 className="font-heading font-semibold text-lg leading-snug group-hover:text-primary transition-colors">{t.title}</h3>
                  <dl className="mt-4 space-y-1.5 text-sm [font-feature-settings:'tnum'_1]">
                    <div className="flex justify-between"><dt className="text-muted-foreground">Location</dt><dd>{t.region || t.country}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted-foreground">Value</dt><dd>{t.valueBand}</dd></div>
                    {t.grossYield != null && (
                      <div className="flex justify-between"><dt className="text-muted-foreground">Gross yield</dt><dd>{t.grossYield.toFixed(1)}%</dd></div>
                    )}
                  </dl>
                  <p className="text-xs text-muted-foreground mt-4">Sign in to request access.</p>
                </Link>
              ))
            : emptyButHealthy
            ? [
                <div key="empty" className="md:col-span-3 border border-border rounded-md bg-card p-8 text-center" data-testid="text-no-opportunities">
                  <Lock className="w-5 h-5 text-primary mx-auto mb-3" />
                  <p className="font-heading font-semibold">No live opportunities right now</p>
                  <p className="text-sm text-muted-foreground mt-1">New off-market listings appear here as brokers publish them.</p>
                </div>,
              ]
            : [
                { title: "Core logistics portfolio", meta: "Netherlands · Logistics", value: "€40M+" },
                { title: "Prime city-centre hotel", meta: "Amsterdam region · Hospitality", value: "€20–25M" },
                { title: "Grade-A office asset", meta: "Western Europe · Office", value: "On request" },
              ].map((d) => (
                <div key={d.title} className="border border-border rounded-md bg-card p-5">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-primary flex items-center gap-1.5 mb-4">
                    <Lock className="w-3 h-3" /> Confidential
                  </div>
                  <h3 className="font-heading font-semibold text-lg leading-snug">{d.title}</h3>
                  <p className="text-sm text-muted-foreground mt-2">{d.meta}</p>
                  <p className="text-sm mt-1 [font-feature-settings:'tnum'_1]">{d.value}</p>
                  <p className="text-xs text-muted-foreground mt-4">Sign in to request access.</p>
                </div>
              ))}
        </div>
      </div>
    </section>
  );
}

function formatPipelineValue(eur: number): string {
  if (eur <= 0) return "€0";
  if (eur >= 1_000_000_000) return `€${(eur / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B+`;
  if (eur >= 1_000_000) return `€${Math.round(eur / 1_000_000)}M+`;
  return `€${Math.round(eur / 1000)}K+`;
}

function PlatformStats() {
  // Live aggregate stats from the public endpoint; falls back to static
  // figures if the API is unreachable.
  const { data: stats } = useGetPublicPlatformStats({
    query: { retry: false, queryKey: getGetPublicPlatformStatsQueryKey() },
  });

  // Real numbers whenever the public API responds (including zeros); static
  // figures only when it is unreachable.
  const tiles =
    stats
      ? [
          { value: formatPipelineValue(stats.pipelineValue), label: "Pipeline value" },
          { value: `${stats.liveDeals}`, label: "Live opportunities" },
          { value: `${stats.verifiedProfessionals}+`, label: "Verified professionals" },
          { value: "100%", label: "Off-market" },
        ]
      : [
          { value: "€4.2B+", label: "Pipeline value" },
          { value: "850+", label: "Verified professionals" },
          { value: "100%", label: "Off-market" },
          { value: "24/7", label: "Secure access" },
        ];

  return (
    <section className="py-16 px-6 md:px-12 border-t border-border">
      <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center [font-feature-settings:'tnum'_1]">
        {tiles.map((s) => (
          <div key={s.label} data-testid={`stat-${s.label.toLowerCase().replace(/\s+/g, "-")}`}>
            <div className="font-heading text-3xl md:text-4xl font-bold">{s.value}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mt-2">{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

const capabilities = [
  {
    icon: LineChart,
    title: "Deal intelligence",
    body: "Every listing carries structured fundamentals — yield, occupancy, area, tenancy — so counterparties evaluate on numbers, not brochures.",
  },
  {
    icon: FolderLock,
    title: "Secure data rooms",
    body: "Documents live in permissioned data rooms behind executed NDAs, with granular access control per counterparty.",
  },
  {
    icon: Handshake,
    title: "Deal teams",
    body: "Brokers, principals and advisors work a transaction together — messaging, requests and documents in one thread of record.",
  },
  {
    icon: Store,
    title: "Professional marketplace",
    body: "Owners find mandated brokers; investors publish acquisition mandates and get matched to qualifying assets automatically.",
  },
  {
    icon: Star,
    title: "Verified reputation",
    body: "Track records, closed transactions and response behaviour build a reputation that follows every professional on the network.",
  },
  {
    icon: Network,
    title: "Trusted network",
    body: "Every participant is verified before they can transact. No anonymous browsing of sensitive material — ever.",
  },
];

const steps = [
  { n: "01", title: "Discover", body: "Browse redacted teasers of off-market opportunities matched to your mandate." },
  { n: "02", title: "Request access", body: "Request access; the listing broker reviews who you are before anything is shared." },
  { n: "03", title: "Execute the NDA", body: "Sign digitally on-platform. The signed terms are preserved with the deal record." },
  { n: "04", title: "Transact", body: "Enter the data room, run diligence with your deal team, and take the transaction to close." },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground dark selection:bg-primary/30 font-sans">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 md:px-12 h-16 bg-background/85 backdrop-blur-md border-b border-border">
        <BrandLogo markClassName="h-6 w-6" textClassName="text-sm" />
        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground mr-4">
            <a href="#opportunities" className="hover:text-foreground transition-colors">Opportunities</a>
            <a href="#network" className="hover:text-foreground transition-colors">Network</a>
            <a href="#how" className="hover:text-foreground transition-colors">How it works</a>
          </div>
          <Button variant="ghost" className="hidden md:flex" asChild>
            <Link href="/demo">Sign In</Link>
          </Button>
          <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold px-5" data-testid="button-nav-explore">
            <Link href="/demo">Explore Opportunities</Link>
          </Button>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-36 pb-20 md:pt-44 md:pb-28 px-6 md:px-12 overflow-hidden">
        <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top,rgba(20,168,125,0.08),transparent_55%)]" />
        <div className="relative z-10 max-w-4xl mx-auto text-center space-y-7">
          <BrandMark className="w-14 h-14 mx-auto" />
          <div className="text-sm font-bold uppercase tracking-[0.35em] text-foreground/80">{brand.shortName}</div>
          <h1 className="font-heading text-4xl md:text-6xl font-bold tracking-tight leading-[1.08]">
            Where private opportunities<br className="hidden md:block" /> become transactions.
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            {brand.name} is one trusted network of verified professionals — private deal flow, secure data rooms, and execution from first look to close.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
            <Button size="lg" asChild className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold px-8 h-12 w-full sm:w-auto" data-testid="button-hero-explore">
              <Link href="/demo">Explore Opportunities <ArrowRight className="ml-2 w-4 h-4" /></Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="border-border px-8 h-12 w-full sm:w-auto" data-testid="button-hero-join">
              <Link href="/demo">Join the Network</Link>
            </Button>
          </div>
          <div className="flex items-center justify-center gap-6 pt-6 text-xs text-muted-foreground uppercase tracking-wider flex-wrap">
            <span className="flex items-center gap-1.5"><Lock className="w-3.5 h-3.5 text-primary" /> Off-market only</span>
            <span className="flex items-center gap-1.5"><BadgeCheck className="w-3.5 h-3.5 text-primary" /> Verified participants</span>
            <span className="flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-primary" /> NDA-gated data rooms</span>
          </div>
        </div>
      </section>

      {/* Live opportunity preview */}
      <LiveOpportunities />

      {/* Trusted professional network */}
      <section id="network" className="py-20 px-6 md:px-12 border-t border-border bg-card/40">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          <div>
            <SectionLabel>The network</SectionLabel>
            <h2 className="font-heading text-3xl md:text-4xl font-bold leading-tight">A network you can trust with your deal.</h2>
            <p className="text-muted-foreground mt-4 leading-relaxed">
              Every broker, investor and owner on {brand.name} is verified before they can see a single sensitive document.
              Mandates are real, counterparties are accountable, and reputation is earned on closed transactions.
            </p>
            <div className="mt-8">
              <Button variant="outline" asChild className="border-border">
                <Link href="/demo/brokers">Meet the professionals <ArrowRight className="ml-2 w-4 h-4" /></Link>
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              { icon: BadgeCheck, label: "KYC-verified participants" },
              { icon: FileText, label: "Mandated buy-side capital" },
              { icon: Users, label: "Accountable counterparties" },
              { icon: Star, label: "Track-record based reputation" },
            ].map((f) => (
              <div key={f.label} className="border border-border rounded-md bg-card p-5 flex flex-col gap-3">
                <f.icon className="w-5 h-5 text-primary" />
                <span className="text-sm font-medium leading-snug">{f.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How transactions work */}
      <section id="how" className="py-20 px-6 md:px-12 border-t border-border">
        <div className="max-w-6xl mx-auto">
          <SectionLabel>How it works</SectionLabel>
          <h2 className="font-heading text-3xl md:text-4xl font-bold mb-12">From first look to close, in four steps.</h2>
          <div className="grid md:grid-cols-4 gap-px bg-border border border-border rounded-md overflow-hidden">
            {steps.map((s) => (
              <div key={s.n} className="bg-card p-6">
                <div className="text-primary font-heading font-bold text-sm [font-feature-settings:'tnum'_1]">{s.n}</div>
                <h3 className="font-heading font-semibold text-lg mt-3">{s.title}</h3>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Capabilities: intelligence, data rooms, teams, marketplace, reputation, network */}
      <section className="py-20 px-6 md:px-12 border-t border-border bg-card/40">
        <div className="max-w-6xl mx-auto">
          <SectionLabel>The platform</SectionLabel>
          <h2 className="font-heading text-3xl md:text-4xl font-bold mb-12">Everything a private transaction needs.</h2>
          <div className="grid md:grid-cols-3 gap-4">
            {capabilities.map((c) => (
              <div key={c.title} className="border border-border rounded-md bg-card p-6">
                <c.icon className="w-5 h-5 text-primary mb-4" />
                <h3 className="font-heading font-semibold text-lg">{c.title}</h3>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Platform statistics */}
      <PlatformStats />

      {/* Final CTA */}
      <section className="py-24 px-6 md:px-12 border-t border-border relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(20,168,125,0.1),transparent_55%)]" />
        <div className="relative z-10 max-w-2xl mx-auto text-center space-y-6">
          <BrandMark className="w-12 h-12 mx-auto" />
          <h2 className="font-heading text-3xl md:text-5xl font-bold">{brand.tagline}</h2>
          <p className="text-lg text-muted-foreground">
            Join the network where serious professionals take private opportunities to close.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
            <Button size="lg" asChild className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold px-8 h-12" data-testid="button-cta-explore">
              <Link href="/demo">Explore Opportunities <ArrowRight className="ml-2 w-4 h-4" /></Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="border-border px-8 h-12" data-testid="button-cta-join">
              <Link href="/demo">Join the Network</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 px-6 md:px-12 border-t border-border">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4 text-center md:text-left">
          <BrandLogo markClassName="h-5 w-5" textClassName="text-xs" />
          <div className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} {brand.name}. {brand.taglineSecondary}
          </div>
          <div className="flex gap-6 text-sm text-muted-foreground">
            <a href="#" className="hover:text-primary transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-primary transition-colors">Terms of Service</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
