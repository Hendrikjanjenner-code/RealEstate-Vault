import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListOwnerAssignments,
  getListOwnerAssignmentsQueryKey,
  useCreateOwnerAssignment,
  useUpdateOwnerAssignmentStatus,
  useListBrokerConnections,
  getListBrokerConnectionsQueryKey,
  useRespondBrokerConnection,
} from "@workspace/api-client-react";
import type { OwnerAssignment, BrokerConnection } from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import { useToast } from "@/hooks/use-toast";
import { formatMillions } from "@/lib/utils";
import { Building2, MapPin, Plus, Handshake, Check, X, Send } from "lucide-react";
import { Link } from "wouter";

const GOAL_LABELS: Record<string, string> = {
  sell: "For Sale",
  lease: "For Lease",
  valuation: "Valuation",
};

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    pending: "border-primary/30 text-primary bg-primary/10",
    accepted: "border-emerald-500/30 text-emerald-400 bg-emerald-500/10",
    declined: "border-white/10 text-muted-foreground bg-background",
    open: "border-emerald-500/30 text-emerald-400 bg-emerald-500/10",
    closed: "border-white/10 text-muted-foreground bg-background",
  };
  return (
    <Badge variant="outline" className={`uppercase text-[10px] tracking-wider font-semibold ${styles[status] ?? ""}`}>
      {status}
    </Badge>
  );
}

