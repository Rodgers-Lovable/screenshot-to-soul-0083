import { useId, useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ActivityOption } from "@/lib/budget-tree";
import { cn } from "@/lib/utils";

/** Free-text unit with suggestions. Any value can be typed. */
export function UnitInput({
  id,
  value,
  onChange,
  suggestions,
  placeholder,
  disabled,
  "aria-label": ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  placeholder?: string;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  const list = useId();
  return (
    <>
      <Input
        id={id}
        list={list}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel}
        autoComplete="off"
        maxLength={40}
      />
      <datalist id={list}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </>
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
