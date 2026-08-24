import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { formatMillions } from "@/lib/utils";
import {
  useListBrokers,
  useListOwnerAssignments,
  useCreateBrokerConnection,
  getListBrokerConnectionsQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
import { TrustBadge } from "@/components/trust-badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ShieldCheck, MapPin, Handshake, Star, Building2, Send } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Link } from "wouter";

function ConnectDialog({ brokerId, brokerName }: { brokerId: number; brokerName: string }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [assignmentId, setAssignmentId] = useState<string>("none");
  const { data: assignments } = useListOwnerAssignments();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const connect = useCreateBrokerConnection({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListBrokerConnectionsQueryKey() });
        setOpen(false);
        setMessage("");
        setAssignmentId("none");
        toast({
          title: "Request sent",
          description: `${brokerName} has been notified of your connection request.`,
        });
      },
      onError: () =>
        toast({ title: "Could not send the request", description: "Please try again.", variant: "destructive" }),
    },
  });

  const openAssignments = assignments?.filter((a) => a.isOwn && a.status === "open") ?? [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full border-white/10" data-testid={`button-connect-${brokerId}`}>
          <Send className="w-4 h-4 mr-2" /> Connect
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg bg-card border-white/10">
        <DialogHeader>
          <DialogTitle className="font-heading">Connect with {brokerName}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          {openAssignments.length > 0 && (
            <div className="grid gap-2">
              <Label htmlFor="connect-assignment">About an assignment (optional)</Label>
              <Select value={assignmentId} onValueChange={setAssignmentId}>
                <SelectTrigger id="connect-assignment" data-testid="select-connect-assignment"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">General introduction</SelectItem>
                  {openAssignments.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>{a.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="connect-message">Message</Label>
            <Textarea
              id="connect-message"
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Introduce yourself and describe what you are looking for..."
              data-testid="input-connect-message"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={() =>
              connect.mutate({
                data: {
                  brokerId,
                  assignmentId: assignmentId === "none" ? null : Number(assignmentId),
                  message,
                },
              })
            }
            disabled={connect.isPending || message.trim().length === 0}
            data-testid="button-send-connect"
          >
            <Send className="w-4 h-4 mr-2" /> Send Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Brokers() {
  const { data: brokers, isLoading } = useListBrokers();
  const { user } = useAuth();
  const isOwner = user?.role === "owner";

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
            <Card key={broker.id} className="relative bg-card/30 backdrop-blur border-white/5 overflow-hidden group hover:border-primary/30 transition-colors h-full">
              <Link
                href={`/demo/brokers/${broker.id}`}
                className="absolute inset-0 z-[1] outline-none focus-visible:ring-2 focus-visible:ring-primary/60 rounded-xl"
                aria-label={`View profile of ${broker.name}`}
                data-testid={`link-broker-card-${broker.id}`}
              />
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
                        <div className="mt-1">
                          <TrustBadge professionalId={broker.id} />
                        </div>
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
                  <div className="mt-6 space-y-2 relative z-10">
                    <span aria-hidden="true" className="inline-flex items-center justify-center h-9 px-4 py-2 rounded-md text-sm w-full bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground border border-primary/20 font-semibold pointer-events-none" data-testid={`button-view-profile-${broker.id}`}>
                      View Profile
                    </span>
                    {isOwner && <ConnectDialog brokerId={broker.id} brokerName={broker.name} />}
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
