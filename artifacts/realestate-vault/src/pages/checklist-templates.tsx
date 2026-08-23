import { useState } from "react";
import {
  useListChecklistTemplates,
  useCreateChecklistTemplate,
  useDeleteChecklistTemplate,
  getListChecklistTemplatesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { ClipboardList, Plus, Trash2, X } from "lucide-react";

interface ItemDraft {
  category: string;
  name: string;
  required: boolean;
}

export default function ChecklistTemplates() {
  const { data: templates, isLoading } = useListChecklistTemplates({
    query: { queryKey: getListChecklistTemplatesQueryKey(), retry: false },
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", assetClass: "", country: "", dealType: "", transactionStructure: "" });
  const [items, setItems] = useState<ItemDraft[]>([{ category: "", name: "", required: true }]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListChecklistTemplatesQueryKey() });
  const createTemplate = useCreateChecklistTemplate({
    mutation: {
      onSuccess: () => {
        toast({ title: "Template created" });
        setShowForm(false);
        setForm({ name: "", assetClass: "", country: "", dealType: "", transactionStructure: "" });
        setItems([{ category: "", name: "", required: true }]);
        invalidate();
      },
      onError: () => toast({ title: "Could not create the template", variant: "destructive" }),
    },
  });
  const deleteTemplate = useDeleteChecklistTemplate({
    mutation: {
      onSuccess: invalidate,
      onError: () => toast({ title: "Could not delete the template", description: "Only the template owner can delete it.", variant: "destructive" }),
    },
  });

  const validItems = items.filter((i) => i.category.trim() && i.name.trim());

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-heading font-bold flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-primary" /> Checklist Templates
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Document checklists applied to deals by asset class, country and deal type. They drive each deal's Document Readiness score.
          </p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)} data-testid="button-new-template">
          <Plus className="w-4 h-4 mr-1.5" /> New template
        </Button>
      </div>

      {showForm && (
        <form
          className="rounded-xl border border-white/10 bg-card/40 p-5 space-y-4"
          data-testid="form-new-template"
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.name.trim() || validItems.length === 0) {
              toast({ title: "Add a name and at least one complete item", variant: "destructive" });
              return;
            }
            createTemplate.mutate({
              data: {
                name: form.name.trim(),
                assetClass: form.assetClass.trim() || undefined,
                country: form.country.trim() || undefined,
                dealType: form.dealType.trim() || undefined,
                transactionStructure: form.transactionStructure.trim() || undefined,
                items: validItems.map((i) => ({ category: i.category.trim(), name: i.name.trim(), required: i.required })),
              },
            });
          }}
        >
          <div className="grid md:grid-cols-4 gap-3">
            <div className="space-y-1 md:col-span-2">
              <Label className="text-xs text-muted-foreground">Name</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="h-8 text-sm bg-background/50 border-white/10" data-testid="input-template-name" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Asset class (optional)</Label>
              <Input value={form.assetClass} onChange={(e) => setForm((f) => ({ ...f, assetClass: e.target.value }))} placeholder="any" className="h-8 text-sm bg-background/50 border-white/10" data-testid="input-template-asset-class" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Country (optional)</Label>
              <Input value={form.country} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))} placeholder="any" className="h-8 text-sm bg-background/50 border-white/10" data-testid="input-template-country" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Deal type (optional)</Label>
              <Input value={form.dealType} onChange={(e) => setForm((f) => ({ ...f, dealType: e.target.value }))} placeholder="any, e.g. single_asset" className="h-8 text-sm bg-background/50 border-white/10" data-testid="input-template-deal-type" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Structure (optional)</Label>
              <Input value={form.transactionStructure} onChange={(e) => setForm((f) => ({ ...f, transactionStructure: e.target.value }))} placeholder="any, e.g. share_deal" className="h-8 text-sm bg-background/50 border-white/10" data-testid="input-template-structure" />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Checklist items (category must match data-room document categories)</Label>
            {items.map((item, i) => (
              <div key={i} className="flex gap-2 items-center">
                <Input value={item.name} onChange={(e) => setItems((arr) => arr.map((it, j) => (j === i ? { ...it, name: e.target.value } : it)))} placeholder="Item name, e.g. Rent roll" className="h-8 text-sm bg-background/50 border-white/10 flex-1" data-testid={`input-item-name-${i}`} />
                <Input value={item.category} onChange={(e) => setItems((arr) => arr.map((it, j) => (j === i ? { ...it, category: e.target.value } : it)))} placeholder="Category, e.g. Financials" className="h-8 text-sm bg-background/50 border-white/10 w-44" data-testid={`input-item-category-${i}`} />
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap">
                  <Checkbox checked={item.required} onCheckedChange={(v) => setItems((arr) => arr.map((it, j) => (j === i ? { ...it, required: v === true } : it)))} />
                  required
                </label>
                <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setItems((arr) => arr.filter((_, j) => j !== i))} disabled={items.length === 1}>
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs border-white/10" onClick={() => setItems((arr) => [...arr, { category: "", name: "", required: true }])} data-testid="button-add-item">
              <Plus className="w-3 h-3 mr-1" /> Add item
            </Button>
          </div>
          <Button type="submit" size="sm" disabled={createTemplate.isPending} data-testid="button-save-template">
            {createTemplate.isPending ? "Saving…" : "Create template"}
          </Button>
        </form>
      )}

      {isLoading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : !templates || templates.length === 0 ? (
        <p className="text-sm text-muted-foreground py-10 text-center border border-dashed border-white/10 rounded-xl">
          No checklist templates yet. Create one to start tracking document readiness on your deals.
        </p>
      ) : (
        <div className="space-y-4">
          {templates.map((t) => (
            <div key={t.id} className="rounded-xl border border-white/5 bg-card/30 p-4" data-testid={`row-template-${t.id}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-heading font-semibold">{t.name}</p>
                  <div className="flex gap-1.5 mt-1 flex-wrap">
                    <Badge variant="outline" className="text-[10px] border-white/10 text-muted-foreground">{t.assetClass ?? "Any asset class"}</Badge>
                    <Badge variant="outline" className="text-[10px] border-white/10 text-muted-foreground">{t.country ?? "Any country"}</Badge>
                    <Badge variant="outline" className="text-[10px] border-white/10 text-muted-foreground">{t.dealType ?? "Any deal type"}</Badge>
                    <Badge variant="outline" className="text-[10px] border-white/10 text-muted-foreground">{t.transactionStructure ?? "Any structure"}</Badge>
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive" onClick={() => deleteTemplate.mutate({ id: t.id })} data-testid={`button-delete-template-${t.id}`}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
              <ul className="mt-3 space-y-1">
                {t.items.map((item) => (
                  <li key={item.id} className="text-sm text-muted-foreground flex items-center gap-2">
                    <span className="w-1 h-1 rounded-full bg-primary/60" />
                    {item.name}
                    <span className="text-[10px] uppercase">{item.category}{item.required ? "" : " · optional"}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