function AssignmentCard({
  assignment,
  actions,
}: {
  assignment: OwnerAssignment;
  actions?: React.ReactNode;
}) {
  return (
    <Card className="bg-card/30 backdrop-blur border-white/5" data-testid={`card-assignment-${assignment.id}`}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-heading font-bold text-lg">{assignment.title}</h3>
              {statusBadge(assignment.status)}
              <Badge variant="secondary" className="bg-background border-white/5 text-xs font-normal">
                {GOAL_LABELS[assignment.goal] ?? assignment.goal}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
              <span className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5" /> {assignment.propertyType}</span>
              <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {assignment.city}, {assignment.country}</span>
              {assignment.areaSqm != null && <span>{Math.round(assignment.areaSqm).toLocaleString()} sqm</span>}
              {assignment.indicativeValue != null && <span>Indicative: {formatMillions(assignment.indicativeValue)}</span>}
            </p>
            {assignment.description && (
              <p className="text-sm text-muted-foreground/90 mt-3 max-w-2xl">{assignment.description}</p>
            )}
            <p className="text-xs text-muted-foreground/70 mt-3">
              Posted by {assignment.ownerName}
              {assignment.ownerCompany ? ` (${assignment.ownerCompany})` : ""}
            </p>
          </div>
          {actions && <div className="shrink-0 flex flex-col gap-2">{actions}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function NewAssignmentDialog() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    propertyType: "Hotels",
    country: "",
    city: "",
    areaSqm: "",
    indicativeValue: "",
    goal: "sell",
    description: "",
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const create = useCreateOwnerAssignment({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListOwnerAssignmentsQueryKey() });
        setOpen(false);
        setForm({ title: "", propertyType: "Hotels", country: "", city: "", areaSqm: "", indicativeValue: "", goal: "sell", description: "" });
        toast({ title: "Assignment posted", description: "Brokers can now find your property assignment." });
      },
      onError: () =>
        toast({ title: "Could not post assignment", description: "Check the required fields and try again.", variant: "destructive" }),
    },
  });

  const submit = () => {
    create.mutate({
      data: {
        title: form.title,
        propertyType: form.propertyType,
        country: form.country,
        city: form.city,
        goal: form.goal as "sell" | "lease" | "valuation",
        areaSqm: form.areaSqm ? Number(form.areaSqm) : null,
        indicativeValue: form.indicativeValue ? Number(form.indicativeValue) : null,
        description: form.description || null,
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="button-new-assignment">
          <Plus className="w-4 h-4 mr-2" /> Post Assignment
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg bg-card border-white/10">
        <DialogHeader>
          <DialogTitle className="font-heading">Post a property assignment</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Title</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Boutique Hotel De Domtoren" data-testid="input-assignment-title" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Property type</Label>
              <Select value={form.propertyType} onValueChange={(v) => setForm({ ...form, propertyType: v })}>
                <SelectTrigger data-testid="select-assignment-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Hotels", "Offices", "Retail", "Residential", "Logistics", "Mixed-Use"].map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Goal</Label>
              <Select value={form.goal} onValueChange={(v) => setForm({ ...form, goal: v })}>
                <SelectTrigger data-testid="select-assignment-goal"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sell">Sell</SelectItem>
                  <SelectItem value="lease">Lease</SelectItem>
                  <SelectItem value="valuation">Valuation</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Country</Label>
              <Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} placeholder="Netherlands" data-testid="input-assignment-country" />
            </div>
            <div className="grid gap-2">
              <Label>City</Label>
              <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Utrecht" data-testid="input-assignment-city" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Area (sqm, optional)</Label>
              <Input type="number" min={0} value={form.areaSqm} onChange={(e) => setForm({ ...form, areaSqm: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label>Indicative value (EUR, optional)</Label>
              <Input type="number" min={0} value={form.indicativeValue} onChange={(e) => setForm({ ...form, indicativeValue: e.target.value })} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Description (optional)</Label>
            <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What should brokers know about this property?" />
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={submit}
            disabled={create.isPending || form.title.trim().length < 3 || !form.country.trim() || !form.city.trim()}
            data-testid="button-submit-assignment"
          >
            <Send className="w-4 h-4 mr-2" /> Post Assignment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConnectionRow({
  connection,
  side,
}: {
  connection: BrokerConnection;
  side: "owner" | "broker";
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const respond = useRespondBrokerConnection({
    mutation: {
      onSuccess: (updated) => {
        queryClient.invalidateQueries({ queryKey: getListBrokerConnectionsQueryKey() });
        toast({
          title: updated.status === "accepted" ? "Connection accepted" : "Request declined",
          description:
            updated.status === "accepted"
              ? "A private message thread with the owner has been opened."
              : "The owner has been notified.",
        });
      },
      onError: () => toast({ title: "Could not update the request", variant: "destructive" }),
    },
  });

  return (
    <Card className="bg-card/30 backdrop-blur border-white/5" data-testid={`card-connection-${connection.id}`}>
      <CardContent className="p-5 flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-heading font-semibold">
              {side === "broker"
                ? `${connection.ownerName}${connection.ownerCompany ? ` (${connection.ownerCompany})` : ""}`
                : `${connection.brokerName}${connection.brokerCompany ? ` (${connection.brokerCompany})` : ""}`}
            </h4>
            {statusBadge(connection.status)}
          </div>
          {connection.assignmentTitle && (
            <p className="text-xs text-muted-foreground mt-1">Regarding: {connection.assignmentTitle}</p>
          )}
          <p className="text-sm text-muted-foreground/90 mt-2 max-w-2xl">{connection.message}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          {side === "broker" && connection.status === "pending" && (
            <>
              <Button
                size="sm"
                onClick={() => respond.mutate({ id: connection.id, data: { status: "accepted" } })}
                disabled={respond.isPending}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                data-testid={`button-accept-connection-${connection.id}`}
              >
                <Check className="w-4 h-4 mr-1" /> Accept
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => respond.mutate({ id: connection.id, data: { status: "declined" } })}
                disabled={respond.isPending}
                className="border-white/10"
                data-testid={`button-decline-connection-${connection.id}`}
              >
                <X className="w-4 h-4 mr-1" /> Decline
              </Button>
            </>
          )}
          {connection.status === "accepted" && connection.threadId != null && (
            <Button size="sm" variant="outline" asChild className="border-primary/20 text-primary">
              <Link href={`/demo/messages?thread=${connection.threadId}`} data-testid={`link-connection-thread-${connection.id}`}>
                <Send className="w-4 h-4 mr-1" /> Open Thread
              </Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Assignments() {
  const { user } = useAuth();
  const isOwner = user?.role === "owner";
  const isBroker = user?.role === "broker";
  const { data: assignments, isLoading } = useListOwnerAssignments();
  const { data: connections, isLoading: connectionsLoading } = useListBrokerConnections();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const updateStatus = useUpdateOwnerAssignmentStatus({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListOwnerAssignmentsQueryKey() }),
      onError: () => toast({ title: "Could not update the assignment", variant: "destructive" }),
    },
  });

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-bold">
            {isOwner ? "My Properties" : "Owner Assignments"}
          </h1>
          <p className="text-muted-foreground mt-1">
            {isOwner
              ? "Your property assignments and broker connection requests."
              : "Open assignments from property and hotel owners looking for a broker."}
          </p>
        </div>
        {isOwner && <NewAssignmentDialog />}
      </div>

      <section className="space-y-4">
        {isLoading ? (
          [...Array(2)].map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)
        ) : assignments && assignments.length > 0 ? (
          assignments.map((assignment) => (
            <AssignmentCard
              key={assignment.id}
              assignment={assignment}
              actions={
                isOwner && assignment.isOwn ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-white/10"
                    disabled={updateStatus.isPending}
                    onClick={() =>
                      updateStatus.mutate({
                        id: assignment.id,
                        data: { status: assignment.status === "open" ? "closed" : "open" },
                      })
                    }
                    data-testid={`button-toggle-assignment-${assignment.id}`}
                  >
                    {assignment.status === "open" ? "Close" : "Reopen"}
                  </Button>
                ) : undefined
              }
            />
          ))
        ) : (
          <Card className="bg-card/30 border-white/5">
            <CardContent className="p-10 text-center text-muted-foreground">
              {isOwner
                ? "You have not posted any assignments yet. Post one to start finding brokers."
                : "No open owner assignments right now."}
            </CardContent>
          </Card>
        )}
      </section>

      <section className="space-y-4">
        <Card className="bg-transparent border-none shadow-none">
          <CardHeader className="p-0">
            <CardTitle className="font-heading text-xl flex items-center gap-2">
              <Handshake className="w-5 h-5 text-primary" />
              {isOwner ? "My Connection Requests" : "Incoming Connection Requests"}
            </CardTitle>
          </CardHeader>
        </Card>
        {connectionsLoading ? (
          [...Array(2)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
        ) : connections && connections.length > 0 ? (
          connections.map((connection) => (
            <ConnectionRow key={connection.id} connection={connection} side={isBroker ? "broker" : "owner"} />
          ))
        ) : (
          <Card className="bg-card/30 border-white/5">
            <CardContent className="p-8 text-center text-muted-foreground">
              {isOwner
                ? "No connection requests yet. Find a broker and send one."
                : "No connection requests from owners yet."}
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
