import { formatMillions } from "@/lib/utils";
import { useState } from "react";
import { Link, useRoute } from "wouter";
import {
  useGetDeal,
  useListDealDocuments,
  useRequestDealAccess,
  useListAccessRequests,
  useSignAccessRequestNda,
  useCreateDealDocument,
  useUpdateDealDocument,
  useDeleteDealDocument,
  useRequestUploadUrl,
  getGetDealQueryKey,
  getListDealDocumentsQueryKey,
  getGetDealAdvisoryQueryKey,
  getGetDealTimelineQueryKey,
  getListAccessRequestsQueryKey,
} from "@workspace/api-client-react";
import { ObjectUploader } from "@workspace/object-storage-web";
import { useAuth } from "@workspace/replit-auth-web";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { MapPin, Building2, Lock, FileText, Download, CheckCircle2, AlertCircle, Clock, Info, Key, Shield, FileSignature, Upload, Pencil, Trash2, X, ArrowLeft } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { NDA_PARAGRAPHS, NDA_TITLE } from "@workspace/nda-terms";
import { DealTeamSection } from "@/components/deal-team";
import { DueDiligenceTab, QaTab, ReviewsTab } from "@/components/deal-dd";
import {
  AdvisoryOverview,
  DealHealthTab,
  ReadinessPanel,
  TimelineTab,
  PlaceholderTab,
} from "@/components/deal-advisory";
import { DocumentAiPanel, AiIntelligenceTab, AssistantTab } from "@/components/deal-ai";
import { FinancialsTab, FinancingTab } from "@/components/deal-financials";
import { Sparkles } from "lucide-react";

const DEAL_ROOM_TABS = [
  { id: "overview", label: "Overview" },
  { id: "financials", label: "Financials" },
  { id: "dataroom", label: "Data Room" },
  { id: "ai", label: "AI Intelligence" },
  { id: "assistant", label: "Assistant" },
  { id: "health", label: "Deal Health" },
  { id: "dd", label: "Due Diligence" },
  { id: "financing", label: "Financing" },
  { id: "team", label: "Deal Team" },
  { id: "qa", label: "Q&A" },
  { id: "reviews", label: "Reviews" },
  { id: "offers", label: "Offers" },
  { id: "timeline", label: "Timeline" },
] as const;

type DealRoomTab = (typeof DEAL_ROOM_TABS)[number]["id"];

type AccessState = "locked" | "requested" | "nda_sent" | "granted" | "rejected";

function toAccessState(accessStatus: string | null | undefined): AccessState {
  switch (accessStatus) {
    case "granted":
      return "granted";
    case "nda_sent":
      return "nda_sent";
    case "pending":
    case "approved":
      return "requested";
    case "rejected":
      return "rejected";
    default:
      return "locked";
  }
}

const DOWNLOAD_TOKEN_KEY = (dealId: number) => `download_token_${dealId}`;

