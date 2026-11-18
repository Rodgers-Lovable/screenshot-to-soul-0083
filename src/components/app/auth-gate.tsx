import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Shows the sign-in screen until a team member is signed in. */
export function AuthGate({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "SIGNED_OUT") qc.clear();
      else if (event === "SIGNED_IN" || event === "USER_UPDATED") qc.invalidateQueries();
    });
    return () => data.subscription.unsubscribe();
  }, [qc]);
  const [member, setMember] = useState<boolean | undefined>(undefined);
  const uid = session?.user.id;
  useEffect(() => {
    if (!uid) return setMember(undefined);
    supabase.rpc("join_team_if_empty").then(({ data }) => setMember(!!data));
  }, [uid]);
  if (session === undefined || (session && member === undefined)) return <div className="p-8 text-sm text-muted-foreground">Loading budget…</div>;
  if (!session) return <SignIn />;
  if (!member) return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-3 rounded-lg border bg-card p-6">
        <h1 className="text-xl font-semibold">Waiting for access</h1>
        <p className="text-sm text-muted-foreground">You're signed in as {session.user.email}. Ask a team member to add you under Settings → Team.</p>
        <Button variant="outline" onClick={() => supabase.auth.signOut()}>Sign out</Button>
      </div>
    </div>
  );
  return <>{children}</>;
}

function SignIn() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    const { data, error } = mode === "in"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
    setBusy(false);
    if (error) return void toast.error(error.message);
    if (mode === "up" && !data.session) setSent(true);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-5 rounded-lg border bg-card p-6">
        <div>
          <p className="text-xs uppercase tracking-widest text-primary">Budget Tracker</p>
          <h1 className="mt-1 text-xl font-semibold">{mode === "in" ? "Sign in" : "Create an account"}</h1>
          <p className="text-sm text-muted-foreground">Team members share one budget.</p>
        </div>
        {sent ? (
          <p className="text-sm">Check {email} for a confirmation link, then come back and sign in.</p>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1"><Label htmlFor="email">Email</Label><Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="password">Password</Label><Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
            <Button type="submit" className="w-full" disabled={busy}>{mode === "in" ? "Sign in" : "Sign up"}</Button>
          </form>
        )}
        <button type="button" className="text-sm text-muted-foreground underline" onClick={() => { setMode(mode === "in" ? "up" : "in"); setSent(false); }}>
          {mode === "in" ? "No account yet? Sign up" : "Have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
