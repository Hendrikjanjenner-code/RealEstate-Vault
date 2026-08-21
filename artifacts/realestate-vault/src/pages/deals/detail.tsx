import { formatMillions } from "@/lib/utils";
import { useState, useRef } from "react";
import { useRoute } from "wouter";
import { useGetDeal, useListDealDocuments, useRequestDealAccess, getGetDealQueryKey, getListDealDocumentsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { MapPin, Building2, Lock, FileText, Download, CheckCircle2, AlertCircle, Clock, Info, Key, Shield } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getListAccessRequestsQueryKey } from "@workspace/api-client-react";

type AccessState = "locked" | "requested" | "granted";

export default function DealDetail() {
  const [, params] = useRoute("/demo/deals/:id");
  const id = Number(params?.id || 0);
  const { data: deal, isLoading: dealLoading } = useGetDeal(id, { query: { enabled: !!id, queryKey: getGetDealQueryKey(id) } });
  const { data: docs, isLoading: docsLoading } = useListDealDocuments(id, { query: { enabled: !!id, queryKey: getListDealDocumentsQueryKey(id) } });
  const requestAccess = useRequestDealAccess();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [accessState, setAccessState] = useState<AccessState>("locked");
  const [form, setForm] = useState({ requesterName: "", requesterCompany: "", message: "" });

  const handleRequestAccess = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.requesterName.trim() || !form.requesterCompany.trim()) {
      toast({ title: "Missing details", description: "Please provide your name and company.", variant: "destructive" });
      return;
    }
    requestAccess.mutate(
      { id, data: { requesterName: form.requesterName.trim(), requesterCompany: form.requesterCompany.trim(), message: form.message.trim() || undefined } },
      {
        onSuccess: () => {
          toast({ title: "Access Requested", description: "The broker will review your request shortly." });
          setAccessState("requested");
          queryClient.invalidateQueries({ queryKey: getListAccessRequestsQueryKey() });
        },
        onError: () => {
          toast({ title: "Request failed", description: "Please try again.", variant: "destructive" });
        },
      },
    );
  };

  if (dealLoading) {
    return (
      <div className="p-8 max-w-5xl mx-auto space-y-8 animate-pulse">
        <Skeleton className="h-64 w-full rounded-2xl" />
        <Skeleton className="h-12 w-3/4" />
        <div className="grid grid-cols-3 gap-6">
          <Skeleton className="h-32 col-span-2" />
          <Skeleton className="h-32" />
        </div>
      </div>
    );
  }

  if (!deal) return <div className="p-8 text-center">Deal not found</div>;

  const effectiveAccess: AccessState = deal.confidential ? accessState : "granted";
  const isRestricted = effectiveAccess !== "granted";

  return (
    <div className="p-0 pb-20">
      {/* Hero Header */}
      <div className="relative h-[40vh] min-h-[300px] w-full bg-muted/20">
        {deal.imageUrl ? (
           <img src={deal.imageUrl} alt={deal.title} className={`w-full h-full object-cover ${isRestricted ? 'blur-md scale-105' : ''}`} />
        ) : (
           <div className="w-full h-full flex items-center justify-center bg-background/90 relative overflow-hidden">
             <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(200,169,90,0.02)_50%,transparent_75%)] bg-[length:250px_250px] animate-[shimmer_2s_linear_infinite]" />
             <Building2 className="w-24 h-24 text-primary/10" />
           </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
        
        {isRestricted && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10 text-center px-4">
            <div className="w-20 h-20 rounded-full bg-background/50 backdrop-blur-md border border-primary/30 flex items-center justify-center mb-6 shadow-[0_0_50px_rgba(200,169,90,0.2)]">
              <Lock className="w-10 h-10 text-primary" />
            </div>
            <h2 className="text-3xl font-heading font-bold text-foreground mb-2">Confidential Opportunity</h2>
            <p className="text-muted-foreground max-w-md">Detailed information and exact location are hidden. Request access to sign the NDA and view the full data room.</p>
          </div>
        )}

        <div className="absolute bottom-0 left-0 right-0 p-8 max-w-6xl mx-auto flex items-end justify-between z-20">
           <div className={isRestricted ? "opacity-0" : "opacity-100 transition-opacity duration-1000"}>
             <div className="flex gap-2 mb-4">
               <Badge className="bg-primary/20 text-primary hover:bg-primary/30 border-primary/20">{deal.assetClass}</Badge>
               <Badge variant="outline" className="border-white/20 bg-background/50 backdrop-blur">{deal.dealType.replace('_', ' ')}</Badge>
             </div>
             <h1 className="text-4xl md:text-5xl font-heading font-bold text-foreground mb-4 drop-shadow-md">{deal.title}</h1>
             <div className="flex items-center text-lg text-foreground/80 font-medium">
               <MapPin className="w-5 h-5 mr-2 text-primary" />
               {deal.city}, {deal.country}
             </div>
           </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-8 pt-8 grid grid-cols-1 lg:grid-cols-3 gap-12">
        <div className="lg:col-span-2 space-y-12">
          {/* Key Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <MetricBox label="Asking Price" value={formatMillions(deal.askingPrice)} />
            <MetricBox label="Gross Yield" value={deal.grossYield ? `${deal.grossYield}%` : 'N/A'} />
            <MetricBox label="Area" value={deal.areaSqm ? `${deal.areaSqm.toLocaleString()} sqm` : 'N/A'} />
            <MetricBox label="Occupancy" value={deal.occupancyPct ? `${deal.occupancyPct}%` : 'N/A'} />
          </div>

          <div className="space-y-6">
            <h3 className="text-2xl font-heading font-bold flex items-center gap-2">
              <Info className="w-5 h-5 text-primary" /> Investment Overview
            </h3>
            {isRestricted ? (
              <div className="p-6 rounded-xl bg-card/30 border border-white/5 backdrop-blur text-muted-foreground italic">
                {deal.teaser || "Detailed description is locked until NDA is signed."}
              </div>
            ) : (
              <div className="prose prose-invert max-w-none text-muted-foreground leading-relaxed">
                {deal.description?.split('\n').map((para, i) => (
                  <p key={i}>{para}</p>
                )) || "No description provided."}
              </div>
            )}
          </div>

          <div className="space-y-6">
            <h3 className="text-2xl font-heading font-bold flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" /> Secure Data Room
            </h3>
            <div className="rounded-xl border border-white/5 bg-card/30 backdrop-blur overflow-hidden">
              {docsLoading ? (
                <div className="p-6 space-y-4">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : docs?.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground">No documents uploaded yet.</div>
              ) : (
                <div className="divide-y divide-white/5">
                  {docs?.map((doc) => {
                    const isDocLocked = doc.ndaRequired && effectiveAccess !== "granted";
                    return (
                      <div key={doc.id} className="p-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
                        <div className="flex items-center gap-4">
                          <div className={`p-2 rounded-lg ${isDocLocked ? 'bg-background text-muted-foreground' : 'bg-primary/10 text-primary'}`}>
                            {isDocLocked ? <Lock className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                          </div>
                          <div>
                            <p className={`font-medium ${isDocLocked ? 'text-muted-foreground' : 'text-foreground'}`}>{doc.name}</p>
                            <p className="text-xs text-muted-foreground uppercase tracking-wider">{doc.category} • {(doc.sizeKb / 1024).toFixed(1)} MB</p>
                          </div>
                        </div>
                        <Button variant={isDocLocked ? "ghost" : "outline"} size="sm" disabled={isDocLocked} className={isDocLocked ? 'opacity-50 cursor-not-allowed' : 'border-white/10 hover:bg-primary/10 hover:text-primary hover:border-primary/30'}>
                          <Download className="w-4 h-4 mr-2" /> Download
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="rounded-2xl bg-card border border-white/5 p-6 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary to-primary/30" />
            <h3 className="font-heading text-lg font-semibold mb-4">Access Status</h3>
            
            <div className="space-y-6 mb-8">
              <StatusStep 
                label="Confidential Info" 
                active={true}
                completed={effectiveAccess === "granted"} 
              />
              <StatusStep 
                label="Request Access" 
                active={effectiveAccess !== "granted"}
                completed={effectiveAccess !== "locked"} 
              />
              <StatusStep 
                label="NDA Signature" 
                active={effectiveAccess !== "locked"}
                completed={effectiveAccess === "granted"} 
                isLast 
              />
            </div>

            {effectiveAccess === "locked" && (
              <form onSubmit={handleRequestAccess} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="req-name" className="text-xs uppercase tracking-wider text-muted-foreground">Your Name</Label>
                  <Input id="req-name" required value={form.requesterName} onChange={(e) => setForm((f) => ({ ...f, requesterName: e.target.value }))} placeholder="Full name" className="bg-background/50 border-white/10" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="req-company" className="text-xs uppercase tracking-wider text-muted-foreground">Company</Label>
                  <Input id="req-company" required value={form.requesterCompany} onChange={(e) => setForm((f) => ({ ...f, requesterCompany: e.target.value }))} placeholder="Firm or family office" className="bg-background/50 border-white/10" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="req-message" className="text-xs uppercase tracking-wider text-muted-foreground">Message (optional)</Label>
                  <Input id="req-message" value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} placeholder="Briefly introduce your interest" className="bg-background/50 border-white/10" />
                </div>
                <Button type="submit" disabled={requestAccess.isPending} className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-12 font-bold text-base shadow-[0_0_20px_rgba(200,169,90,0.3)]">
                  <Key className="w-5 h-5 mr-2" /> Request Access
                </Button>
              </form>
            )}
            {effectiveAccess === "requested" && (
              <div className="p-4 rounded-xl bg-background border border-primary/20 text-center space-y-3">
                <Clock className="w-6 h-6 text-primary mx-auto animate-pulse" />
                <p className="font-medium text-primary">Request Pending</p>
                <p className="text-xs text-muted-foreground">The broker is reviewing your profile. You will be notified when the NDA is ready to sign.</p>
                <Button variant="outline" size="sm" onClick={() => setAccessState("granted")} className="w-full border-primary/30 text-primary hover:bg-primary/10">
                  Simulate NDA Signature (demo)
                </Button>
              </div>
            )}
            {deal.confidential && effectiveAccess === "granted" && (
              <div className="p-4 rounded-xl bg-primary/10 border border-primary/30 text-center">
                <CheckCircle2 className="w-6 h-6 text-primary mx-auto mb-2" />
                <p className="font-medium text-primary mb-1">Access Granted</p>
                <p className="text-xs text-muted-foreground">You have full access to this confidential data room.</p>
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-card/30 backdrop-blur border border-white/5 p-6">
            <h3 className="font-heading text-sm text-muted-foreground uppercase tracking-wider font-semibold mb-4">Represented By</h3>
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-background border border-white/10 flex items-center justify-center font-heading font-bold text-lg text-primary">
                {deal.brokerName?.charAt(0) || 'B'}
              </div>
              <div>
                <p className="font-semibold">{deal.brokerName}</p>
                <p className="text-sm text-muted-foreground">{deal.brokerCompany}</p>
              </div>
            </div>
            <Button variant="outline" className="w-full border-white/10">View Broker Profile</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricBox({ label, value }: { label: string, value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-1">{label}</p>
      <p className="text-2xl font-heading font-semibold text-foreground">{value}</p>
    </div>
  );
}

function StatusStep({ label, active, completed, isLast = false }: { label: string, active: boolean, completed: boolean, isLast?: boolean }) {
  return (
    <div className="flex gap-4 relative">
      {!isLast && (
        <div className={`absolute left-3 top-8 bottom-[-24px] w-[2px] ${completed ? 'bg-primary' : 'bg-white/10'}`} />
      )}
      <div className={`w-6 h-6 rounded-full flex items-center justify-center z-10 shrink-0 border-2 ${
        completed ? 'bg-primary border-primary text-primary-foreground' :
        active ? 'bg-background border-primary text-primary' :
        'bg-background border-white/20 text-muted-foreground'
      }`}>
        {completed ? <CheckCircle2 className="w-4 h-4" /> : <div className={`w-2 h-2 rounded-full ${active ? 'bg-primary' : 'bg-transparent'}`} />}
      </div>
      <div className={`pt-0.5 ${active || completed ? 'text-foreground' : 'text-muted-foreground'}`}>
        <p className="font-medium text-sm">{label}</p>
      </div>
    </div>
  );
}
