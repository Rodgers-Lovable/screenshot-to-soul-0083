import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

/** Lists team members and lets a member give another signed-up person access. */
export function TeamPanel() {
  const [rows, setRows] = useState<{ user_id: string; email: string }[]>([]);
  const [email, setEmail] = useState("");
  const load = () => supabase.from("team_members").select("user_id,email").order("added_at").then(({ data }) => setRows(data ?? []));
  useEffect(() => { load(); }, []);
  const add = async (e: FormEvent) => {
    e.preventDefault();
    const { data, error } = await supabase.rpc("add_team_member", { _email: email });
    if (error) return void toast.error("Could not add this person.");
    if (!data) return void toast.error("No account with that email yet. Ask them to sign up first.");
    toast.success("Added to the team"); setEmail(""); load();
  };
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Team</CardTitle><CardDescription>Only people on this list can see or change the budget. They must sign up first.</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        <ul className="text-sm">{rows.map((r) => <li key={r.user_id}>{r.email}</li>)}</ul>
        <form onSubmit={add} className="flex gap-2">
          <Input type="email" required placeholder="colleague@example.org" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit">Add</Button>
        </form>
      </CardContent>
    </Card>
  );
}
