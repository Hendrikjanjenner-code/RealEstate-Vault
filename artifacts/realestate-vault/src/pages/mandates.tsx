import { formatMillions } from "@/lib/utils";
import { useState } from "react";
import { Link } from "wouter";
import { useListMandates, useCreateMandate, getListMandatesQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Plus, Target, Building2, MapPin, Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQueryClient } from "@tanstack/react-query";

export default function Mandates() {
  const { data: mandates, isLoading } = useListMandates();
  const [open, setOpen] = useState(false);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-bold">Acquisition Mandates</h1>
          <p className="text-muted-foreground mt-1">Verified investor requirements and buy-side mandates.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold">
              <Plus className="w-4 h-4 mr-2" /> New Mandate
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-white/5 text-foreground max-w-2xl">
            <DialogHeader>
              <DialogTitle className="font-heading">Create Acquisition Mandate</DialogTitle>
            </DialogHeader>
            <CreateMandateForm onSuccess={() => setOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-64 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {mandates?.map((mandate) => (
            <Card key={mandate.id} className="bg-card/30 backdrop-blur border-white/5 flex flex-col h-full hover:border-primary/30 transition-colors">
              <CardContent className="p-6 flex-1 flex flex-col">
                <div className="flex justify-between items-start mb-4">
                  <Badge variant="outline" className={`
                    ${mandate.status === 'active' ? 'bg-primary/10 text-primary border-primary/20' : 'bg-muted/10 text-muted-foreground border-white/10'}
                  `}>
                    {mandate.status.toUpperCase()}
                  </Badge>
                  <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                    {mandate.matches} Matches
                  </span>
                </div>
                
                <h3 className="font-heading font-bold text-xl mb-2">{mandate.title}</h3>
                <p className="text-sm text-foreground/80 mb-6 font-medium">
                  {mandate.investorType.replace('_', ' ')} • {mandate.investorName}
                </p>

                <div className="grid grid-cols-2 gap-y-4 gap-x-6 mb-6">
                  <div>
                     <div className="flex items-center gap-1.5 text-muted-foreground text-xs uppercase tracking-wider font-semibold mb-1">
                       <Target className="w-3.5 h-3.5" /> Target Volume
                     </div>
                     <p className="font-medium">{formatMillions(mandate.minSize)} - {formatMillions(mandate.maxSize)}</p>
                  </div>
                  <div>
                     <div className="flex items-center gap-1.5 text-muted-foreground text-xs uppercase tracking-wider font-semibold mb-1">
                       <Target className="w-3.5 h-3.5" /> Strategy
                     </div>
                     <p className="font-medium capitalize">{mandate.strategy.replace('_', ' ')}</p>
                  </div>
                  <div className="col-span-2">
                     <div className="flex items-center gap-1.5 text-muted-foreground text-xs uppercase tracking-wider font-semibold mb-2">
                       <Building2 className="w-3.5 h-3.5" /> Asset Classes
                     </div>
                     <div className="flex gap-2 flex-wrap">
                       {mandate.assetClasses.map(ac => (
                         <Badge key={ac} variant="secondary" className="bg-background border-white/5 text-xs font-normal">
                           {ac.replace('_', ' ')}
                         </Badge>
                       ))}
                     </div>
                  </div>
                  <div className="col-span-2">
                     <div className="flex items-center gap-1.5 text-muted-foreground text-xs uppercase tracking-wider font-semibold mb-2">
                       <MapPin className="w-3.5 h-3.5" /> Geographies
                     </div>
                     <div className="flex gap-2 flex-wrap">
                       {mandate.countries.map(c => (
                         <Badge key={c} variant="secondary" className="bg-background border-white/5 text-xs font-normal">
                           {c}
                         </Badge>
                       ))}
                     </div>
                  </div>
                </div>

                <div className="mt-auto pt-4 border-t border-white/5 flex gap-3">
                  <Button asChild className="flex-1 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground border border-primary/20">
                    <Link href={`/demo/mandates/${mandate.id}/matches`}>
                      <Search className="w-4 h-4 mr-2" /> Find Matches
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

const ASSET_CLASS_OPTIONS = ["Hotels", "Offices", "Logistics", "Residential", "Retail", "Mixed-use"];
const COUNTRY_OPTIONS = ["Germany", "Austria", "Switzerland", "Netherlands", "France", "Italy", "Spain", "Portugal", "Sweden"];

function MultiSelectChips({ options, selected, onToggle }: { options: string[]; selected: string[]; onToggle: (value: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const isSelected = selected.includes(option);
        return (
          <button
            key={option}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onToggle(option)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              isSelected
                ? "bg-primary/15 text-primary border-primary/40"
                : "bg-background/50 text-muted-foreground border-white/10 hover:border-white/25 hover:text-foreground"
            }`}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

function CreateMandateForm({ onSuccess }: { onSuccess: () => void }) {
  const createMandate = useCreateMandate();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    title: "",
    investorName: "",
    investorType: "family_office",
    minSize: "",
    maxSize: "",
    strategy: "core",
    yieldTarget: "",
  });
  const [assetClasses, setAssetClasses] = useState<string[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [selectionError, setSelectionError] = useState<string | null>(null);

  const toggle = (setter: React.Dispatch<React.SetStateAction<string[]>>) => (value: string) => {
    setSelectionError(null);
    setter((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (assetClasses.length === 0 || countries.length === 0) {
      setSelectionError("Select at least one asset class and one country.");
      return;
    }
    const { yieldTarget, ...rest } = formData;
    createMandate.mutate({
      data: {
        ...rest,
        minSize: Number(formData.minSize) * 1_000_000,
        maxSize: Number(formData.maxSize) * 1_000_000,
        assetClasses,
        countries,
        ...(yieldTarget !== "" ? { yieldTarget: Number(yieldTarget) } : {}),
      } as any
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMandatesQueryKey() });
        onSuccess();
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-4">
      <div className="space-y-2">
        <Label>Mandate Title</Label>
        <Input required value={formData.title} onChange={e => setFormData(f => ({ ...f, title: e.target.value }))} className="bg-background/50 border-white/10" placeholder="e.g. Core European Office Acquisition" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Investor Name (Confidential)</Label>
          <Input required value={formData.investorName} onChange={e => setFormData(f => ({ ...f, investorName: e.target.value }))} className="bg-background/50 border-white/10" />
        </div>
        <div className="space-y-2">
          <Label>Investor Type</Label>
          <Select value={formData.investorType} onValueChange={(v) => setFormData(f => ({ ...f, investorType: v }))}>
            <SelectTrigger className="bg-background/50 border-white/10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="institutional">Institutional Fund</SelectItem>
              <SelectItem value="family_office">Family Office</SelectItem>
              <SelectItem value="private_equity">Private Equity</SelectItem>
              <SelectItem value="reit">REIT</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Min Size (€M)</Label>
          <Input required type="number" value={formData.minSize} onChange={e => setFormData(f => ({ ...f, minSize: e.target.value }))} className="bg-background/50 border-white/10" />
        </div>
        <div className="space-y-2">
          <Label>Max Size (€M)</Label>
          <Input required type="number" value={formData.maxSize} onChange={e => setFormData(f => ({ ...f, maxSize: e.target.value }))} className="bg-background/50 border-white/10" />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Asset Classes</Label>
        <MultiSelectChips options={ASSET_CLASS_OPTIONS} selected={assetClasses} onToggle={toggle(setAssetClasses)} />
      </div>
      <div className="space-y-2">
        <Label>Countries</Label>
        <MultiSelectChips options={COUNTRY_OPTIONS} selected={countries} onToggle={toggle(setCountries)} />
      </div>
      {selectionError && <p className="text-sm text-destructive">{selectionError}</p>}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Yield Target % (Optional)</Label>
          <Input type="number" step="0.1" min="0" value={formData.yieldTarget} onChange={e => setFormData(f => ({ ...f, yieldTarget: e.target.value }))} className="bg-background/50 border-white/10" placeholder="e.g. 5.0" />
        </div>
        <div className="space-y-2">
          <Label>Risk Strategy</Label>
        <Select value={formData.strategy} onValueChange={(v) => setFormData(f => ({ ...f, strategy: v }))}>
          <SelectTrigger className="bg-background/50 border-white/10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="core">Core</SelectItem>
            <SelectItem value="core_plus">Core+</SelectItem>
            <SelectItem value="value_add">Value Add</SelectItem>
            <SelectItem value="opportunistic">Opportunistic</SelectItem>
          </SelectContent>
        </Select>
        </div>
      </div>
      <div className="pt-4 flex justify-end gap-3 border-t border-white/5">
        <Button type="button" variant="ghost" onClick={onSuccess}>Cancel</Button>
        <Button type="submit" disabled={createMandate.isPending} className="bg-primary text-primary-foreground">
          {createMandate.isPending ? "Saving..." : "Create Mandate"}
        </Button>
      </div>
    </form>
  );
}
