import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { toast } from "sonner";
import { LovableMark } from "@lovable.dev/cloud-auth-js/react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
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

const GoogleG = () => (
  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"/><path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"/></svg>
);

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
  const social = async (p: "google" | "lovable") => {
    const r = await lovable.auth.signInWithOAuth(p, { redirect_uri: window.location.origin });
    if (r.error) toast.error(r.error.message);
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
        <div className="space-y-2">
          <Button type="button" variant="outline" className="w-full" onClick={() => social("google")}><GoogleG />Continue with Google</Button>
          <Button type="button" variant="outline" className="w-full" onClick={() => social("lovable")}><LovableMark />Continue with Lovable</Button>
        </div>
        <button type="button" className="text-sm text-muted-foreground underline" onClick={() => { setMode(mode === "in" ? "up" : "in"); setSent(false); }}>
          {mode === "in" ? "No account yet? Sign up" : "Have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
