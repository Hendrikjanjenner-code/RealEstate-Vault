import { formatMillions } from "@/lib/utils";
import { Link, useParams } from "wouter";
import {
  useListMandates,
  useListMandateMatches,
  getListMandateMatchesQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Building2, MapPin, Target, TrendingUp } from "lucide-react";

type YieldFit = "meets" | "below" | "unknown";

function getYieldFit(grossYield: number | null | undefined, yieldTarget: number | null | undefined): YieldFit {
  if (yieldTarget == null || grossYield == null) return "unknown";
  return grossYield >= yieldTarget ? "meets" : "below";
}

export default function MandateMatches() {
  const params = useParams<{ id: string }>();
  const mandateId = Number(params.id);
  const { data: mandates } = useListMandates();
  const mandate = mandates?.find((m) => m.id === mandateId);
  const { data: deals, isLoading, isError } = useListMandateMatches(mandateId, {
    query: {
      enabled: Number.isFinite(mandateId),
      queryKey: getListMandateMatchesQueryKey(mandateId),
    },
  });

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <Button asChild variant="ghost" className="mb-4 -ml-3 text-muted-foreground hover:text-foreground">
          <Link href="/demo/mandates">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Mandates
          </Link>
        </Button>
        <h1 className="text-3xl font-heading font-bold">Matching Deals</h1>
        {mandate ? (
          <div className="mt-3 space-y-2">
            <p className="text-muted-foreground">
              Deals fitting <span className="text-foreground font-medium">{mandate.title}</span> — {formatMillions(mandate.minSize)} to {formatMillions(mandate.maxSize)}
            </p>
            <div className="flex gap-2 flex-wrap">
              {mandate.assetClasses.map((ac) => (
                <Badge key={ac} variant="secondary" className="bg-background border-white/5 text-xs font-normal">
                  <Building2 className="w-3 h-3 mr-1" /> {ac}
                </Badge>
              ))}
              {mandate.countries.map((c) => (
                <Badge key={c} variant="secondary" className="bg-background border-white/5 text-xs font-normal">
                  <MapPin className="w-3 h-3 mr-1" /> {c}
                </Badge>
              ))}
              {mandate.yieldTarget != null && (
                <Badge variant="secondary" className="bg-background border-white/5 text-xs font-normal" data-testid="badge-yield-target">
                  <TrendingUp className="w-3 h-3 mr-1" /> {mandate.yieldTarget}%+ yield target
                </Badge>
              )}
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground mt-1">Deals matching this mandate's criteria.</p>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-96 rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <div className="py-20 text-center text-muted-foreground">
          <Target className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p>Could not load matches for this mandate.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {deals?.map((deal) => (
            <Link key={deal.id} href={`/demo/deals/${deal.id}`} className="block h-full outline-none focus-visible:ring-2 focus-visible:ring-primary/60 rounded-xl" data-testid={`link-match-card-${deal.id}`}>
            <Card className="overflow-hidden bg-card/30 backdrop-blur border-white/5 group hover:border-primary/30 transition-colors flex flex-col h-full cursor-pointer">
              <div className="relative h-48 bg-muted/20 overflow-hidden">
                {deal.imageUrl ? (
                  <img src={deal.imageUrl} alt={deal.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-background/80">
                    <Building2 className="w-12 h-12 text-muted-foreground/30" />
                  </div>
                )}
                <div className="absolute top-4 right-4">
                  <Badge variant="secondary" className="bg-background/80 backdrop-blur text-foreground border-white/10 font-medium">
                    {deal.assetClass}
                  </Badge>
                </div>
              </div>
              <CardContent className="p-6 flex-1 flex flex-col">
                <h3 className="font-heading text-xl font-bold line-clamp-1 mb-2 group-hover:text-primary transition-colors">
                  {deal.confidential && deal.accessStatus !== "granted" ? "Confidential Opportunity" : deal.title}
                </h3>
                <div className="flex items-center text-sm text-muted-foreground mb-4">
                  <MapPin className="w-4 h-4 mr-1 opacity-70" />
                  {deal.locationPrivacy === "country_only" && deal.accessStatus !== "granted"
                    ? deal.country
                    : `${deal.city}, ${deal.country}`}
                </div>
                <div className="grid grid-cols-2 gap-4 mb-6 mt-auto border-t border-white/5 pt-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider font-medium">Asking Price</p>
                    <p className="font-semibold text-foreground">{formatMillions(deal.askingPrice)}</p>
                  </div>
                  {deal.grossYield != null && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider font-medium">Yield</p>
                      <p className="font-semibold text-foreground">
                        {deal.grossYield}%
                        {(() => {
                          const fit = getYieldFit(deal.grossYield, mandate?.yieldTarget);
                          if (fit === "meets") {
                            return (
                              <span className="ml-2 text-xs font-medium text-emerald-400" data-testid={`yield-fit-${deal.id}`}>
                                Meets target
                              </span>
                            );
                          }
                          if (fit === "below") {
                            return (
                              <span className="ml-2 text-xs font-medium text-amber-400" data-testid={`yield-fit-${deal.id}`}>
                                Below target
                              </span>
                            );
                          }
                          return null;
                        })()}
                      </p>
                    </div>
                  )}
                </div>
                <span aria-hidden="true" className="inline-flex items-center justify-center h-9 px-4 py-2 rounded-md text-sm w-full bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground border border-primary/20 transition-all font-semibold">
                  View Details
                </span>
              </CardContent>
            </Card>
            </Link>
          ))}
          {deals?.length === 0 && (
            <div className="col-span-full py-20 text-center text-muted-foreground">
              <Target className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p>No deals currently match this mandate's criteria.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
