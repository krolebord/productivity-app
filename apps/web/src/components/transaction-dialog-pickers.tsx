import { IMPORTANCE_TIERS, type ImportanceTier } from "@productivity/core/transactions";
import type { AccountItem } from "@productivity/core/user-db/migrations";
import { Command as CommandPrimitive } from "cmdk";
import { format, isSameDay, isSameYear, isToday, isYesterday } from "date-fns";
import { CalendarIcon, CheckIcon, ChevronDownIcon, PlusIcon, XIcon } from "lucide-react";
import { type ComponentProps, useState } from "react";
import { IMPORTANCE_STYLE } from "@/lib/finance-ui";
import { useIsDesktop } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { ImportanceBadge } from "./importance-selector";
import { Calendar } from "./ui/calendar";
import { CommandInput, CommandItem, CommandList } from "./ui/command";
import { ResponsivePicker } from "./ui/responsive-picker";
import { TimeInput } from "./ui/time-input";

type ChipProps = ComponentProps<"button"> & {
  empty?: boolean;
  invalid?: boolean;
};

export function Chip({ className, empty, invalid, ...props }: ChipProps) {
  return (
    <button
      type="button"
      aria-invalid={invalid || undefined}
      className={cn(
        "inline-flex h-10 max-w-full items-center gap-1.5 rounded-md px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring md:h-8",
        empty ? "text-muted-foreground hover:bg-muted hover:text-foreground" : "bg-muted hover:bg-accent/60",
        invalid && "ring-2 ring-destructive",
        className,
      )}
      {...props}
    />
  );
}

function PickerOption({ selected, className, children, ...props }: ComponentProps<"button"> & { selected?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-11 w-full items-center gap-2 rounded-md px-2 text-left text-[15px] outline-none hover:bg-accent focus-visible:bg-accent md:h-8 md:text-sm",
        className,
      )}
      {...props}
    >
      {children}
      <CheckIcon className={cn("ml-auto size-4 shrink-0", selected ? "opacity-100" : "opacity-0")} />
    </button>
  );
}

function AccountDot({ color }: { color: string }) {
  return <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />;
}

export function AccountPicker({
  accounts,
  value,
  onChange,
  title,
  invalid,
  showCurrency = true,
}: {
  accounts: AccountItem[];
  value: string;
  onChange: (accountId: string) => void;
  title: string;
  invalid?: boolean;
  showCurrency?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = accounts.find((account) => account.id === value);

  return (
    <ResponsivePicker
      open={open}
      onOpenChange={setOpen}
      title={title}
      trigger={<Chip empty={!selected} invalid={invalid} />}
      triggerContent={
        selected ? (
          <>
            <AccountDot color={selected.labelColor} />
            <span className="truncate">
              {selected.labelText || "Untitled"}
              {showCurrency && <span className="text-muted-foreground"> · {selected.currency}</span>}
            </span>
            <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
          </>
        ) : (
          <>
            <PlusIcon className="size-3.5" />
            Account
          </>
        )
      }
    >
      {accounts.map((account) => (
        <PickerOption
          key={account.id}
          selected={account.id === value}
          onClick={() => {
            onChange(account.id);
            setOpen(false);
          }}
        >
          <AccountDot color={account.labelColor} />
          <span className="truncate">{account.labelText || "Untitled"}</span>
          <span className="text-muted-foreground text-xs">{account.currency}</span>
        </PickerOption>
      ))}
    </ResponsivePicker>
  );
}

export function CategoryPicker({
  categories,
  value,
  onChange,
}: {
  categories: string[];
  value: string;
  onChange: (category: string) => void;
}) {
  const isDesktop = useIsDesktop();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const trimmedSearch = search.trim();
  const canCreate = trimmedSearch !== "" && !categories.some((category) => category === trimmedSearch);

  function select(category: string) {
    onChange(category);
    setOpen(false);
  }

  return (
    <ResponsivePicker
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch("");
      }}
      title="Category"
      trigger={<Chip empty={!value} />}
      triggerContent={
        value ? (
          <span className="truncate">{value}</span>
        ) : (
          <>
            <PlusIcon className="size-3.5" />
            Category
          </>
        )
      }
    >
      <CommandPrimitive loop className="flex flex-col">
        <CommandInput
          autoFocus={isDesktop}
          value={search}
          onValueChange={setSearch}
          placeholder="Search or create…"
          className="text-base md:text-sm"
        />
        <CommandList className="max-h-[50dvh] p-1 md:max-h-72">
          {categories.map((category) => (
            <CommandItem key={category} value={category} onSelect={() => select(category)} className="h-11 md:h-8">
              <span className="truncate">{category}</span>
              <CheckIcon className={cn("ml-auto size-4", category === value ? "opacity-100" : "opacity-0")} />
            </CommandItem>
          ))}
          {canCreate && (
            <CommandItem
              forceMount
              value={`create:${trimmedSearch}`}
              onSelect={() => select(trimmedSearch)}
              className="h-11 text-muted-foreground md:h-8"
            >
              <PlusIcon className="size-4" />
              Create “{trimmedSearch}”
            </CommandItem>
          )}
          {value && trimmedSearch === "" && (
            <CommandItem value="clear:" onSelect={() => select("")} className="h-11 text-muted-foreground md:h-8">
              <XIcon className="size-4" />
              No category
            </CommandItem>
          )}
        </CommandList>
      </CommandPrimitive>
    </ResponsivePicker>
  );
}

