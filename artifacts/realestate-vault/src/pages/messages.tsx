import { Link } from "wouter";
import { useState } from "react";
import { useListThreads, useListThreadMessages, useSendMessage, getListThreadMessagesQueryKey, getListThreadsQueryKey } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, Building2, ChevronRight, Lock } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearch } from "wouter";

export default function Messages() {
  const { data: threads, isLoading: threadsLoading } = useListThreads();
  const search = useSearch();
  const requestedThreadId = Number(new URLSearchParams(search).get("thread"));
  const [activeThreadId, setActiveThreadId] = useState<number | null>(
    Number.isInteger(requestedThreadId) && requestedThreadId > 0 ? requestedThreadId : null,
  );

  const activeThread = threads?.find(t => t.id === activeThreadId);

  return (
    <div className="h-[calc(100vh-4rem)] flex overflow-hidden">
      {/* Thread List */}
      <div className="w-full md:w-80 lg:w-96 border-r border-border bg-sidebar/50 flex flex-col shrink-0">
        <div className="p-4 border-b border-border">
          <h2 className="font-heading font-bold text-lg mb-4">Messages</h2>
          <Input placeholder="Search conversations..." className="bg-background border-white/5" />
        </div>
        <div className="flex-1 overflow-y-auto">
          {threadsLoading ? (
            <div className="p-4 space-y-4">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {threads?.map(thread => (
                <div 
                  key={thread.id} 
                  role="button"
                  tabIndex={0}
                  aria-pressed={activeThreadId === thread.id}
                  onClick={() => setActiveThreadId(thread.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setActiveThreadId(thread.id);
                    }
                  }}
                  data-testid={`thread-item-${thread.id}`}
                  className={`p-4 cursor-pointer transition-colors outline-none focus-visible:bg-white/[0.05] ${activeThreadId === thread.id ? 'bg-primary/10 border-l-2 border-l-primary' : 'hover:bg-white/[0.02] border-l-2 border-l-transparent'}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-sm line-clamp-1">{thread.counterpartName}</span>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {new Date(thread.lastMessageAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex items-center text-xs text-muted-foreground gap-1 mb-2">
                    <Building2 className="w-3 h-3" /> {thread.counterpartCompany}
                  </div>
                  <div className="flex items-center justify-between">
                    <p className={`text-sm line-clamp-1 ${thread.unread ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                      {thread.lastMessage}
                    </p>
                    {thread.unread && <div className="w-2 h-2 rounded-full bg-primary shrink-0 ml-2" />}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Message View */}
      <div className="flex-1 flex flex-col bg-background relative hidden md:flex">
        {activeThreadId ? (
          <>
            <div className="h-16 border-b border-border flex items-center justify-between px-6 bg-card/30 backdrop-blur shrink-0">
              <div className="flex items-center gap-3">
                <Avatar className="w-10 h-10 border border-primary/20">
                  <AvatarFallback className="bg-background text-primary font-bold">
                    {activeThread?.counterpartName.split(' ').map((n: string) => n[0]).join('')}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="font-heading font-semibold text-sm">{activeThread?.counterpartName}</h3>
                  <p className="text-xs text-muted-foreground">{activeThread?.counterpartCompany}</p>
                </div>
              </div>
              {activeThread?.dealId && (
                <Link
                  href={`/demo/deals/${activeThread.dealId}`}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
                  data-testid="link-thread-deal"
                >
                  <Lock className="w-3 h-3" /> Linked to Deal
                </Link>
              )}
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 bg-[url('/bg-noise.png')] bg-repeat opacity-90 mix-blend-overlay absolute inset-0 z-0 pointer-events-none" />
            
            <MessageList threadId={activeThreadId} />
            
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted/10 flex items-center justify-center mb-4 border border-white/5">
              <Send className="w-8 h-8 opacity-20" />
            </div>
            <h3 className="font-heading text-xl font-medium text-foreground mb-2">Secure Messaging</h3>
            <p className="max-w-sm">Select a conversation to view encrypted messages. All communications on Closa are confidential.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function MessageList({ threadId }: { threadId: number }) {
  const { data: messages, isLoading } = useListThreadMessages(threadId, { query: { enabled: !!threadId, queryKey: getListThreadMessagesQueryKey(threadId) } });
  const sendMessage = useSendMessage();
  const queryClient = useQueryClient();
  const [newMessage, setNewMessage] = useState("");

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    
    sendMessage.mutate({
      id: threadId,
      data: { body: newMessage } as any
    }, {
      onSuccess: () => {
        setNewMessage("");
        queryClient.invalidateQueries({ queryKey: getListThreadMessagesQueryKey(threadId) });
        queryClient.invalidateQueries({ queryKey: getListThreadsQueryKey() });
      }
    });
  };

  return (
    <div className="flex-1 flex flex-col z-10">
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-16 w-64 ml-auto rounded-2xl rounded-tr-sm" />
            <Skeleton className="h-16 w-64 rounded-2xl rounded-tl-sm" />
          </div>
        ) : (
          <>
            <div className="text-center text-xs text-muted-foreground my-4 font-medium uppercase tracking-wider">
              End-to-End Encrypted
            </div>
            {messages?.map(msg => (
              <div key={msg.id} className={`flex ${msg.fromMe ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] rounded-2xl p-4 ${
                  msg.fromMe 
                    ? 'bg-primary text-primary-foreground rounded-tr-sm shadow-[0_4px_15px_rgba(200,169,90,0.2)]' 
                    : 'bg-card border border-white/5 rounded-tl-sm shadow-sm'
                }`}>
                  <p className="text-sm leading-relaxed">{msg.body}</p>
                  <p className={`text-[10px] mt-2 text-right ${msg.fromMe ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                    {new Date(msg.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
      
      <div className="p-4 bg-card/30 backdrop-blur border-t border-border shrink-0">
        <form onSubmit={handleSend} className="flex items-center gap-2">
          <Input 
            value={newMessage}
            onChange={e => setNewMessage(e.target.value)}
            placeholder="Type a secure message..." 
            className="flex-1 bg-background border-white/10 h-12"
          />
          <Button type="submit" disabled={!newMessage.trim() || sendMessage.isPending} className="h-12 w-12 rounded-xl bg-primary text-primary-foreground p-0">
            <Send className="w-5 h-5 ml-1" />
          </Button>
        </form>
      </div>
    </div>
  );
}
