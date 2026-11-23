import { useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useActiveStudy } from "./active-study-context";
import { CreateStudyForm } from "./study-gate";

/** Shows the active study and lets people switch or start another. */
export function StudySwitcher({
  period,
  variant,
}: {
  period?: string;
  variant: "sidebar" | "header";
}) {
  const { study, studies, select } = useActiveStudy();
  const [creating, setCreating] = useState(false);
  const side = variant === "sidebar";
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            aria-label="Switch study"
            className={cn(
              "h-auto min-w-0 justify-between gap-2 px-2 py-1.5 text-left font-medium",
              side
                ? "w-full text-sidebar-accent-foreground hover:bg-sidebar-accent"
                : "max-w-full flex-1 md:hidden",
            )}
          >
            <span className="min-w-0">
              <span className="block truncate text-sm">{study.name}</span>
              {period && (
                <span
                  className={cn(
                    "block truncate text-xs font-normal",
                    side ? "text-sidebar-foreground" : "text-muted-foreground",
                  )}
                >
                  {period}
                </span>
              )}
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64 max-w-[calc(100vw-1.5rem)]">
          <DropdownMenuLabel>Studies</DropdownMenuLabel>
          {studies.map((s) => (
            <DropdownMenuItem key={s.id} onSelect={() => select(s.id)}>
              <span className="min-w-0 flex-1 truncate">{s.name}</span>
              {s.id === study.id && <Check className="h-4 w-4" aria-label="Current study" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            New study
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={creating} onOpenChange={setCreating}>
        <NewStudyDialogBody
          onCreated={(id) => {
            select(id);
            setCreating(false);
          }}
        />
      </Dialog>
    </>
  );
}

function NewStudyDialogBody({ onCreated }: { onCreated: (id: string) => void }) {
  return (
    <DialogContent className="max-w-sm">
      <DialogHeader>
        <DialogTitle>New study</DialogTitle>
        <DialogDescription>You become its admin and can add the team afterwards.</DialogDescription>
      </DialogHeader>
      <CreateStudyForm autoFocus onCreated={onCreated} />
    </DialogContent>
  );
}
