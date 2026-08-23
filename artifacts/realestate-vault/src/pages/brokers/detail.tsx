import { formatMillions } from "@/lib/utils";
import { Link, useParams } from "wouter";
import {
  useGetBroker,
  useListBrokerDeals,
  useListProfessionalReviews,
  useListProfessionalCategories,
} from "@workspace/api-client-react";
import { VerificationBadge } from "@/components/verification-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  ShieldCheck,
  MapPin,
  Star,
  Building2,
  ArrowLeft,
  Briefcase,
  Globe2,
  Clock,
  Award,
  MessageSquareQuote,
} from "lucide-react";

export default function BrokerDetail() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const { data: broker, isLoading, isError } = useGetBroker(id);
  const { data: deals, isLoading: dealsLoading } = useListBrokerDeals(id);
  const { data: reviews } = useListProfessionalReviews(id);
  const { data: categories } = useListProfessionalCategories();
  const categoryLabel = broker
    ? categories?.find((c) => c.id === broker.category)?.label
    : undefined;
  // Only sell-side brokers own listings; other professionals never do.
  const isListingBroker = broker?.category === "brokers";

  if (isLoading) {
    return (
      <div className="p-8 max-w-7xl mx-auto space-y-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-80 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !broker) {
    return (
      <div className="p-8 max-w-7xl mx-auto text-center py-24 text-muted-foreground" data-testid="text-broker-not-found">
        <Building2 className="w-12 h-12 mx-auto mb-4 opacity-20" />
        <p className="font-medium">Broker not found.</p>
        <Button asChild variant="outline" className="mt-6 border-white/10">
          <Link href="/demo/brokers">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Broker Directory
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <Link
        href="/demo/professionals"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-primary transition-colors"
        data-testid="link-back-to-brokers"
      >
        <ArrowLeft className="w-4 h-4 mr-2" /> Professionals Directory
      </Link>

      <Card className="bg-card/30 backdrop-blur border-white/5 overflow-hidden">
        <CardContent className="p-0 flex flex-col md:flex-row">
          <div className="p-8 md:w-2/3 border-b md:border-b-0 md:border-r border-white/5">
            <div className="flex items-start gap-6">
              <Avatar className="w-24 h-24 border-2 border-primary/20">
                <AvatarImage src={broker.avatarUrl || undefined} />
                <AvatarFallback className="bg-background text-primary font-heading font-bold text-3xl">
                  {broker.name.split(" ").map((n) => n[0]).join("")}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <h1 className="text-3xl font-heading font-bold flex items-center gap-3" data-testid="text-broker-name">
                  {broker.name}
                  {broker.verified && <ShieldCheck className="w-6 h-6 text-primary" />}
                  {broker.isDemo && (
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wider border-white/20 text-muted-foreground font-semibold">
                      Demo
                    </Badge>
                  )}
                </h1>
                <p className="text-muted-foreground font-medium mt-1">{broker.title}</p>
                <div className="flex items-center gap-2 flex-wrap mt-2">
                  {categoryLabel && (
                    <Badge variant="secondary" className="bg-background border-white/10 text-xs">
                      {categoryLabel}
                    </Badge>
                  )}
                  <VerificationBadge status={broker.verificationStatus} />
                </div>
                <p className="text-sm text-muted-foreground/80 flex items-center gap-1 mt-1">
                  <Building2 className="w-4 h-4" /> {broker.company}
                </p>
                <div className="flex items-center gap-4 text-sm text-muted-foreground mt-3">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-4 h-4" /> {broker.city}, {broker.country}
                  </span>
                  <span className="flex items-center gap-1">
                    <Star className="w-4 h-4 text-primary" /> {broker.yearsExperience} Years Exp.
                  </span>
                </div>
              </div>
            </div>

            {broker.bio && (
              <p className="mt-6 text-sm text-muted-foreground leading-relaxed" data-testid="text-broker-bio">
                {broker.bio}
              </p>
            )}

            <div className="mt-6">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-2">Specialisations</p>
              <div className="flex gap-2 flex-wrap">
                {broker.specialisations.map((spec) => (
                  <Badge key={spec} variant="secondary" className="bg-background border-white/5 text-xs font-normal">
                    {spec}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3 text-sm text-muted-foreground">
              {(broker.countries?.length ?? 0) > 0 && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4" /> {broker.countries!.join(", ")}
                </span>
              )}
              {(broker.languages?.length ?? 0) > 0 && (
                <span className="flex items-center gap-1.5">
                  <Globe2 className="w-4 h-4" /> {broker.languages!.join(", ")}
                </span>
              )}
              {broker.avgResponseHours != null && (
                <span className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4" /> Typically responds in ~{broker.avgResponseHours}h
                </span>
              )}
            </div>

            {(broker.credentials?.length ?? 0) > 0 && (
              <div className="mt-6">
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-2">Credentials</p>
                <div className="flex gap-2 flex-wrap">
                  {broker.credentials!.map((c) => (
                    <Badge key={c} variant="outline" className="border-primary/30 text-primary text-xs font-normal gap-1">
                      <Award className="w-3 h-3" /> {c}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="p-8 md:w-1/3 bg-background/20 space-y-4">
            <div className="text-center p-4 rounded-xl bg-background border border-white/5">
              <div className="text-3xl font-heading font-bold text-foreground">{broker.score}/100</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Reputation Score</div>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  {isListingBroker ? "Closed Deals" : "Verified Engagements"}
                </span>
                <span className="font-bold">{broker.closedDeals}</span>
              </div>
              {broker.transactionVolume > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tx Volume</span>
                  <span className="font-bold">{formatMillions(broker.transactionVolume)}</span>
                </div>
              )}
              {broker.avgResponseHours != null && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Response Time</span>
                  <span className="font-bold">~{broker.avgResponseHours}h</span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {reviews && reviews.length > 0 && (
        <div>
          <h2 className="text-xl font-heading font-bold flex items-center gap-2 mb-2">
            <MessageSquareQuote className="w-5 h-5 text-primary" /> Reviews
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            Only reviews from verified engagements are shown.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {reviews.map((r) => (
              <Card key={r.id} className="bg-card/30 backdrop-blur border-white/5" data-testid={`card-review-${r.id}`}>
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-sm">{r.reviewerName}</p>
                      {r.reviewerCompany && (
                        <p className="text-xs text-muted-foreground">{r.reviewerCompany}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-lg font-heading font-bold text-foreground">
                      <Star className="w-4 h-4 text-primary" /> {r.ratingOverall.toFixed(1)}
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-[10px] uppercase tracking-wider font-semibold ${r.source === "connection" ? "border-primary/40 text-primary" : "border-white/20 text-muted-foreground"}`}
                  >
                    {r.source === "connection" ? "Verified engagement" : "Demo reference"}
                  </Badge>
                  {r.comment && (
                    <p className="text-sm text-muted-foreground leading-relaxed">{r.comment}</p>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 text-xs text-muted-foreground border-t border-white/5 pt-4">
                    {[
                      ["Expertise", r.ratingExpertise],
                      ["Communication", r.ratingCommunication],
                      ["Speed", r.ratingSpeed],
                      ["Quality", r.ratingQuality],
                      ["Professionalism", r.ratingProfessionalism],
                      ["Deal Understanding", r.ratingDealUnderstanding],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="flex justify-between gap-2">
                        <span>{label}</span>
                        <span className="font-semibold text-foreground">{Number(value).toFixed(1)}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {isListingBroker && (
      <div>
        <h2 className="text-xl font-heading font-bold flex items-center gap-2 mb-6">
          <Briefcase className="w-5 h-5 text-primary" /> Active Listings
        </h2>
        {dealsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-80 rounded-xl" />
            ))}
          </div>
        ) : deals && deals.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {deals.map((deal) => (
              <Link key={deal.id} href={`/demo/deals/${deal.id}`} className="block h-full outline-none focus-visible:ring-2 focus-visible:ring-primary/60 rounded-xl" data-testid={`link-listing-card-${deal.id}`}>
              <Card className="overflow-hidden bg-card/30 backdrop-blur border-white/5 group hover:border-primary/30 transition-colors flex flex-col h-full cursor-pointer">
                <div className="relative h-40 bg-muted/20 overflow-hidden">
                  {deal.imageUrl ? (
                    <img src={deal.imageUrl} alt={deal.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-background/80">
                      <Building2 className="w-10 h-10 text-muted-foreground/30" />
                    </div>
                  )}
                  <div className="absolute top-3 right-3">
                    <Badge variant="secondary" className="bg-background/80 backdrop-blur text-foreground border-white/10 font-medium">
                      {deal.assetClass}
                    </Badge>
                  </div>
                </div>
                <CardContent className="p-5 flex-1 flex flex-col">
                  <h3 className="font-heading text-lg font-bold line-clamp-1 mb-1 group-hover:text-primary transition-colors">
                    {deal.title}
                  </h3>
                  <div className="flex items-center text-sm text-muted-foreground mb-4">
                    <MapPin className="w-4 h-4 mr-1 opacity-70" />
                    {deal.city}, {deal.country}
                  </div>
                  <div className="grid grid-cols-2 gap-4 mb-5 mt-auto border-t border-white/5 pt-4">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider font-medium">Asking Price</p>
                      <p className="font-semibold text-foreground">{formatMillions(deal.askingPrice)}</p>
                    </div>
                    {deal.grossYield != null && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider font-medium">Yield</p>
                        <p className="font-semibold text-foreground">{deal.grossYield}%</p>
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
          </div>
        ) : (
          <div className="py-16 text-center text-muted-foreground rounded-xl border border-dashed border-white/10" data-testid="text-no-listings">
            <Briefcase className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p>This broker has no active listings right now.</p>
          </div>
        )}
      </div>
      )}
    </div>
  );
}
