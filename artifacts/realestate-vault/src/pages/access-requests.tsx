import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield, Clock, FileSignature, CheckCircle2, XCircle, FileText, KeyRound } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@workspace/replit-auth-web";
import { Link } from "wouter";
import { useListAccessRequests, useUpdateAccessRequest, useGetSession, useBrokerLogin, getListAccessRequestsQueryKey, getGetSessionQueryKey } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";

export default function AccessRequests() {
  const { data: session, isLoading: sessionLoading } = useGetSession();
  const { user } = useAuth();
  // Broker via Replit Auth role OR legacy broker-passcode session.
  const isBroker = user?.role === "broker" || !!session?.broker;
  const brokerLogin = useBrokerLogin();
  const [passcode, setPasscode] = useState("");
  const { data: requests, isLoading } = useListAccessRequests({ query: { queryKey: getListAccessRequestsQueryKey(), enabled: isBroker } });
  const updateRequest = useUpdateAccessRequest();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleLogin = () => {
    brokerLogin.mutate(
      { data: { passcode } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListAccessRequestsQueryKey() });
          toast({ title: "Signed in", description: "Broker access unlocked." });
        },
        onError: () => {
          toast({ title: "Sign-in failed", description: "Invalid broker passcode.", variant: "destructive" });
        },
      },
    );
  };

  if (!sessionLoading && !isBroker) {
    return (
      <div className="p-8 max-w-md mx-auto space-y-6 mt-16">
        <div className="text-center space-y-2">
          <KeyRound className="w-10 h-10 text-primary mx-auto" />
          <h1 className="text-2xl font-heading font-bold">Broker Sign-In</h1>
          <p className="text-muted-foreground text-sm">Managing access requests and uploading data room documents requires the broker passcode.</p>
        </div>
        <div className="space-y-3">
          <Label htmlFor="broker-passcode">Broker passcode</Label>
          <Input id="broker-passcode" type="password" value={passcode} onChange={(e) => setPasscode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleLogin()} placeholder="Enter passcode" className="bg-background/50 border-white/10" />
          <Button onClick={handleLogin} disabled={brokerLogin.isPending || !passcode} className="w-full">Sign In</Button>
        </div>
      </div>
    );
  }

  const handleUpdateStatus = (id: number, status: string) => {
    updateRequest.mutate({ id, data: { status } as any }, {
      onSuccess: () => {
        toast({ title: "Status Updated", description: `Request status changed to ${status.replace('_', ' ')}` });
        queryClient.setQueryData(getListAccessRequestsQueryKey(), (old: any) => {
          if (!old) return old;
          return old.map((r: any) => r.id === id ? { ...r, status } : r);
        });
      }
    });
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="mb-8">
        <h1 className="text-3xl font-heading font-bold">Access Requests</h1>
        <p className="text-muted-foreground mt-1">
          {isBroker ? "Manage data room access and NDAs for your deals." : "Track the status of your data room access requests."}
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
        </div>
      ) : requests?.length === 0 ? (
         <div className="py-20 text-center text-muted-foreground">
            <Shield className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p>No pending access requests.</p>
         </div>
      ) : (
        <div className="space-y-4">
          {requests?.map((req) => (
            <Card key={req.id} className="bg-card/50 backdrop-blur border-white/5 overflow-hidden">
              <CardContent className="p-0 flex flex-col md:flex-row items-stretch md:items-center">
                <div className="p-6 flex-1 border-b md:border-b-0 md:border-r border-white/5">
                  <div className="flex items-center gap-3 mb-2">
                    <Badge variant="outline" className={`
                      ${req.status === 'pending' ? 'bg-primary/10 text-primary border-primary/20' : ''}
                      ${req.status === 'approved' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : ''}
                      ${req.status === 'nda_sent' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' : ''}
                      ${req.status === 'nda_signed' ? 'bg-green-500/10 text-green-400 border-green-500/20' : ''}
                      ${req.status === 'rejected' ? 'bg-destructive/10 text-destructive border-destructive/20' : ''}
                    `}>
                      {req.status === 'nda_sent' ? 'NDA Sent' : req.status === 'nda_signed' ? 'NDA Signed' : req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                    </Badge>
                    <span className="text-xs text-muted-foreground font-medium">
                      {new Date(req.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <h3 className="font-heading font-semibold text-lg mb-1">{req.dealTitle}</h3>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground/80">{req.requesterName}</span> • {req.requesterCompany}
                  </div>
                  {req.message && (
                    <div className="mt-4 text-sm text-muted-foreground bg-background/50 p-3 rounded border border-white/5 italic">
                      "{req.message}"
                    </div>
                  )}
                </div>
                
                <div className="p-6 w-full md:w-64 shrink-0 bg-background/20 flex flex-col gap-2 justify-center">
                  {req.status === 'pending' && isBroker && (
                    <>
                      <Button onClick={() => handleUpdateStatus(req.id, 'approved')} className="w-full bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground border border-primary/20">
                        <CheckCircle2 className="w-4 h-4 mr-2" /> Approve Request
                      </Button>
                      <Button onClick={() => handleUpdateStatus(req.id, 'rejected')} variant="ghost" className="w-full text-destructive hover:text-destructive hover:bg-destructive/10">
                        <XCircle className="w-4 h-4 mr-2" /> Reject
                      </Button>
                    </>
                  )}
                  {req.status === 'pending' && !isBroker && (
                    <div className="text-center">
                      <Clock className="w-6 h-6 text-primary mx-auto mb-2 opacity-50" />
                      <p className="text-xs text-muted-foreground">Awaiting broker review...</p>
                    </div>
                  )}
                  {req.status === 'approved' && (
                    isBroker ? (
                      <Button onClick={() => handleUpdateStatus(req.id, 'nda_sent')} className="w-full bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground border border-primary/20">
                        <FileSignature className="w-4 h-4 mr-2" /> Send Digital NDA
                      </Button>
                    ) : (
                      <div className="text-center">
                        <CheckCircle2 className="w-6 h-6 text-primary mx-auto mb-2 opacity-50" />
                        <p className="text-xs text-muted-foreground">Approved — NDA on its way.</p>
                      </div>
                    )
                  )}
                  {req.status === 'nda_sent' && (
                    isBroker ? (
                      <div className="text-center">
                        <Clock className="w-6 h-6 text-primary mx-auto mb-2 opacity-50" />
                        <p className="text-xs text-muted-foreground">Waiting for the investor to sign the NDA...</p>
                      </div>
                    ) : (
                      <div className="text-center">
                        <FileSignature className="w-6 h-6 text-primary mx-auto mb-2" />
                        <p className="text-xs text-muted-foreground mb-3">Your NDA is ready to sign.</p>
                        <Link href={`/demo/deals/${req.dealId}`}>
                          <Button size="sm" className="w-full bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground border border-primary/20 text-xs h-8" data-testid={`button-review-sign-${req.id}`}>
                            Review & Sign NDA
                          </Button>
                        </Link>
                      </div>
                    )
                  )}
                  {req.status === 'nda_signed' && (
                    <div className="text-center flex flex-col items-center justify-center text-green-400">
                      <CheckCircle2 className="w-8 h-8 mb-2" />
                      <p className="text-sm font-medium">Access Granted</p>
                      {req.signerName && req.signedAt && (
                        <p className="text-[11px] text-muted-foreground mt-1">Signed by {req.signerName} on {new Date(req.signedAt).toLocaleDateString()}</p>
                      )}
                      <a href={`/api/access-requests/${req.id}/nda-record`} target="_blank" rel="noopener noreferrer" className="w-full mt-3">
                        <Button size="sm" variant="outline" className="w-full border-white/10 text-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/30 text-xs h-8" data-testid={`button-view-nda-record-${req.id}`}>
                          <FileText className="w-3.5 h-3.5 mr-2" /> View Signed NDA
                        </Button>
                      </a>
                    </div>
                  )}
                  {req.status === 'rejected' && (
                    <div className="text-center flex flex-col items-center justify-center text-destructive/50">
                      <XCircle className="w-8 h-8 mb-2" />
                      <p className="text-sm font-medium">Rejected</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
