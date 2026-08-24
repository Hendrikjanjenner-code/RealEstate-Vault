import { useMemo, useState } from "react";
import {
  useListProfessionals,
  useListProfessionalCategories,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import {
  BadgeCheck,
  MapPin,
  Star,
  Building2,
  Clock,
  Globe2,
} from "lucide-react";
import { Link } from "wouter";
import { VerificationBadge } from "@/components/verification-badge";
import { TrustBadge } from "@/components/trust-badge";

export default function Professionals() {
  const [category, setCategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const { data: categories } = useListProfessionalCategories();
  const { data: professionals, isLoading } = useListProfessionals(
    category ? { category } : undefined,
  );

  const filtered = useMemo(() => {
    if (!professionals) return [];
    const q = search.trim().toLowerCase();
    if (!q) return professionals;
    return professionals.filter((p) =>
      `${p.name} ${p.company} ${p.city} ${p.country}`.toLowerCase().includes(q),
    );
  }, [professionals, search]);

  const categoryLabel = (id: string) =>
    categories?.find((c) => c.id === id)?.label ?? id;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-bold">Professionals</h1>
          <p className="text-muted-foreground mt-1">
            Verified specialists for every side of a private transaction — brokerage, legal, tax, financing, valuation and diligence.
          </p>
        </div>
        <div className="w-full md:w-72">
          <Input
            placeholder="Search by name, company or city..."
            className="bg-card border-white/5"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-professionals-search"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2" data-testid="filter-categories">
        <button
          onClick={() => setCategory(null)}
          className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${category === null ? "bg-primary text-primary-foreground border-primary" : "bg-card/40 border-white/10 text-muted-foreground hover:border-primary/40"}`}
          data-testid="button-category-all"
        >
          All
        </button>
        {categories?.filter((c) => c.count > 0).map((c) => (
          <button
            key={c.id}
            onClick={() => setCategory(category === c.id ? null : c.id)}
            className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${category === c.id ? "bg-primary text-primary-foreground border-primary" : "bg-card/40 border-white/10 text-muted-foreground hover:border-primary/40"}`}
            data-testid={`button-category-${c.id}`}
          >
            {c.label} <span className="opacity-60 ml-1">{c.count}</span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground rounded-xl border border-dashed border-white/10" data-testid="text-no-professionals">
          <Building2 className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p>No professionals match your filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filtered.map((p) => (
            <Card
              key={p.id}
              className="relative bg-card/30 backdrop-blur border-white/5 overflow-hidden group hover:border-primary/30 transition-colors h-full"
            >
              <Link
                href={`/demo/professionals/${p.id}`}
                className="absolute inset-0 z-[1] outline-none focus-visible:ring-2 focus-visible:ring-primary/60 rounded-xl"
                aria-label={`View profile of ${p.name}`}
                data-testid={`link-professional-card-${p.id}`}
              />
              <CardContent className="p-6 flex flex-col h-full">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <Avatar className="w-14 h-14 border-2 border-primary/20">
                      <AvatarImage src={p.avatarUrl || undefined} />
                      <AvatarFallback className="bg-background text-primary font-heading font-bold text-lg">
                        {p.name.split(" ").map((n) => n[0]).join("").slice(0, 3)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h3 className="font-heading font-bold text-lg leading-tight flex items-center gap-2">
                        {p.name}
                        {p.isDemo && (
                          <Badge variant="outline" className="text-[10px] uppercase tracking-wider border-white/20 text-muted-foreground font-semibold">
                            Demo
                          </Badge>
                        )}
                      </h3>
                      <p className="text-sm font-medium text-muted-foreground">{p.title}</p>
                      <p className="text-xs text-muted-foreground/80 flex items-center gap-1 mt-1">
                        <Building2 className="w-3 h-3" /> {p.company}
                      </p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="bg-background border-white/10 text-xs shrink-0">
                    {categoryLabel(p.category)}
                  </Badge>
                </div>

                <div className="mt-4 flex items-center gap-2 flex-wrap">
                  <VerificationBadge status={p.verificationStatus} />
                  <TrustBadge professionalId={p.id} score={p.trustScore} tier={p.trustTier} />
                  {p.avgRating != null && (
                    <span className="inline-flex items-center gap-1 text-sm text-foreground font-semibold">
                      <Star className="w-4 h-4 text-primary" /> {p.avgRating.toFixed(1)}
                      <span className="text-muted-foreground font-normal">({p.reviewCount})</span>
                    </span>
                  )}
                </div>

                <div className="mt-4 flex gap-2 flex-wrap">
                  {(p.specialisations ?? []).slice(0, 3).map((spec) => (
                    <Badge key={spec} variant="secondary" className="bg-background border-white/5 text-xs font-normal">
                      {spec}
                    </Badge>
                  ))}
                </div>

                <div className="mt-auto pt-5 flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" /> {p.city}, {p.country}
                  </span>
                  <span className="flex items-center gap-1">
                    <BadgeCheck className="w-3.5 h-3.5" /> {p.yearsExperience} yrs
                  </span>
                  {(p.languages?.length ?? 0) > 0 && (
                    <span className="flex items-center gap-1">
                      <Globe2 className="w-3.5 h-3.5" /> {p.languages!.join(", ")}
                    </span>
                  )}
                  {p.avgResponseHours != null && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" /> responds in ~{p.avgResponseHours}h
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
