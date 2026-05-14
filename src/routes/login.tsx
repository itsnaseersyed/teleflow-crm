import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Headphones, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { user, loading, login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) nav({ to: "/dashboard" });
  }, [user, loading, nav]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await login(email, password);
      toast.success("Welcome back!");
      nav({ to: "/dashboard" });
    } catch (error: any) {
      toast.error(error?.message || "Invalid email or password");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex flex-col justify-between p-10 bg-gradient-hero text-white relative overflow-hidden">
        <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-white/5 blur-3xl" />
        <div className="absolute -top-20 -left-20 h-72 w-72 rounded-full bg-accent/20 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 backdrop-blur">
            <Headphones className="h-5 w-5" />
          </div>
          <div className="text-xl font-semibold tracking-tight">TeleFlow</div>
        </div>
        <div className="relative space-y-6">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">
            The modern CRM for telecallers and admission teams.
          </h1>
          <p className="text-white/70 max-w-md">
            Track every call, every lead, and every follow-up in one beautifully simple workspace.
          </p>
          <div className="grid grid-cols-3 gap-4 max-w-md">
            {[
              { k: "Calls", v: "Logged" },
              { k: "Leads", v: "Tracked" },
              { k: "Follow-ups", v: "Automated" },
            ].map((s) => (
              <div key={s.k} className="rounded-lg bg-white/10 backdrop-blur p-3">
                <div className="text-xs text-white/60">{s.v}</div>
                <div className="font-semibold">{s.k}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="relative text-xs text-white/50">
          © {new Date().getFullYear()} TeleFlow CRM
        </div>
      </div>

      <div className="flex items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2 mb-6">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-accent">
              <Headphones className="h-5 w-5 text-white" />
            </div>
            <div className="text-lg font-semibold">TeleFlow</div>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">Sign in to your account</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Welcome back. Enter your details to continue.
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-gradient-accent text-white shadow-soft hover:opacity-95"
              disabled={submitting}
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Sign in
            </Button>
          </form>

        </div>
      </div>
    </div>
  );
}
