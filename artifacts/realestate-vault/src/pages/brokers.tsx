import { formatMillions } from "@/lib/utils";
import { useListBrokers } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ShieldCheck, MapPin, Handshake, Star, Building2, Send } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Link } from "wouter";

export default function Brokers() {
  const { data: brokers, isLoading } = useListBrokers();

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-bold">Verified Brokers</h1>
          <p className="text-muted-foreground mt-1">Connect with top-performing commercial real estate professionals.</p>
        </div>
        <div className="w-full md:w-72">
          <Input placeholder="Search by name, company or city..." className="bg-card border-white/5" />
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-64 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {brokers?.map((broker) => (
            <Card key={broker.id} className="bg-card/30 backdrop-blur border-white/5 overflow-hidden group hover:border-primary/30 transition-colors">
              <CardContent className="p-0 flex flex-col md:flex-row h-full">
                <div className="p-6 md:w-2/3 border-b md:border-b-0 md:border-r border-white/5 flex flex-col">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-4">
                      <Avatar className="w-16 h-16 border-2 border-primary/20">
                        <AvatarImage src={broker.avatarUrl || undefined} />
                        <AvatarFallback className="bg-background text-primary font-heading font-bold text-xl">
                          {broker.name.split(' ').map(n => n[0]).join('')}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <h3 className="font-heading font-bold text-lg leading-tight flex items-center gap-2">
                          {broker.name}
                          {broker.verified && <ShieldCheck className="w-4 h-4 text-primary" />}
                          {broker.isDemo && (
                            <Badge variant="outline" className="text-[10px] uppercase tracking-wider border-white/20 text-muted-foreground font-semibold">
                              Demo
                            </Badge>
                          )}
                        </h3>
                        <p className="text-sm font-medium text-muted-foreground">{broker.title}</p>
                        <p className="text-xs text-muted-foreground/80 flex items-center gap-1 mt-1">
                          <Building2 className="w-3 h-3" /> {broker.company}
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-4 mb-6">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-2">Specialisations</p>
                    <div className="flex gap-2 flex-wrap">
                      {broker.specialisations.map(spec => (
                        <Badge key={spec} variant="secondary" className="bg-background border-white/5 text-xs font-normal">
                          {spec}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="mt-auto flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <MapPin className="w-4 h-4" /> {broker.city}, {broker.country}
                    </div>
                    <div className="flex items-center gap-1">
                      <Star className="w-4 h-4 text-primary" /> {broker.yearsExperience} Years Exp.
                    </div>
                  </div>
                </div>

                <div className="p-6 md:w-1/3 bg-background/20 flex flex-col justify-between">
                  <div className="space-y-4">
                    <div className="text-center p-3 rounded-xl bg-background border border-white/5">
                      <div className="text-2xl font-heading font-bold text-foreground">
                        {broker.score}/100
                      </div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Reputation Score</div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Closed Deals</span>
                        <span className="font-bold">{broker.closedDeals}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Tx Volume</span>
                        <span className="font-bold">{formatMillions(broker.transactionVolume)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-6 space-y-2">
                    <Button asChild className="w-full bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground border border-primary/20" data-testid={`button-view-profile-${broker.id}`}>
                      <Link href={`/demo/brokers/${broker.id}`}>View Profile</Link>
                    </Button>
                    <Button variant="outline" className="w-full border-white/10">
                      <Send className="w-4 h-4 mr-2" /> Message
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
