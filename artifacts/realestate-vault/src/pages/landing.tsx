import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Shield, Lock, Users, TrendingUp, ArrowRight, CheckCircle2 } from "lucide-react";
import { VaultLogo } from "@/components/logo";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground dark selection:bg-primary/30 font-sans">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 md:px-12 h-24 bg-background/80 backdrop-blur-md border-b border-white/5">
        <div className="flex items-center gap-3">
          <VaultLogo className="h-10 w-10" />
          <div className="flex flex-col">
            <span className="font-heading font-semibold tracking-[0.2em] leading-none text-base uppercase text-foreground">RealEstate</span>
            <span className="font-heading font-bold text-primary tracking-[0.3em] leading-none text-sm uppercase mt-1">Vault</span>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground mr-6">
            <a href="#promises" className="hover:text-foreground transition-colors">Our Promise</a>
            <a href="#platform" className="hover:text-foreground transition-colors">Platform</a>
          </div>
          <Button variant="ghost" className="hidden md:flex" asChild>
            <Link href="/demo">Sign In</Link>
          </Button>
          <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold px-6">
            <Link href="/demo">Explore the Demo</Link>
          </Button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 md:pt-48 md:pb-32 px-6 md:px-12 overflow-hidden flex flex-col items-center justify-center min-h-[90vh]">
        <div className="absolute inset-0 z-0">
          <img 
            src="/hero.jpg" 
            alt="Premium glass office tower at dusk" 
            className="w-full h-full object-cover opacity-30 mix-blend-luminosity"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/50 to-transparent" />
        </div>
        
        <div className="relative z-10 max-w-4xl text-center space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-1000">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-bold tracking-widest uppercase mb-4">
            <Shield className="w-3.5 h-3.5" />
            Invitation Only
          </div>
          <h1 className="font-heading text-5xl md:text-7xl font-bold tracking-tight text-foreground leading-[1.1]">
            Private Deals.<br />
            <span className="text-primary italic font-serif font-medium">Trusted Access.</span>
          </h1>
          <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto leading-relaxed font-light">
            The private marketplace for commercial real estate. Connect with verified institutional investors and trade off-market assets confidentially.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-8">
            <Button size="lg" asChild className="bg-primary text-primary-foreground hover:bg-primary/90 font-bold px-8 h-14 text-lg w-full sm:w-auto">
              <Link href="/demo">
                Enter the Vault <ArrowRight className="ml-2 w-5 h-5" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="border-border hover:bg-accent/50 px-8 h-14 text-lg w-full sm:w-auto">
              Request Access
            </Button>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 pt-20 border-t border-white/10 mt-20">
            <div className="flex flex-col items-center gap-2">
              <h3 className="font-heading text-3xl font-bold text-foreground">€4.2B+</h3>
              <p className="text-sm text-muted-foreground font-medium uppercase tracking-wider">Pipeline Value</p>
            </div>
            <div className="flex flex-col items-center gap-2">
              <h3 className="font-heading text-3xl font-bold text-foreground">850+</h3>
              <p className="text-sm text-muted-foreground font-medium uppercase tracking-wider">Verified Brokers</p>
            </div>
            <div className="flex flex-col items-center gap-2">
              <h3 className="font-heading text-3xl font-bold text-foreground">100%</h3>
              <p className="text-sm text-muted-foreground font-medium uppercase tracking-wider">Off-Market</p>
            </div>
            <div className="flex flex-col items-center gap-2">
              <h3 className="font-heading text-3xl font-bold text-foreground">24/7</h3>
              <p className="text-sm text-muted-foreground font-medium uppercase tracking-wider">Secure Access</p>
            </div>
          </div>
        </div>
      </section>

      {/* Brand Promises Section */}
      <section id="promises" className="py-24 px-6 md:px-12 bg-card relative z-10 border-y border-white/5">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="font-heading text-3xl md:text-4xl font-bold mb-4">Our Promise</h2>
            <div className="h-1 w-12 bg-primary mx-auto"></div>
          </div>
          
          <div className="grid md:grid-cols-4 gap-12">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-background border border-primary/20 flex items-center justify-center text-primary mb-2 shadow-[0_0_30px_rgba(200,169,90,0.1)]">
                <Lock className="w-8 h-8" />
              </div>
              <h3 className="font-heading text-xl font-semibold">Private</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">Confidential off-market opportunities, carefully curated for institutional players.</p>
            </div>
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-background border border-primary/20 flex items-center justify-center text-primary mb-2 shadow-[0_0_30px_rgba(200,169,90,0.1)]">
                <Shield className="w-8 h-8" />
              </div>
              <h3 className="font-heading text-xl font-semibold">Protected</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">Secure NDAs, protected introductions & integrated data rooms ensure absolute safety.</p>
            </div>
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-background border border-primary/20 flex items-center justify-center text-primary mb-2 shadow-[0_0_30px_rgba(200,169,90,0.1)]">
                <Users className="w-8 h-8" />
              </div>
              <h3 className="font-heading text-xl font-semibold">Connected</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">Direct access to verified brokers, qualified investors, and mandated capital.</p>
            </div>
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-background border border-primary/20 flex items-center justify-center text-primary mb-2 shadow-[0_0_30px_rgba(200,169,90,0.1)]">
                <TrendingUp className="w-8 h-8" />
              </div>
              <h3 className="font-heading text-xl font-semibold">Results</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">Faster execution, better deals, and stronger outcomes through direct matching.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Showcase 1 */}
      <section className="py-24 px-6 md:px-12 relative overflow-hidden">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center gap-16">
          <div className="flex-1 space-y-8">
            <h2 className="font-heading text-3xl md:text-5xl font-bold leading-tight">
              Exclusive deals, <br/><span className="text-primary font-serif italic">uncompromised privacy.</span>
            </h2>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Every asset on RealEstate Vault is strictly off-market. We protect your deals with mandatory digital NDAs and granular access controls before any sensitive information is revealed.
            </p>
            <ul className="space-y-4">
              {[
                "Location obfuscation until NDA is signed",
                "Automated digital NDA execution",
                "Watermarked secure data rooms",
                "Granular document permissions"
              ].map((item, i) => (
                <li key={i} className="flex items-center gap-3 text-foreground">
                  <CheckCircle2 className="w-5 h-5 text-primary" />
                  <span className="font-medium">{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex-1 relative">
            <div className="absolute -inset-4 bg-primary/20 blur-3xl rounded-full" />
            <div className="relative rounded-2xl overflow-hidden border border-white/10 shadow-2xl aspect-[4/3]">
               <img src="/hotel.jpg" alt="Luxury resort" className="w-full h-full object-cover" />
               <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-transparent to-transparent flex flex-col justify-end p-8">
                  <div className="backdrop-blur-md bg-background/60 border border-white/10 p-6 rounded-xl">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <div className="text-xs text-primary uppercase font-bold tracking-widest mb-1">Confidential</div>
                        <h4 className="font-heading text-xl font-semibold">Prime Hotel Opportunity</h4>
                      </div>
                      <Shield className="w-6 h-6 text-primary" />
                    </div>
                    <div className="space-y-2 mb-6">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Region</span>
                        <span className="font-medium">Amsterdam Region, Netherlands</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Value</span>
                        <span className="font-medium">€20M - €25M</span>
                      </div>
                    </div>
                    <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90">Request Access</Button>
                  </div>
               </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Showcase 2 */}
      <section className="py-24 px-6 md:px-12 bg-card relative border-y border-white/5">
        <div className="max-w-7xl mx-auto flex flex-col-reverse md:flex-row items-center gap-16">
          <div className="flex-1 relative">
            <div className="absolute -inset-4 bg-primary/10 blur-3xl rounded-full" />
            <div className="relative grid grid-cols-2 gap-4">
              <img src="/logistics.jpg" alt="Logistics" className="w-full h-64 object-cover rounded-xl border border-white/10 shadow-lg mt-8" />
              <img src="/office.jpg" alt="Office lobby" className="w-full h-64 object-cover rounded-xl border border-white/10 shadow-lg" />
            </div>
          </div>
          <div className="flex-1 space-y-8">
            <h2 className="font-heading text-3xl md:text-5xl font-bold leading-tight">
              A curated network of <br/><span className="text-primary font-serif italic">verified capital.</span>
            </h2>
            <p className="text-lg text-muted-foreground leading-relaxed">
              We rigorously vet every participant. Connect directly with mandated buyers and top-tier brokers with proven track records. Our reputation engine ensures you only deal with serious counterparts.
            </p>
            <ul className="space-y-4">
              {[
                "KYC/AML verified participants",
                "Direct investor acquisition mandates",
                "Broker performance rankings & transaction history",
                "End-to-end encrypted messaging"
              ].map((item, i) => (
                <li key={i} className="flex items-center gap-3 text-foreground">
                  <CheckCircle2 className="w-5 h-5 text-primary" />
                  <span className="font-medium">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-32 px-6 md:px-12 relative overflow-hidden">
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-background" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(200,169,90,0.15),transparent_50%)]" />
        </div>
        <div className="relative z-10 max-w-3xl mx-auto text-center space-y-8">
          <VaultLogo className="w-20 h-20 mx-auto mb-6" />
          <h2 className="font-heading text-4xl md:text-6xl font-bold">Ready to enter the vault?</h2>
          <p className="text-xl text-muted-foreground font-light">
            Experience the future of commercial real estate transactions. Access the demo environment to explore the platform.
          </p>
          <div className="pt-8">
            <Button size="lg" asChild className="bg-primary text-primary-foreground hover:bg-primary/90 font-bold px-12 h-16 text-xl">
              <Link href="/demo">
                Explore the Demo <ArrowRight className="ml-2 w-6 h-6" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-card py-12 px-6 md:px-12 border-t border-white/10 text-center md:text-left">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <VaultLogo className="h-6 w-6" />
            <span className="font-heading font-semibold tracking-widest text-sm uppercase">RealEstate Vault</span>
          </div>
          <div className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} RealEstate Vault. The Private Marketplace for Commercial Real Estate.
          </div>
          <div className="flex gap-6 text-sm text-muted-foreground">
            <a href="#" className="hover:text-primary transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-primary transition-colors">Terms of Service</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
