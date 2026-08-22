import { useState } from "react";
import { useLocation } from "wouter";
import { useCreateDeal } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Building2, UploadCloud, Lock, CheckCircle2 } from "lucide-react";

export default function DealCreate() {
  const [, setLocation] = useLocation();
  const createDeal = useCreateDeal();
  const [formData, setFormData] = useState({
    title: "",
    dealType: "sale",
    assetClass: "Hotels",
    country: "",
    city: "",
    askingPrice: "",
    currency: "EUR",
    confidential: true,
    locationPrivacy: "country_only",
    teaser: "",
    description: ""
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createDeal.mutate({
      data: {
        ...formData,
        askingPrice: formData.askingPrice ? Number(formData.askingPrice) * 1_000_000 : undefined,
      } as any
    }, {
      onSuccess: (deal) => {
        setLocation(`/demo/deals/${deal.id}`);
      }
    });
  };

  return (
    <div className="p-8 max-w-4xl mx-auto pb-24">
      <Button variant="ghost" onClick={() => setLocation('/demo/deals')} className="mb-6 -ml-4 text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4 mr-2" /> Back to Deals
      </Button>

      <div className="mb-8">
        <h1 className="text-3xl font-heading font-bold text-foreground">Create Confidential Deal</h1>
        <p className="text-muted-foreground mt-2">List an off-market opportunity securely to verified investors.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        <Card className="bg-card/50 backdrop-blur border-white/5 overflow-hidden">
          <div className="bg-primary/5 p-4 border-b border-primary/10 flex items-start gap-4">
            <Lock className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div>
              <h3 className="font-heading font-semibold text-primary">Confidentiality Settings</h3>
              <p className="text-sm text-muted-foreground mt-1">Control how this deal is presented before an NDA is signed.</p>
            </div>
          </div>
          <CardContent className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="deal-confidential" className="text-base font-semibold">Strictly Off-Market</Label>
                <p className="text-sm text-muted-foreground">Require NDA signature before revealing details and data room.</p>
              </div>
              <Switch id="deal-confidential" checked={formData.confidential} onCheckedChange={(c) => setFormData(f => ({ ...f, confidential: c }))} className="data-[state=checked]:bg-primary" />
            </div>
            
            {formData.confidential && (
              <div className="pt-4 border-t border-white/5">
                <Label htmlFor="deal-location-privacy" className="mb-3 block text-sm font-semibold text-muted-foreground uppercase tracking-wider">Public Location Display</Label>
                <Select value={formData.locationPrivacy} onValueChange={(v) => setFormData(f => ({ ...f, locationPrivacy: v }))}>
                  <SelectTrigger id="deal-location-privacy" className="bg-background/50 border-white/10 max-w-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="country_only">Country Only (e.g. "Germany")</SelectItem>
                    <SelectItem value="region_only">Region Only (e.g. "Bavaria, Germany")</SelectItem>
                    <SelectItem value="city_only">City & Country (e.g. "Munich, Germany")</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur border-white/5">
          <CardContent className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2 col-span-full">
                <Label htmlFor="deal-title">Internal Title (Visible after NDA)</Label>
                <Input 
                  id="deal-title"
                  required 
                  value={formData.title} 
                  onChange={e => setFormData(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Prime Office Portfolio Munich"
                  className="bg-background/50 border-white/10"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="deal-asset-class">Asset Class</Label>
                <Select value={formData.assetClass} onValueChange={(v) => setFormData(f => ({ ...f, assetClass: v }))}>
                  <SelectTrigger id="deal-asset-class" className="bg-background/50 border-white/10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Offices">Offices</SelectItem>
                    <SelectItem value="Hotels">Hotels & Resorts</SelectItem>
                    <SelectItem value="Logistics">Logistics</SelectItem>
                    <SelectItem value="Residential">Residential</SelectItem>
                    <SelectItem value="Retail">Retail</SelectItem>
                    <SelectItem value="Mixed-use">Mixed-use</SelectItem>
                    <SelectItem value="mixed">Mixed Use</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="deal-type">Transaction Type</Label>
                <Select value={formData.dealType} onValueChange={(v) => setFormData(f => ({ ...f, dealType: v }))}>
                  <SelectTrigger id="deal-type" className="bg-background/50 border-white/10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sale">Asset Sale</SelectItem>
                    <SelectItem value="share_deal">Share Deal</SelectItem>
                    <SelectItem value="forward_funding">Forward Funding</SelectItem>
                    <SelectItem value="joint_venture">Joint Venture</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="deal-country">Country</Label>
                <Input id="deal-country" required value={formData.country} onChange={e => setFormData(f => ({ ...f, country: e.target.value }))} className="bg-background/50 border-white/10" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="deal-city">City</Label>
                <Input id="deal-city" required value={formData.city} onChange={e => setFormData(f => ({ ...f, city: e.target.value }))} className="bg-background/50 border-white/10" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="deal-price">Asking Price (Millions)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">€</span>
                  <Input id="deal-price" type="number" step="0.1" value={formData.askingPrice} onChange={e => setFormData(f => ({ ...f, askingPrice: e.target.value }))} className="pl-8 bg-background/50 border-white/10" placeholder="e.g. 45.5" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">M</span>
                </div>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="deal-teaser">Public Teaser (Visible before NDA)</Label>
              <Textarea 
                id="deal-teaser"
                value={formData.teaser} 
                onChange={e => setFormData(f => ({ ...f, teaser: e.target.value }))}
                placeholder="A brief, sanitized description that doesn't reveal the exact asset..."
                className="h-24 bg-background/50 border-white/10 resize-none" 
              />
            </div>
          </CardContent>
        </Card>
        
        <div className="flex justify-end gap-4">
          <Button type="button" variant="ghost" onClick={() => setLocation('/demo/deals')}>Cancel</Button>
          <Button type="submit" disabled={createDeal.isPending} className="bg-primary text-primary-foreground hover:bg-primary/90 px-8 font-bold">
            {createDeal.isPending ? "Creating..." : "Create Deal"}
          </Button>
        </div>
      </form>
    </div>
  );
}
