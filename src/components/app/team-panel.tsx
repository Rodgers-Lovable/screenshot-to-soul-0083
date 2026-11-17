import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

type Member = { user_id: string; email: string };

/** Lists team members; members add people, admins remove them. */
export function TeamPanel() {
  const [rows, setRows] = useState<Member[]>([]);
  const [admins, setAdmins] = useState<Set<string>>(new Set());
  const [me, setMe] = useState<string>();
  const [email, setEmail] = useState("");
  const [removing, setRemoving] = useState<Member | null>(null);
  const load = async () => {
    const [{ data: m }, { data: r }, { data: u }] = await Promise.all([
      supabase.from("team_members").select("user_id,email").order("added_at"),
      supabase.from("user_roles").select("user_id").eq("role", "admin"),
      supabase.auth.getUser(),
    ]);
    setRows(m ?? []); setAdmins(new Set((r ?? []).map((x) => x.user_id))); setMe(u.user?.id);
  };
  useEffect(() => { load(); }, []);
  const isAdmin = !!me && admins.has(me);
  const add = async (e: FormEvent) => {
    e.preventDefault();
    const { data, error } = await supabase.rpc("add_team_member", { _email: email });
    if (error) return void toast.error("Could not add this person.");
    if (!data) return void toast.error("No account with that email yet. Ask them to sign up first.");
    toast.success("Added to the team"); setEmail(""); load();
  };
  const remove = async () => {
    if (!removing) return;
    const { error } = await supabase.rpc("remove_team_member", { _user_id: removing.user_id });
    if (error) toast.error(error.message); else toast.success(`${removing.email} no longer has access`);
    setRemoving(null); load();
  };
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Team</CardTitle><CardDescription>Only people on this list can see or change the budget and evidence files. They must sign up first.</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        <ul className="divide-y rounded-md border text-sm">
          {rows.map((r) => (
            <li key={r.user_id} className="flex items-center gap-2 px-3 py-2">
              <span className="mr-auto">{r.email}{r.user_id === me && <span className="text-muted-foreground"> (you)</span>}</span>
              {admins.has(r.user_id) && <span className="rounded bg-secondary px-2 py-0.5 text-xs">Admin</span>}
              {isAdmin && r.user_id !== me && <Button size="sm" variant="ghost" onClick={() => setRemoving(r)}>Remove</Button>}
            </li>
          ))}
        </ul>
        <form onSubmit={add} className="flex gap-2">
          <Input type="email" required placeholder="colleague@example.org" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit">Add</Button>
        </form>
      </CardContent>
      <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.email}?</AlertDialogTitle>
            <AlertDialogDescription>They lose access to the budget and evidence files straight away. Their past changes stay in the audit log.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={remove}>Remove</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
