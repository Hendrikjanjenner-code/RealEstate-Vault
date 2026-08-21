import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMyBrokerProfile,
  useUpsertMyBrokerProfile,
  getGetMyBrokerProfileQueryKey,
  getListBrokersQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { BadgeCheck, UserRound } from "lucide-react";

export default function BrokerProfile() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useGetMyBrokerProfile();
  const upsert = useUpsertMyBrokerProfile();

  const profile = data?.profile ?? null;

  const [form, setForm] = useState({
    name: "",
    company: "",
    title: "",
    city: "",
    country: "",
    yearsExperience: "",
    specialisations: "",
    bio: "",
  });

  useEffect(() => {
    if (isLoading) return;
    if (profile) {
      setForm({
        name: profile.name,
        company: profile.company,
        title: profile.title,
        city: profile.city,
        country: profile.country,
        yearsExperience: String(profile.yearsExperience ?? 0),
        specialisations: profile.specialisations.join(", "),
        bio: profile.bio ?? "",
      });
    } else {
      const displayName =
        [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
        user?.email ||
        "";
      setForm((f) => ({ ...f, name: f.name || displayName }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, profile?.id]);

  if (user?.role !== "broker") {
    return (
      <div className="p-8 max-w-3xl mx-auto text-center text-muted-foreground">
        Only broker accounts have a directory profile.
      </div>
    );
  }

  const set = (key: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => setForm({ ...form, [key]: e.target.value });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    upsert.mutate(
      {
        data: {
          name: form.name.trim(),
          company: form.company.trim(),
          title: form.title.trim(),
          city: form.city.trim(),
          country: form.country.trim(),
          yearsExperience: form.yearsExperience
            ? Math.max(0, parseInt(form.yearsExperience, 10) || 0)
            : 0,
          specialisations: form.specialisations
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          bio: form.bio.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMyBrokerProfileQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListBrokersQueryKey() });
          toast({ title: "Profile saved", description: "Your directory profile is now live and linked to your listings." });
        },
        onError: () => {
          toast({ title: "Could not save profile", description: "Please check the required fields and try again.", variant: "destructive" });
        },
      },
    );
  };

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-heading font-bold flex items-center gap-3">
          <UserRound className="w-7 h-7 text-primary" /> My Broker Profile
        </h1>
        <p className="text-muted-foreground mt-1">
          This profile appears in the broker directory and on every deal you list.
        </p>
        {profile && (
          <Badge className="mt-3 bg-primary/10 text-primary border border-primary/20">
            <BadgeCheck className="w-3.5 h-3.5 mr-1" /> Linked to your account
          </Badge>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : (
        <Card className="bg-card/30 backdrop-blur border-white/5">
          <CardHeader>
            <CardTitle className="font-heading text-lg">
              {profile ? "Edit profile" : "Create your profile"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label htmlFor="name">Full name *</Label>
                  <Input id="name" required value={form.name} onChange={set("name")} className="bg-background border-white/10" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company">Company *</Label>
                  <Input id="company" required value={form.company} onChange={set("company")} className="bg-background border-white/10" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="title">Job title *</Label>
                  <Input id="title" required value={form.title} onChange={set("title")} placeholder="e.g. Managing Partner" className="bg-background border-white/10" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="yearsExperience">Years of experience</Label>
                  <Input id="yearsExperience" type="number" min={0} value={form.yearsExperience} onChange={set("yearsExperience")} className="bg-background border-white/10" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="city">City *</Label>
                  <Input id="city" required value={form.city} onChange={set("city")} className="bg-background border-white/10" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="country">Country *</Label>
                  <Input id="country" required value={form.country} onChange={set("country")} className="bg-background border-white/10" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="specialisations">Specialisations</Label>
                <Input id="specialisations" value={form.specialisations} onChange={set("specialisations")} placeholder="Comma separated, e.g. Hotels, Offices" className="bg-background border-white/10" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bio">Bio</Label>
                <Textarea id="bio" rows={4} value={form.bio} onChange={set("bio")} placeholder="Tell investors about your track record and focus." className="bg-background border-white/10" />
              </div>
              <Button type="submit" disabled={upsert.isPending} className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold px-8">
                {upsert.isPending ? "Saving…" : profile ? "Save changes" : "Create profile"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
