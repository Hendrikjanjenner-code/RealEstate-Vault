import { formatMillions } from "@/lib/utils";
import { useListTransactions } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShieldCheck, MapPin, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export default function Transactions() {
  const { data: transactions, isLoading } = useListTransactions();

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-bold">Closed Transactions</h1>
          <p className="text-muted-foreground mt-1">Verified historical data of platform deals.</p>
        </div>
        <div className="w-full md:w-72 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search records..." className="pl-9 bg-card border-white/5" />
        </div>
      </div>

      <Card className="bg-card/50 backdrop-blur border-white/5 overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-4">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-background/50">
                <TableRow className="border-white/5 hover:bg-transparent">
                  <TableHead className="font-heading uppercase tracking-wider text-xs">Asset</TableHead>
                  <TableHead className="font-heading uppercase tracking-wider text-xs">Location</TableHead>
                  <TableHead className="font-heading uppercase tracking-wider text-xs">Price</TableHead>
                  <TableHead className="font-heading uppercase tracking-wider text-xs">Buyer Profile</TableHead>
                  <TableHead className="font-heading uppercase tracking-wider text-xs">Broker</TableHead>
                  <TableHead className="font-heading uppercase tracking-wider text-xs text-right">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions?.map((tx) => (
                  <TableRow key={tx.id} className="border-white/5 hover:bg-white/[0.02]">
                    <TableCell className="font-medium">
                      {tx.dealTitle}
                      <div className="mt-1">
                        <Badge variant="outline" className="text-[10px] border-white/10 bg-background/50">
                          {tx.assetClass.replace('_', ' ')}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center text-muted-foreground text-sm">
                        <MapPin className="w-3 h-3 mr-1" /> {tx.city}, {tx.country}
                      </div>
                    </TableCell>
                    <TableCell className="font-semibold text-primary">
                      {formatMillions(tx.price, tx.currency)}
                    </TableCell>
                    <TableCell className="text-sm capitalize">
                      {tx.buyerType.replace('_', ' ')}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm">
                        {tx.brokerName}
                        {tx.verified && <ShieldCheck className="w-3.5 h-3.5 text-primary" />}
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {new Date(tx.closedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short' })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