export function ImportancePicker({
  value,
  onChange,
}: {
  value: ImportanceTier | null;
  onChange: (importance: ImportanceTier) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <ResponsivePicker
      open={open}
      onOpenChange={setOpen}
      title="Importance"
      popoverClassName="w-48"
      trigger={<Chip empty={!value} className={cn(value && IMPORTANCE_STYLE[value].tintedBadge)} />}
      triggerContent={
        <>
          {value ? <span className="size-1.5 rounded-full bg-current" /> : <PlusIcon className="size-3.5" />}
          {value ? IMPORTANCE_STYLE[value].label : "Importance"}
        </>
      }
    >
      {IMPORTANCE_TIERS.map((tier) => (
        <PickerOption
          key={tier}
          selected={tier === value}
          onClick={() => {
            onChange(tier);
            setOpen(false);
          }}
        >
          <ImportanceBadge importance={tier} />
        </PickerOption>
      ))}
    </ResponsivePicker>
  );
}

function toDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

function toTimeString(value: string) {
  return value.match(/T(\d{2}:\d{2})/)?.[1] ?? "00:00";
}

function formatChipDate(date: Date) {
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, isSameYear(date, new Date()) ? "MMM d" : "MMM d, yyyy");
}

export function DatePicker({
  value,
  onChange,
  invalid,
}: {
  /** Value in `yyyy-MM-dd'T'HH:mm` format (same as datetime-local) */
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = toDate(value);
  const time = toTimeString(value);

  return (
    <ResponsivePicker
      open={open}
      onOpenChange={setOpen}
      title="Date and time"
      popoverClassName="w-auto"
      trigger={<Chip invalid={invalid} className="text-muted-foreground" />}
      triggerContent={
        <>
          <CalendarIcon className="size-3.5" />
          {selected ? `${formatChipDate(selected)} · ${time}` : "Pick a date"}
        </>
      }
    >
      <Calendar
        mode="single"
        required
        selected={selected}
        defaultMonth={selected}
        onSelect={(day) => {
          if (!day) return;
          onChange(`${format(day, "yyyy-MM-dd")}T${time}`);
          if (selected && isSameDay(day, selected)) setOpen(false);
        }}
        className="mx-auto border-b"
      />
      <div className="px-3 py-2">
        <TimeInput
          value={time}
          onChange={(nextTime) => onChange(`${format(selected ?? new Date(), "yyyy-MM-dd")}T${nextTime}`)}
          className="w-full"
        />
      </div>
    </ResponsivePicker>
  );
}
