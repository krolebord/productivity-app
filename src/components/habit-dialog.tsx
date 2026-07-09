import { generateId } from "@sqlite-sync/core";
import { useStore } from "@tanstack/react-form";
import { Archive, ArchiveRestore } from "lucide-react";
import { useCallback } from "react";
import { z } from "zod";
import { create } from "zustand";
import { combine } from "zustand/middleware";
import { createDynamicValidationLogic, dynamicZodValidators } from "@/lib/form-schemas";
import { cn } from "@/lib/utils";
import type { HabitItem } from "@/user-db/migrations";
import { useDb, useDbQuery } from "@/user-db/user-db";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "./ui/dialog";
import { useAppForm } from "./ui/form";
import { SelectItem } from "./ui/select";

export type HabitScheduleType = HabitItem["scheduleType"];
export type HabitTimeOfDay = NonNullable<HabitItem["timeOfDay"]>;

const SCHEDULE_TYPES = [
  { value: "daily", label: "Every day" },
  { value: "weekly", label: "Once a week" },
  { value: "everyNDays", label: "Every N days" },
  { value: "weekdays", label: "Specific weekdays" },
] as const satisfies ReadonlyArray<{ value: HabitScheduleType; label: string }>;

const TIME_OF_DAY_OPTIONS = [
  { value: "anytime", label: "Anytime" },
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "evening", label: "Evening" },
  { value: "night", label: "Night" },
] as const;

const WEEKDAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 7, label: "Sun" },
] as const;

const habitFormSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required."),
    scheduleType: z.enum(["daily", "weekly", "everyNDays", "weekdays"]),
    scheduleInterval: z.string(),
    scheduleWeekdays: z.array(z.number().int().min(1).max(7)),
    timeOfDay: z.enum(["anytime", "morning", "afternoon", "evening", "night"]),
    target: z.string(),
    unit: z.string(),
  })
  .superRefine((value, ctx) => {
    if (value.scheduleType === "everyNDays") {
      const interval = Number.parseInt(value.scheduleInterval, 10);
      if (!Number.isInteger(interval) || interval < 1) {
        ctx.addIssue({
          code: "custom",
          message: "Interval must be a whole number of at least 1.",
          path: ["scheduleInterval"],
        });
      }
    }

    if (value.scheduleType === "weekdays" && value.scheduleWeekdays.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "Pick at least one weekday.",
        path: ["scheduleWeekdays"],
      });
    }

    const target = Number.parseFloat(value.target);
    if (!Number.isFinite(target) || target < 1) {
      ctx.addIssue({
        code: "custom",
        message: "Target must be a number of at least 1.",
        path: ["target"],
      });
    }
  });

export function parseScheduleWeekdays(raw: string): number[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((n): n is number => typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 7);
  } catch {
    return [];
  }
}

export const useHabitDialogStore = create(
  combine(
    {
      isOpen: false as boolean,
      mode: null as "create" | "edit" | null,
      habitId: null as string | null,
      openRevision: 0,
    },
    (set, get) => ({
      openCreate: () => set({ isOpen: true, mode: "create", habitId: null, openRevision: get().openRevision + 1 }),
      openEdit: (id: string) => set({ isOpen: true, mode: "edit", habitId: id, openRevision: get().openRevision + 1 }),
      close: () => set({ isOpen: false, mode: null, habitId: null }),
    }),
  ),
);

export function useCreateHabit() {
  const openCreate = useHabitDialogStore((s) => s.openCreate);
  return useCallback(() => openCreate(), [openCreate]);
}

