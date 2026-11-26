import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useAddMember, useRemoveMember, useSetAdmin, useStudyMembers } from "@/data/hooks";
import type { StudyMember } from "@/lib/types";
import { useActiveStudy } from "./active-study-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/** Lists the active study's team; admins add and remove people and choose other admins. */
export function TeamPanel() {
  const { study } = useActiveStudy();
  const members = useStudyMembers(study.id);
  const addM = useAddMember();
  const removeM = useRemoveMember();
  const adminM = useSetAdmin();
  const [email, setEmail] = useState("");
  const [removing, setRemoving] = useState<StudyMember | null>(null);
  const rows = members.data ?? [];
  const adminCount = rows.filter((r) => r.role === "admin").length;
  const isAdmin = rows.some((r) => r.isMe && r.role === "admin");
  const add = (e: FormEvent) => {
    e.preventDefault();
    addM.mutate(
      { studyId: study.id, email },
      {
        onSuccess: (found) => {
          if (!found)
            return void toast.error("No account with that email yet. Ask them to sign up first.");
          toast.success("Added to the study");
          setEmail("");
        },
        onError: () => toast.error("Could not add this person."),
      },
    );
  };
  const setAdmin = (m: StudyMember, makeAdmin: boolean) =>
    adminM.mutate(
      { studyId: study.id, userId: m.userId, isAdmin: makeAdmin },
      {
        onSuccess: () =>
          toast.success(
            makeAdmin ? `${m.email} is now an admin` : `${m.email} is no longer an admin`,
          ),
        onError: (err) => toast.error(err.message),
      },
    );
  const remove = () => {
    if (!removing) return;
    const m = removing;
    removeM.mutate(
      { studyId: study.id, userId: m.userId },
      {
        onSuccess: () => toast.success(`${m.email} no longer has access`),
        onError: (err) => toast.error(err.message),
      },
    );
    setRemoving(null);
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Team · {study.name}</CardTitle>
        <CardDescription>
          Only people on this list can see or change this study's budget and evidence files.
          {isAdmin
            ? " Admins add people here. They must sign up first."
            : " Ask a study admin to add or remove people."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {members.isError && (
          <p className="text-sm text-destructive">
            Could not load the team: {members.error.message}
          </p>
        )}
        <ul className="divide-y rounded-md border text-sm">
          {rows.map((r) => (
            <li key={r.userId} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <span className="mr-auto min-w-0 break-all">
                {r.email}
                {r.isMe && <span className="text-muted-foreground"> (you)</span>}
              </span>
              {r.role === "admin" && (
                <span className="rounded bg-secondary px-2 py-0.5 text-xs">Admin</span>
              )}
              {isAdmin && (adminCount > 1 || r.role !== "admin") && (
                <Button size="sm" variant="ghost" onClick={() => setAdmin(r, r.role !== "admin")}>
                  {r.role === "admin" ? "Remove admin" : "Make admin"}
                </Button>
              )}
              {isAdmin && !r.isMe && (
                <Button size="sm" variant="ghost" onClick={() => setRemoving(r)}>
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
        {isAdmin && (
          <form onSubmit={add} className="flex gap-2">
            <Input
              type="email"
              required
              placeholder="colleague@example.org"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button type="submit" loading={addM.isPending}>
              Add
            </Button>
          </form>
        )}
      </CardContent>
      <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.email}?</AlertDialogTitle>
            <AlertDialogDescription>
              They lose access to the budget and evidence files straight away. Their past changes
              stay in the audit log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
