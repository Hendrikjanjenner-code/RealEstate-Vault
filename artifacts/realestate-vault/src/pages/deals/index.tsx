import { formatMillions } from "@/lib/utils";
import { useState } from "react";
import { Link } from "wouter";
import { useListDeals, useToggleSaveDeal } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, MapPin, Building2, Bookmark, BookmarkCheck, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQueryClient } from "@tanstack/react-query";
import { getListDealsQueryKey } from "@workspace/api-client-react";

export default function DealsList() {
  const [search, setSearch] = useState("");
  const [assetClass, setAssetClass] = useState<string>("all");
  const [savedOnly, setSavedOnly] = useState(false);
  const listParams = {
    search,
    assetClass: assetClass === "all" ? undefined : assetClass,
    savedOnly: savedOnly || undefined,
  };
  const { data: deals, isLoading } = useListDeals(listParams);
  const toggleSave = useToggleSaveDeal();
  const queryClient = useQueryClient();

  const handleToggleSave = (id: number, currentSaved: boolean) => {
    toggleSave.mutate({ id }, {
      onSuccess: () => {
         queryClient.setQueryData(getListDealsQueryKey(listParams), (old: any) => {
           if (!old) return old;
           if (savedOnly && currentSaved) {
             // Un-saving while the Saved filter is active removes it from the list
             return old.filter((d: any) => d.id !== id);
           }
           return old.map((d: any) => d.id === id ? { ...d, saved: !currentSaved } : d);
         });
      }
    });
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-bold">Deal Directory</h1>
          <p className="text-muted-foreground mt-1">Confidential off-market opportunities.</p>
        </div>
        <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold">
          <Link href="/demo/deals/new">Create Deal</Link>
        </Button>
      </div>

      <div className="flex flex-col md:flex-row gap-4 bg-card/50 backdrop-blur border border-white/5 p-4 rounded-xl">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search deals..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-background/50 border-white/10 focus-visible:ring-primary h-10"
          />
        </div>
        <div className="w-full md:w-48">
          <Select value={assetClass} onValueChange={setAssetClass}>
            <SelectTrigger className="bg-background/50 border-white/10 h-10">
              <SelectValue placeholder="Asset Class" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Assets</SelectItem>
              <SelectItem value="Hotels">Hotels & Resorts</SelectItem>
              <SelectItem value="Offices">Offices</SelectItem>
              <SelectItem value="Logistics">Logistics</SelectItem>
              <SelectItem value="Residential">Residential</SelectItem>
              <SelectItem value="Retail">Retail</SelectItem>
              <SelectItem value="Mixed-use">Mixed-use</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          onClick={() => setSavedOnly((v) => !v)}
          aria-pressed={savedOnly}
          data-testid="button-saved-only"
          className={cn(
            "border-white/10 h-10 w-full md:w-auto",
            savedOnly && "bg-primary/15 text-primary border-primary/40 hover:bg-primary/25 hover:text-primary"
          )}
        >
          {savedOnly ? <BookmarkCheck className="w-4 h-4 mr-2 fill-primary" /> : <Bookmark className="w-4 h-4 mr-2" />}
          Saved only
        </Button>
        <Button variant="outline" className="border-white/10 h-10 w-full md:w-auto">
          <Filter className="w-4 h-4 mr-2" /> More Filters
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-96 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {deals?.map((deal) => (
            <Card key={deal.id} className="overflow-hidden bg-card/30 backdrop-blur border-white/5 group hover:border-primary/30 transition-colors flex flex-col h-full">
              <div className="relative h-48 bg-muted/20 overflow-hidden">
                {deal.imageUrl ? (
                  <img src={deal.imageUrl} alt={deal.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-background/80 relative">
                     <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.02)_50%,transparent_75%)] bg-[length:250px_250px] animate-[shimmer_2s_linear_infinite]" />
                     <Building2 className="w-12 h-12 text-muted-foreground/30" />
                     {deal.confidential && (
                        <div className="absolute inset-0 backdrop-blur-sm bg-background/40 flex flex-col items-center justify-center">
                           <LockIcon className="w-8 h-8 text-primary mb-2 drop-shadow-[0_0_10px_rgba(200,169,90,0.5)]" />
                           <span className="text-xs font-bold uppercase tracking-widest text-primary">Confidential</span>
                        </div>
                     )}
                  </div>
                )}
                <div className="absolute top-4 right-4 flex gap-2">
                  <Badge variant="secondary" className="bg-background/80 backdrop-blur text-foreground border-white/10 font-medium">
                    {deal.assetClass}
                  </Badge>
                </div>
                <button 
                  onClick={(e) => { e.preventDefault(); handleToggleSave(deal.id, deal.saved); }}
                  className="absolute top-4 left-4 p-2 rounded-full bg-background/80 backdrop-blur hover:bg-background transition-colors text-primary border border-white/10"
                >
                  {deal.saved ? <BookmarkCheck className="w-4 h-4 fill-primary" /> : <Bookmark className="w-4 h-4" />}
                </button>
              </div>
              <CardContent className="p-6 flex-1 flex flex-col">
                <div className="flex items-center text-xs font-medium text-primary uppercase tracking-wider mb-2 gap-2">
                  <span>{deal.dealType.replace('_', ' ')}</span>
                  {deal.status === 'nda_signed' && <span className="px-2 py-0.5 bg-primary/20 rounded text-[10px]">NDA Signed</span>}
                </div>
                <h3 className="font-heading text-xl font-bold line-clamp-1 mb-2 group-hover:text-primary transition-colors">
                  {deal.confidential && deal.status !== 'nda_signed' ? 'Confidential Opportunity' : deal.title}
                </h3>
                <div className="flex items-center text-sm text-muted-foreground mb-4">
                  <MapPin className="w-4 h-4 mr-1 opacity-70" />
                  {deal.locationPrivacy === 'country_only' && deal.status !== 'nda_signed' 
                    ? deal.country 
                    : `${deal.city}, ${deal.country}`}
                </div>
                <div className="grid grid-cols-2 gap-4 mb-6 mt-auto border-t border-white/5 pt-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider font-medium">Asking Price</p>
                    <p className="font-semibold text-foreground">
                      {formatMillions(deal.askingPrice)}
                    </p>
                  </div>
                  {deal.grossYield && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider font-medium">Yield</p>
                      <p className="font-semibold text-foreground">{deal.grossYield}%</p>
                    </div>
                  )}
                </div>
                <Button asChild className="w-full bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground border border-primary/20 transition-all font-semibold">
                  <Link href={`/demo/deals/${deal.id}`}>View Details</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
          {deals?.length === 0 && (
             <div className="col-span-full py-20 text-center text-muted-foreground" data-testid="text-empty-state">
                {savedOnly ? (
                  <>
                    <Bookmark className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p>You haven't saved any deals yet.</p>
                    <p className="text-sm mt-1 opacity-70">Tap the bookmark on a deal to add it to your shortlist.</p>
                  </>
                ) : (
                  <>
                    <Building2 className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p>No deals found matching your criteria.</p>
                  </>
                )}
             </div>
          )}
        </div>
      )}
    </div>
  );
}

function LockIcon(props: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinelinejoin="round" {...props}>
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  );
}
