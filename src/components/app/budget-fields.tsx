import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ActivityOption } from "@/lib/budget-tree";
import { cn } from "@/lib/utils";

/** Free-text unit with suggestions. Pick one from the list or type any value. */
export function UnitInput({
  id,
  value,
  onChange,
  suggestions,
  placeholder,
  disabled,
  className,
  "aria-label": ariaLabel,
}: {
  id?: string;
  className?: string;
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  placeholder?: string;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const typed = search.trim().slice(0, 40);
  const known = suggestions.some((s) => s.toLowerCase() === typed.toLowerCase());
  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    setSearch("");
  };
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setSearch("");
      }}
      modal
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", className)}
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value || placeholder || "Choose a unit"}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-48 p-0" align="start">
        <Command>
          <CommandInput
            placeholder="Search or type a unit"
            value={search}
            onValueChange={setSearch}
            maxLength={40}
          />
          <CommandList>
            <CommandEmpty>Type a unit to add it.</CommandEmpty>
            {typed && !known && (
              <CommandGroup>
                <CommandItem value={`use ${typed}`} onSelect={() => pick(typed)}>
                  <Plus className="size-4" />
                  Use &ldquo;{typed}&rdquo;
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup>
              {suggestions.map((s) => (
                <CommandItem key={s} value={s} onSelect={() => pick(s)}>
                  <Check className={cn("size-4", s === value ? "opacity-100" : "opacity-0")} />
                  {s}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Activity choice grouped by objective and outcome, with search. */
export function ActivityPicker({
  value,
  onChange,
  options,
  label = "Activity",
  placeholder = "Choose an activity",
  disabled,
  exclude,
}: {
  value: string;
  onChange: (id: string) => void;
  options: ActivityOption[];
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  exclude?: string;
}) {
  const [open, setOpen] = useState(false);
  const shown = useMemo(() => options.filter((o) => o.id !== exclude), [options, exclude]);
  const groups = useMemo(() => {
    const m = new Map<string, ActivityOption[]>();
    for (const o of shown) m.set(o.group, [...(m.get(o.group) ?? []), o]);
    return [...m.entries()];
  }, [shown]);
  const current = options.find((o) => o.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", !current && "text-muted-foreground")}>
            {current?.label ?? placeholder}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search activities" />
          <CommandList>
            <CommandEmpty>No matching activity.</CommandEmpty>
            {groups.map(([g, items]) => (
              <CommandGroup key={g} heading={g}>
                {items.map((o) => (
                  <CommandItem
                    key={o.id}
                    value={`${o.group} ${o.label} ${o.id}`}
                    onSelect={() => {
                      onChange(o.id);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn("size-4", o.id === value ? "opacity-100" : "opacity-0")} />
                    <span className="truncate">{o.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
