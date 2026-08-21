import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center bg-background p-4">
      <div className="text-center space-y-6 max-w-md">
        <ShieldAlert className="w-20 h-20 text-muted-foreground/30 mx-auto" />
        <h1 className="text-4xl font-heading font-bold text-foreground">404</h1>
        <p className="text-lg text-muted-foreground">
          The requested page does not exist or you do not have permission to view it.
        </p>
        <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90 mt-4">
          <Link href="/">Return Home</Link>
        </Button>
      </div>
    </div>
  );
}
