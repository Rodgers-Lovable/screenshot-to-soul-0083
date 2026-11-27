import { useState } from "react";
import { toast } from "sonner";
import { Archive, ArchiveRestore, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useYear } from "@/components/app/active-year-context";
import { useAddSite, useArchiveSite, useRenameSite, useWorkplan } from "@/data/hooks";

export function SitesPanel() {
  const { isAdmin } = useYear();
  const wp = useWorkplan();
  const add = useAddSite();
  const rename = useRenameSite();
  const archive = useArchiveSite();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [en, setEn] = useState("");
  const sites = [...(wp.data?.sites ?? [])].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
  );
  const active = sites.filter((s) => !s.archivedAt);
  const archived = sites.filter((s) => s.archivedAt);
  const row = (s: (typeof sites)[number]) => (
    <li key={s.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
      {editing === s.id ? (
        <>
          <Input
            aria-label="Site name"
            className="min-w-40 flex-1"
            value={en}
            onChange={(e) => setEn(e.target.value)}
          />
          <Button
            size="sm"
            loading={rename.isPending}
            disabled={!en.trim()}
            onClick={() =>
              rename.mutate({ id: s.id, name: en }, { onSuccess: () => setEditing(null) })
            }
          >
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
            Cancel
          </Button>
        </>
      ) : (
        <>
          <span
            className={`mr-auto min-w-0 break-words ${s.archivedAt ? "text-muted-foreground" : ""}`}
          >
            {s.name}
          </span>
          {isAdmin && (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(s.id);
                  setEn(s.name);
                }}
              >
                <Pencil className="h-4 w-4" />
                Rename
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  archive.mutate(
                    { id: s.id, archived: !s.archivedAt },
                    {
                      onSuccess: () =>
                        toast.success(s.archivedAt ? "Site restored" : "Site archived"),
                    },
                  )
                }
              >
                {s.archivedAt ? (
                  <>
                    <ArchiveRestore className="h-4 w-4" />
                    Restore
                  </>
                ) : (
                  <>
                    <Archive className="h-4 w-4" />
                    Archive
                  </>
                )}
              </Button>
            </>
          )}
        </>
      )}
    </li>
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sites</CardTitle>
        <CardDescription>
          One list for the whole study. Each site activity picks the sites where it runs. Archive a
          site to stop using it; past years keep it.
          {!isAdmin && " Only study admins can change the list."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {wp.isError && (
          <p className="text-sm text-destructive">Could not load sites: {wp.error.message}</p>
        )}
        {!active.length && wp.isSuccess && (
          <p className="text-sm text-muted-foreground">No sites yet.</p>
        )}
        {active.length > 0 && (
          <ul className="divide-y rounded-md border text-sm">{active.map(row)}</ul>
        )}
        {isAdmin && (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              add.mutate(name, {
                onSuccess: () => {
                  setName("");
                  toast.success("Site added");
                },
              });
            }}
          >
            <Input
              aria-label="New site"
              placeholder="Site name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Button type="submit" loading={add.isPending} disabled={!name.trim()}>
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </form>
        )}
        {archived.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Archived
            </p>
            <ul className="divide-y rounded-md border text-sm">{archived.map(row)}</ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