export default function DealDetail() {
  const [, params] = useRoute("/demo/deals/:id");
  const id = Number(params?.id || 0);
  const { data: deal, isLoading: dealLoading } = useGetDeal(id, { query: { enabled: !!id, queryKey: getGetDealQueryKey(id) } });
  const { data: docs, isLoading: docsLoading } = useListDealDocuments(id, { query: { enabled: !!id, queryKey: getListDealDocumentsQueryKey(id) } });
  const requestAccess = useRequestDealAccess();
  const signNda = useSignAccessRequestNda();
  const createDoc = useCreateDealDocument();
  const updateDoc = useUpdateDealDocument();
  const deleteDoc = useDeleteDealDocument();
  const requestUploadUrl = useRequestUploadUrl();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({ requesterName: "", requesterCompany: "", message: "" });
  const [showNda, setShowNda] = useState(false);
  const [signerName, setSignerName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [newDocName, setNewDocName] = useState("");
  const [newDocCategory, setNewDocCategory] = useState("");
  const invalidateAdvisory = () => {
    queryClient.invalidateQueries({ queryKey: getGetDealAdvisoryQueryKey(id) });
    queryClient.invalidateQueries({ queryKey: getGetDealTimelineQueryKey(id) });
  };
  const [newDocNdaRequired, setNewDocNdaRequired] = useState(false);
  const [editingDocId, setEditingDocId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ name: "", category: "", ndaRequired: false });
  const [activeTab, setActiveTab] = useState<DealRoomTab>("overview");
  const [aiOpenDocId, setAiOpenDocId] = useState<number | null>(null);

  const handleSaveDocEdit = (docId: number) => {
    if (!editForm.name.trim() || !editForm.category.trim()) {
      toast({ title: "Missing details", description: "Name and category are required.", variant: "destructive" });
      return;
    }
    updateDoc.mutate(
      { id, docId, data: { name: editForm.name.trim(), category: editForm.category.trim(), ndaRequired: editForm.ndaRequired } },
      {
        onSuccess: () => {
          toast({ title: "Document Updated", description: `${editForm.name.trim()} saved.` });
          setEditingDocId(null);
          queryClient.invalidateQueries({ queryKey: getListDealDocumentsQueryKey(id) });
          invalidateAdvisory();
        },
        onError: () => {
          toast({ title: "Update failed", description: "Could not update the document.", variant: "destructive" });
        },
      },
    );
  };

  const handleDeleteDoc = (docId: number, docName: string) => {
    if (!window.confirm(`Delete "${docName}" from the data room? This cannot be undone.`)) return;
    deleteDoc.mutate(
      { id, docId },
      {
        onSuccess: () => {
          toast({ title: "Document Deleted", description: `${docName} removed from the data room.` });
          queryClient.invalidateQueries({ queryKey: getListDealDocumentsQueryKey(id) });
          invalidateAdvisory();
        },
        onError: () => {
          toast({ title: "Delete failed", description: "Could not delete the document.", variant: "destructive" });
        },
      },
    );
  };

  // Broker status comes exclusively from the authenticated account's role.
  const { user } = useAuth();
  const isBroker = user?.role === "broker";

  // Find this investor's own request for the deal so they can sign it.
  const { data: myRequests } = useListAccessRequests();
  const myRequest = myRequests?.find((r) => r.dealId === id && r.status === "nda_sent");
  const mySignedRequest = myRequests?.find((r) => r.dealId === id && r.status === "nda_signed");

  // Retrieve the capability download token from localStorage (stored at NDA sign time).
  const storedDownloadToken = localStorage.getItem(DOWNLOAD_TOKEN_KEY(id));

  const handleSignNda = (e: React.FormEvent) => {
    e.preventDefault();
    if (!myRequest) return;
    if (!signerName.trim() || !agreed) {
      toast({ title: "Incomplete", description: "Type your full legal name and accept the terms.", variant: "destructive" });
      return;
    }
    signNda.mutate(
      { id: myRequest.id, data: { signerName: signerName.trim(), agreed: true } },
      {
        onSuccess: () => {
          toast({ title: "NDA Signed", description: "You now have full access to this data room." });
          queryClient.invalidateQueries({ queryKey: getGetDealQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListDealDocumentsQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListAccessRequestsQueryKey() });
        },
        onError: () => {
          toast({ title: "Signing failed", description: "Please try again.", variant: "destructive" });
        },
      },
    );
  };

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
          queryClient.invalidateQueries({ queryKey: getGetDealQueryKey(id) });
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

  // Access is decided server-side; confidential fields are withheld by the
  // API until this user's request reaches nda_signed.
  const effectiveAccess: AccessState = toAccessState(deal.accessStatus);
  const isRestricted = effectiveAccess !== "granted";

  return (
    <div className="p-0 pb-20">
      {/* Hero Header */}
      <div className="relative h-[40vh] min-h-[300px] w-full bg-muted/20">
        <Link
          href="/demo/deals"
          className="absolute top-6 left-6 z-20 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-background/70 backdrop-blur border border-white/10 text-sm font-medium text-foreground hover:text-primary hover:border-primary/30 transition-colors"
          data-testid="link-back-to-deals"
        >
          <ArrowLeft className="w-4 h-4" /> All Deals
        </Link>
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

      {/* Deal Room tab bar */}
      <div className="max-w-6xl mx-auto px-8 pt-6">
        <div className="flex gap-1 overflow-x-auto border-b border-white/10 pb-px" data-testid="tabs-deal-room">
          {DEAL_ROOM_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              data-testid={`tab-${tab.id}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-8 pt-8 grid grid-cols-1 lg:grid-cols-3 gap-12">
        <div className="lg:col-span-2 space-y-12">
          {activeTab === "overview" && (
            <>
              {/* Key Metrics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <MetricBox label="Asking Price" value={formatMillions(deal.askingPrice)} />
                <MetricBox label="Gross Yield" value={deal.grossYield ? `${deal.grossYield}%` : 'N/A'} />
                <MetricBox label="Area" value={deal.areaSqm ? `${deal.areaSqm.toLocaleString()} sqm` : 'N/A'} />
                <MetricBox label="Occupancy" value={deal.occupancyPct ? `${deal.occupancyPct}%` : 'N/A'} />
              </div>

              <AdvisoryOverview dealId={id} onNavigate={(tab) => setActiveTab(tab as DealRoomTab)} />

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
            </>
          )}

          {activeTab === "financials" && <FinancialsTab dealId={id} />}
          {activeTab === "ai" && (
            <AiIntelligenceTab dealId={id} canManage={isBroker} transactionStructure={deal?.transactionStructure} />
          )}
          {activeTab === "assistant" && <AssistantTab dealId={id} />}
          {activeTab === "health" && <DealHealthTab dealId={id} />}
          {activeTab === "dd" && <DueDiligenceTab dealId={deal.id} />}
          {activeTab === "financing" && (
            <FinancingTab dealId={id} dealTitle={deal?.title ?? `deal-${id}`} />
          )}
          {activeTab === "qa" && <QaTab dealId={deal.id} />}
          {activeTab === "reviews" && <ReviewsTab dealId={deal.id} />}
          {activeTab === "offers" && (
            <PlaceholderTab title="Offers" description="Structured offer submission and comparison is coming to this tab." />
          )}
          {activeTab === "timeline" && <TimelineTab dealId={id} />}

          {activeTab === "team" && <DealTeamSection dealId={id} />}

          {activeTab === "dataroom" && (
          <div className="space-y-6">
            <h3 className="text-2xl font-heading font-bold flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" /> Secure Data Room
            </h3>
            <ReadinessPanel dealId={id} />
            <div className="rounded-xl border border-white/5 bg-card/30 backdrop-blur overflow-hidden">
              {docsLoading ? (
                <div className="p-6 space-y-4">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : docs?.length === 0 && !isBroker ? (
                <div className="p-12 text-center text-muted-foreground">No documents uploaded yet.</div>
              ) : (
                <div className="divide-y divide-white/5">
                  {docs?.map((doc) => {
                    const isDocLocked = doc.ndaRequired && effectiveAccess !== "granted";
                    const downloadUrl = doc.ndaRequired && storedDownloadToken
                      ? `/api/deals/${id}/documents/${doc.id}/download?token=${storedDownloadToken}`
                      : `/api/deals/${id}/documents/${doc.id}/download`;
                    if (isBroker && editingDocId === doc.id) {
                      return (
                        <div key={doc.id} className="p-4 bg-white/[0.02]" data-testid={`form-edit-doc-${doc.id}`}>
                          <div className="flex gap-2 items-end flex-wrap">
                            <div className="flex-1 min-w-40">
                              <Label htmlFor={`edit-doc-name-${doc.id}`} className="text-xs text-muted-foreground mb-1 block">Document Name</Label>
                              <Input
                                id={`edit-doc-name-${doc.id}`}
                                value={editForm.name}
                                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                                className="bg-background/50 border-white/10 h-8 text-sm"
                                data-testid={`input-edit-doc-name-${doc.id}`}
                              />
                            </div>
                            <div className="w-40">
                              <Label htmlFor={`edit-doc-category-${doc.id}`} className="text-xs text-muted-foreground mb-1 block">Category</Label>
                              <Input
                                id={`edit-doc-category-${doc.id}`}
                                value={editForm.category}
                                onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))}
                                className="bg-background/50 border-white/10 h-8 text-sm"
                                data-testid={`input-edit-doc-category-${doc.id}`}
                              />
                            </div>
                            <div className="flex items-center gap-2 pb-1.5">
                              <Checkbox
                                id={`edit-doc-nda-${doc.id}`}
                                checked={editForm.ndaRequired}
                                onCheckedChange={(v) => setEditForm((f) => ({ ...f, ndaRequired: v === true }))}
                                data-testid={`checkbox-edit-doc-nda-${doc.id}`}
                              />
                              <Label htmlFor={`edit-doc-nda-${doc.id}`} className="text-xs text-muted-foreground cursor-pointer">NDA required</Label>
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" onClick={() => handleSaveDocEdit(doc.id)} disabled={updateDoc.isPending} className="h-8 bg-primary text-primary-foreground hover:bg-primary/90" data-testid={`btn-save-doc-${doc.id}`}>
                                {updateDoc.isPending ? "Saving..." : "Save"}
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditingDocId(null)} className="h-8 border border-white/10" data-testid={`btn-cancel-edit-doc-${doc.id}`}>
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div key={doc.id}>
                      <div className="p-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
                        <div className="flex items-center gap-4">
                          <div className={`p-2 rounded-lg ${isDocLocked ? 'bg-background text-muted-foreground' : 'bg-primary/10 text-primary'}`}>
                            {isDocLocked ? <Lock className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                          </div>
                          <div>
                            <p className={`font-medium ${isDocLocked ? 'text-muted-foreground' : 'text-foreground'}`}>{doc.name}</p>
                            <p className="text-xs text-muted-foreground uppercase tracking-wider">
                              {doc.category}{doc.sizeKb ? ` • ${(doc.sizeKb / 1024).toFixed(1)} MB` : ''}
                              {doc.ndaRequired ? ' • NDA required' : ''}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {isDocLocked ? (
                            <Button variant="ghost" size="sm" disabled className="opacity-50 cursor-not-allowed">
                              <Lock className="w-4 h-4 mr-2" /> Locked
                            </Button>
                          ) : doc.hasFile ? (
                            <a href={downloadUrl} download>
                              <Button variant="outline" size="sm" className="border-white/10 hover:bg-primary/10 hover:text-primary hover:border-primary/30" data-testid={`btn-download-${doc.id}`}>
                                <Download className="w-4 h-4 mr-2" /> Download
                              </Button>
                            </a>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">No file yet</span>
                          )}
                          {!isDocLocked && doc.hasFile && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className={`h-8 text-xs ${aiOpenDocId === doc.id ? "text-primary" : "text-muted-foreground hover:text-primary"}`}
                              onClick={() => setAiOpenDocId(aiOpenDocId === doc.id ? null : doc.id)}
                              data-testid={`btn-ai-summary-${doc.id}`}
                            >
                              <Sparkles className="w-4 h-4 mr-1" /> AI Summary
                            </Button>
                          )}
                          {isBroker && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-muted-foreground hover:text-primary"
                                onClick={() => {
                                  setEditingDocId(doc.id);
                                  setEditForm({ name: doc.name, category: doc.category ?? "", ndaRequired: doc.ndaRequired });
                                }}
                                data-testid={`btn-edit-doc-${doc.id}`}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                                onClick={() => handleDeleteDoc(doc.id, doc.name)}
                                disabled={deleteDoc.isPending}
                                data-testid={`btn-delete-doc-${doc.id}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                      {aiOpenDocId === doc.id && !isDocLocked && doc.hasFile && (
                        <DocumentAiPanel dealId={id} docId={doc.id} canManage={isBroker} />
                      )}
                      </div>
                    );
                  })}

                  {/* Broker upload panel */}
                  {isBroker && (
                    <div className="p-4 bg-card/50 border-t border-white/5">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-3">
                        <Upload className="w-3 h-3 inline mr-1" /> Add Document
                      </p>
                      <div className="flex gap-2 items-end flex-wrap">
                        <div className="flex-1 min-w-40">
                          <Label htmlFor="doc-name" className="text-xs text-muted-foreground mb-1 block">Document Name</Label>
                          <Input
                            id="doc-name"
                            value={newDocName}
                            onChange={(e) => setNewDocName(e.target.value)}
                            placeholder="e.g. Financial Model Q4"
                            className="bg-background/50 border-white/10 h-8 text-sm"
                          />
                        </div>
                        <div className="w-40">
                          <Label htmlFor="doc-category" className="text-xs text-muted-foreground mb-1 block">Category</Label>
                          <Input
                            id="doc-category"
                            value={newDocCategory}
                            onChange={(e) => setNewDocCategory(e.target.value)}
                            placeholder="e.g. Financials"
                            className="bg-background/50 border-white/10 h-8 text-sm"
                            data-testid="input-new-doc-category"
                          />
                        </div>
                        <div className="flex items-center gap-2 pb-0.5">
                          <Checkbox
                            id="doc-nda"
                            checked={newDocNdaRequired}
                            onCheckedChange={(v) => setNewDocNdaRequired(v === true)}
                          />
                          <Label htmlFor="doc-nda" className="text-xs text-muted-foreground cursor-pointer">NDA required</Label>
                        </div>
                        <ObjectUploader
                          maxNumberOfFiles={1}
                          onGetUploadParameters={async (file) => {
                            const res = await requestUploadUrl.mutateAsync({
                              data: { name: file.name, size: file.size ?? 1, contentType: file.type || 'application/octet-stream' },
                            });
                            return { method: 'PUT' as const, url: res.uploadURL, headers: { 'Content-Type': file.type || 'application/octet-stream' } };
                          }}
                          onComplete={(result) => {
                            const uploaded = (result.successful ?? [])[0];
                            if (!uploaded || !newDocName.trim()) return;
                            const objectPath = (uploaded.response?.body as { objectPath?: string })?.objectPath
                              ?? uploaded.uploadURL?.split('?')[0].split('/').slice(-2).join('/') ?? undefined;
                            createDoc.mutate(
                              {
                                id,
                                data: {
                                  name: newDocName.trim(),
                                  category: newDocCategory.trim() || 'document',
                                  sizeKb: Math.round((uploaded.size ?? 0) / 1024),
                                  ndaRequired: newDocNdaRequired,
                                  objectPath: objectPath ?? '',
                                  contentType: uploaded.type || 'application/octet-stream',
                                },
                              },
                              {
                                onSuccess: () => {
                                  toast({ title: "Document Added", description: `${newDocName} uploaded to the data room.` });
                                  setNewDocName("");
                                  setNewDocCategory("");
                                  setNewDocNdaRequired(false);
                                  queryClient.invalidateQueries({ queryKey: getListDealDocumentsQueryKey(id) });
                                  invalidateAdvisory();
                                },
                                onError: () => {
                                  toast({ title: "Upload failed", description: "Could not register the document.", variant: "destructive" });
                                },
                              },
                            );
                          }}
                          buttonClassName="h-8 px-3 text-sm border border-white/10 rounded-md bg-primary/10 text-primary hover:bg-primary/20"
                        >
                          <Upload className="w-3.5 h-3.5 mr-1.5" />
                          {newDocName.trim() ? "Upload File" : "Choose File"}
                        </ObjectUploader>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          )}
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
            {effectiveAccess === "nda_sent" && !showNda && (
              <div className="p-4 rounded-xl bg-background border border-primary/30 text-center space-y-3">
                <FileSignature className="w-6 h-6 text-primary mx-auto" />
                <p className="font-medium text-primary">NDA Ready for Signature</p>
                <p className="text-xs text-muted-foreground">The broker has sent you the NDA. Review and sign it to unlock the full data room.</p>
                <Button onClick={() => setShowNda(true)} className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-bold shadow-[0_0_20px_rgba(200,169,90,0.3)]" data-testid="button-review-sign-nda">
                  <FileSignature className="w-4 h-4 mr-2" /> Review & Sign NDA
                </Button>
              </div>
            )}
            {effectiveAccess === "nda_sent" && showNda && (
              <form onSubmit={handleSignNda} className="space-y-4" data-testid="form-sign-nda">
                <div className="p-4 rounded-xl bg-background/70 border border-white/10 max-h-48 overflow-y-auto text-xs text-muted-foreground leading-relaxed space-y-2">
                  <p className="font-semibold text-foreground uppercase tracking-wider">{NDA_TITLE}</p>
                  {NDA_PARAGRAPHS.map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="nda-signer" className="text-xs uppercase tracking-wider text-muted-foreground">Full Legal Name</Label>
                  <Input id="nda-signer" required value={signerName} onChange={(e) => setSignerName(e.target.value)} placeholder="Type your full name to sign" className="bg-background/50 border-white/10" data-testid="input-nda-signer-name" />
                </div>
                <div className="flex items-start gap-2">
                  <Checkbox id="nda-agree" checked={agreed} onCheckedChange={(v) => setAgreed(v === true)} className="mt-0.5" data-testid="checkbox-nda-agree" />
                  <Label htmlFor="nda-agree" className="text-xs text-muted-foreground leading-snug cursor-pointer">I have read and agree to the terms of this Non-Disclosure Agreement, and my typed name constitutes my electronic signature.</Label>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="ghost" onClick={() => setShowNda(false)} className="flex-1 border border-white/10">Back</Button>
                  <Button type="submit" disabled={signNda.isPending || !signerName.trim() || !agreed} className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 font-bold" data-testid="button-sign-nda">
                    {signNda.isPending ? "Signing..." : "Sign NDA"}
                  </Button>
                </div>
              </form>
            )}
            {effectiveAccess === "requested" && (
              <div className="p-4 rounded-xl bg-background border border-primary/20 text-center space-y-3">
                <Clock className="w-6 h-6 text-primary mx-auto animate-pulse" />
                <p className="font-medium text-primary">Request Pending</p>
                <p className="text-xs text-muted-foreground">The broker is reviewing your profile. You will be notified when the NDA is ready to sign.</p>
              </div>
            )}
            {effectiveAccess === "rejected" && (
              <div className="p-4 rounded-xl bg-destructive/5 border border-destructive/20 text-center space-y-2">
                <AlertCircle className="w-6 h-6 text-destructive mx-auto" />
                <p className="font-medium text-destructive">Request Declined</p>
                <p className="text-xs text-muted-foreground">The broker declined your access request for this deal.</p>
              </div>
            )}
            {deal.confidential && effectiveAccess === "granted" && (
              <div className="p-4 rounded-xl bg-primary/10 border border-primary/30 text-center">
                <CheckCircle2 className="w-6 h-6 text-primary mx-auto mb-2" />
                <p className="font-medium text-primary mb-1">Access Granted</p>
                <p className="text-xs text-muted-foreground">You have full access to this confidential data room.</p>
              </div>
            )}
            {mySignedRequest && (
              <a href={`/api/access-requests/${mySignedRequest.id}/nda-record`} target="_blank" rel="noopener noreferrer" className="block mt-3">
                <Button variant="outline" className="w-full border-white/10 hover:bg-primary/10 hover:text-primary hover:border-primary/30" data-testid="button-view-nda-record">
                  <FileText className="w-4 h-4 mr-2" /> View Signed NDA
                </Button>
              </a>
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
            {deal.brokerProfileId != null ? (
              <Button asChild variant="outline" className="w-full border-white/10" data-testid="button-view-broker-profile">
                <Link href={`/demo/brokers/${deal.brokerProfileId}`}>View Broker Profile</Link>
              </Button>
            ) : (
              <Button asChild variant="outline" className="w-full border-white/10">
                <Link href="/demo/brokers">View Broker Directory</Link>
              </Button>
            )}
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
