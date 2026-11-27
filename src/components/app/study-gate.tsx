import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { rememberStudy, savedStudyId, setActiveStudyId } from "@/data/active-study";
import { useCanCreateStudy, useCreateStudy, useMyEmail, useStudies } from "@/data/hooks";
import type { Study } from "@/lib/types";
import { ActiveStudyCtx } from "./active-study-context";
import { YearGate } from "./year-gate";

/** Picks the active study before the app renders, and remounts the app when it changes. */
export function StudyGate({ children }: { children: ReactNode }) {
  const studies = useStudies();
  const canCreate = useCanCreateStudy();
  const me = useMyEmail();
  const [chosen, setChosen] = useState<string | null>(null);

  if (studies.isPending) return <Screen>Loading studies…</Screen>;
  if (studies.isError)
    return (
      <Shell title="Could not load your studies">
        <p className="text-sm text-muted-foreground">{studies.error.message}</p>
        <div className="flex gap-2">
          <Button onClick={() => studies.refetch()}>Try again</Button>
          <Button variant="outline" onClick={() => supabase.auth.signOut()}>
            Sign out
          </Button>
        </div>
      </Shell>
    );

  const list = studies.data;
  if (!list.length) {
    if (canCreate.isPending || me.isPending) return <Screen>Loading…</Screen>;
    if (canCreate.data)
      return (
        <Shell title="Create your first study">
          <p className="text-sm text-muted-foreground">
            You can create studies. You become the study's admin and can add the team afterwards.
          </p>
          <CreateStudyForm onCreated={(id) => setChosen(id)} />
          <Button variant="outline" onClick={() => supabase.auth.signOut()}>
            Sign out
          </Button>
        </Shell>
      );
    return (
      <Shell title="Waiting for access">
        <p className="text-sm text-muted-foreground">
          Signed in as <span className="break-all font-medium text-foreground">{me.data}</span>.
        </p>
        <p className="text-sm text-muted-foreground">
          A study admin must add you to a study. Once they have, reload this page.
        </p>
        <a href="/help" className="block text-sm text-muted-foreground underline">
          Read the user manual
        </a>
        <Button variant="outline" onClick={() => supabase.auth.signOut()}>
          Sign out
        </Button>
      </Shell>
    );
  }

  const saved = savedStudyId();
  const study =
    list.find((s) => s.id === chosen) ?? list.find((s) => s.id === saved) ?? (list[0] as Study);
  setActiveStudyId(study.id);
  const select = (id: string) => {
    rememberStudy(id);
    setChosen(id);
  };
  return (
    <ActiveStudyCtx.Provider value={{ study, studies: list, select }}>
      <div key={study.id} className="contents">
        <YearGate>{children}</YearGate>
      </div>
    </ActiveStudyCtx.Provider>
  );
}

function Screen({ children }: { children: ReactNode }) {
  return <div className="p-8 text-sm text-muted-foreground">{children}</div>;
}
function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-4 rounded-lg border bg-card p-6">
        <h1 className="text-xl font-semibold">{title}</h1>
        {children}
      </div>
    </div>
  );
}

/** Creates a study (platform admins only) and reports its id. */
export function CreateStudyForm({
  onCreated,
  autoFocus,
}: {
  onCreated: (id: string) => void;
  autoFocus?: boolean;
}) {
  const [name, setName] = useState("");
  const create = useCreateStudy();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate(name, {
      onSuccess: (id) => {
        toast.success("Study created");
        rememberStudy(id);
        onCreated(id);
      },
      onError: (err) => toast.error(err.message),
    });
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="study-name">Study name</Label>
        <Input
          id="study-name"
          required
          autoFocus={autoFocus}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <Button type="submit" className="w-full" loading={create.isPending} disabled={!name.trim()}>
        Create study
      </Button>
    </form>
  );
}