function HabitDialogContent() {
  const { mode, habitId } = useHabitDialogStore();
  const closeDialog = useHabitDialogStore((x) => x.close);
  const db = useDb();

  const { data: existingHabits } = useDbQuery((q) =>
    q
      .selectFrom("habit")
      .selectAll()
      .where("id", "=", habitId ?? ""),
  );
  const existing = mode === "edit" ? existingHabits[0] : undefined;
  const isArchived = existing?.archivedAt != null;

  function persistHabit(value: z.infer<typeof habitFormSchema>) {
    const now = Date.now();
    const scheduleType = value.scheduleType;
    const scheduleInterval =
      scheduleType === "everyNDays" ? Math.max(1, Number.parseInt(value.scheduleInterval, 10) || 1) : 1;
    const scheduleWeekdays =
      scheduleType === "weekdays" ? JSON.stringify([...value.scheduleWeekdays].sort((a, b) => a - b)) : "[]";
    const timeOfDay = value.timeOfDay === "anytime" ? null : value.timeOfDay;
    const target = Math.max(1, Number.parseFloat(value.target) || 1);
    const unit = value.unit.trim();
    const name = value.name.trim();

    if (mode === "create") {
      const id = generateId();

      db.db.executeTransaction((trx) => {
        const [maxOrderRow] = trx.executeKysely((q) =>
          q.selectFrom("habit").select((eb) => eb.fn.max("order").as("maxOrder")),
        ).rows;
        const maxOrder = Number(maxOrderRow?.maxOrder ?? 0);

        trx.executeKysely((q) =>
          q.insertInto("habit").values({
            id,
            name,
            scheduleType,
            scheduleInterval,
            scheduleWeekdays,
            timeOfDay,
            target,
            unit,
            order: maxOrder + 1,
            archivedAt: null,
            createdAt: now,
            updatedAt: now,
            tombstone: false,
          }),
        );
      });

      closeDialog();
      return;
    }

    if (mode !== "edit" || !habitId || !existing) {
      return;
    }

    db.db.executeKysely((q) =>
      q
        .updateTable("habit")
        .set({
          name,
          scheduleType,
          scheduleInterval,
          scheduleWeekdays,
          timeOfDay,
          target,
          unit,
          updatedAt: now,
        })
        .where("id", "=", habitId),
    );

    closeDialog();
  }

  function toggleArchive() {
    if (!habitId || !existing) return;
    const now = Date.now();
    db.db.executeKysely((q) =>
      q
        .updateTable("habit")
        .set({
          archivedAt: isArchived ? null : now,
          updatedAt: now,
        })
        .where("id", "=", habitId),
    );
    closeDialog();
  }

  const form = useAppForm({
    validationLogic: createDynamicValidationLogic(),
    validators: dynamicZodValidators(habitFormSchema),
    defaultValues: {
      name: existing?.name ?? "",
      scheduleType: (existing?.scheduleType ?? "daily") as HabitScheduleType,
      scheduleInterval: String(existing?.scheduleInterval ?? 3),
      scheduleWeekdays: existing ? parseScheduleWeekdays(existing.scheduleWeekdays) : [],
      timeOfDay: (existing?.timeOfDay ?? "anytime") as "anytime" | HabitTimeOfDay,
      target: String(existing?.target ?? 1),
      unit: existing?.unit ?? "",
    },
    onSubmit: ({ value }) => {
      persistHabit(value);
    },
  });

  const scheduleType = useStore(form.store, (state) => state.values.scheduleType);

  return (
    <>
      <DialogTitle>{mode === "create" ? "New habit" : "Edit habit"}</DialogTitle>
      <DialogDescription className="sr-only">Create or edit a habit and its schedule.</DialogDescription>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          form.handleSubmit();
        }}
        className="flex flex-col gap-4"
      >
        <form.AppField name="name">
          {(field) => (
            <field.FormInput
              placeholder="Habit name"
              className="rounded-none border-0 border-b bg-transparent! px-0 font-semibold text-base shadow-none focus-visible:border-primary focus-visible:ring-0"
            />
          )}
        </form.AppField>

        <form.AppField name="scheduleType">
          {(field) => (
            <field.FieldContainer labelText="Schedule">
              <field.FormSelect placeholder="Select schedule">
                {SCHEDULE_TYPES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </field.FormSelect>
            </field.FieldContainer>
          )}
        </form.AppField>

        {scheduleType === "everyNDays" && (
          <form.AppField name="scheduleInterval">
            {(field) => (
              <field.FieldContainer labelText="Every N days">
                <field.FormInput
                  type="number"
                  min={1}
                  step={1}
                  className="font-mono tabular-nums [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
              </field.FieldContainer>
            )}
          </form.AppField>
        )}

        {scheduleType === "weekdays" && (
          <form.AppField name="scheduleWeekdays">
            {(field) => (
              <field.FieldContainer labelText="Weekdays">
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAYS.map((day) => {
                    const selected = field.state.value.includes(day.value);
                    return (
                      <button
                        key={day.value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => {
                          const next = selected
                            ? field.state.value.filter((d) => d !== day.value)
                            : [...field.state.value, day.value].sort((a, b) => a - b);
                          field.handleChange(next);
                        }}
                        className={cn(
                          "rounded-md border px-2.5 py-1.5 font-medium text-sm transition-colors",
                          selected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-input bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                      >
                        {day.label}
                      </button>
                    );
                  })}
                </div>
              </field.FieldContainer>
            )}
          </form.AppField>
        )}

        <form.AppField name="timeOfDay">
          {(field) => (
            <field.FieldContainer labelText="Time of day">
              <div className="grid h-auto grid-cols-2 gap-1 rounded-md border border-input bg-muted/50 p-1 sm:grid-cols-5">
                {TIME_OF_DAY_OPTIONS.map((option) => {
                  const isActive = field.state.value === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => field.handleChange(option.value)}
                      className={cn(
                        "flex min-w-0 items-center justify-center rounded-sm px-1.5 py-1.5 font-medium text-sm transition-all",
                        isActive
                          ? "bg-background text-foreground shadow-sm dark:bg-input/50"
                          : "text-muted-foreground hover:bg-background/50 hover:text-foreground",
                      )}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </field.FieldContainer>
          )}
        </form.AppField>

        <div className="flex gap-3">
          <form.AppField name="target">
            {(field) => (
              <field.FieldContainer labelText="Target" className="flex-1">
                <field.FormInput
                  type="number"
                  min={1}
                  step="any"
                  className="font-mono tabular-nums [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
              </field.FieldContainer>
            )}
          </form.AppField>

          <form.AppField name="unit">
            {(field) => (
              <field.FieldContainer labelText="Unit" className="flex-1">
                <field.FormInput placeholder="pages, minutes…" />
              </field.FieldContainer>
            )}
          </form.AppField>
        </div>

        {mode === "edit" && (
          <Button type="button" variant="outline" className="w-full justify-start gap-2" onClick={toggleArchive}>
            {isArchived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
            {isArchived ? "Unarchive habit" : "Archive habit"}
          </Button>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={closeDialog}>
            Cancel
          </Button>
          <Button type="submit">{mode === "create" ? "Create" : "Save"}</Button>
        </DialogFooter>
      </form>
    </>
  );
}

export function HabitDialog() {
  const isOpen = useHabitDialogStore((x) => x.isOpen);
  const openRevision = useHabitDialogStore((x) => x.openRevision);
  const closeDialog = useHabitDialogStore((x) => x.close);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closeDialog()}>
      <DialogContent className="sm:max-w-md">
        <HabitDialogContent key={openRevision} />
      </DialogContent>
    </Dialog>
  );
}
