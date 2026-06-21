import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { MjwLogo } from "@/components/mjw-logo";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — MJW Site Report" },
      { name: "description", content: "Sign in to MJW Site Report — premium mobile inspection capture." },
    ],
  }),
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/" });
  },
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/", replace: true });
    });
  }, [navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("Account created. You can sign in now.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/", replace: true });
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4 py-10">
      <div className="flex items-center gap-3 mb-8">
        <MjwLogo size={44} />
        <div>
          <div className="font-serif text-lg leading-tight text-slate-900">
            MJW <em className="not-italic" style={{ color: "var(--mjw-gold-lt)" }}>Site Report</em>
          </div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500 font-mono">No Noise · Just Signal</div>
        </div>
      </div>
      <Card className="w-full max-w-sm p-6">
        <h1 className="text-xl text-slate-900 mb-1">
          {mode === "signin" ? "Sign in" : "Create account"}
        </h1>
        <p className="text-sm text-slate-500 mb-5">
          {mode === "signin" ? "Welcome back." : "Start capturing MJW site reports."}
        </p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full h-12 text-base" disabled={loading}>
            {loading ? "Please wait..." : mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>
        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-5 w-full text-sm text-slate-600 hover:text-slate-900"
        >
          {mode === "signin"
            ? "Don't have an account? Create one"
            : "Already have an account? Sign in"}
        </button>
      </Card>
    </div>
  );
}