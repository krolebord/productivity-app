import { generateId } from "@sqlite-sync/core";
import { useHotkey } from "@tanstack/react-hotkeys";
import { createFileRoute } from "@tanstack/react-router";
import { PlusIcon, Trash2, Workflow } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { useConfirmDialogStore } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { SkillItem } from "@/user-db/migrations";
import { useDb, useDbQuery } from "@/user-db/user-db";

const skillsSearchSchema = z.object({
  selected: z.string().optional(),
});

export const Route = createFileRoute("/_app/skills")({
  component: SkillsPage,
  validateSearch: skillsSearchSchema,
});

type SkillRow = Pick<SkillItem, "id" | "name" | "whenToUse" | "instructions" | "source" | "status" | "createdAt">;

type SkillStatus = SkillItem["status"];

const STATUS_META: Record<SkillStatus, { label: string; className: string }> = {
  pending: { label: "Pending review", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  active: { label: "Active", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  disabled: { label: "Disabled", className: "bg-muted text-muted-foreground" },
};

function SkillEditor({ skill, onClose }: { skill: SkillRow; onClose: () => void }) {
  const db = useDb();
  const confirm = useConfirmDialogStore((s) => s.confirm);
  const [name, setName] = useState(skill.name);
  const [whenToUse, setWhenToUse] = useState(skill.whenToUse);
  const [instructions, setInstructions] = useState(skill.instructions);

  useHotkey("Escape", () => onClose());

  function save() {
    db.db.executeKysely((q) =>
      q
        .updateTable("skill")
        .set({
          name: name.trim(),
          whenToUse: whenToUse.trim(),
          instructions: instructions.trim(),
          updatedAt: Date.now(),
        })
        .where("id", "=", skill.id),
    );
    onClose();
  }

  function remove() {
    confirm({
      title: "Delete skill",
      description: `"${skill.name || "Untitled"}" will be permanently deleted. This cannot be undone.`,
      confirmLabel: "Delete",
      onConfirm: () => {
        db.db.executeKysely((q) => q.deleteFrom("skill").where("id", "=", skill.id));
        onClose();
      },
    });
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Skill name" />
      <Input value={whenToUse} onChange={(e) => setWhenToUse(e.target.value)} placeholder="When to use this skill…" />
      <Textarea
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        rows={8}
        placeholder="Step-by-step instructions (markdown)…"
        className="resize-y font-mono text-xs"
      />
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground hover:text-destructive"
          aria-label="Delete skill"
          onClick={remove}
        >
          <Trash2 className="size-4" />
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={save}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

function SkillCard({
  skill,
  editing,
  onEdit,
  onClose,
}: {
  skill: SkillRow;
  editing: boolean;
  onEdit: () => void;
  onClose: () => void;
}) {
  const db = useDb();

  function setStatus(status: SkillStatus) {
    db.db.executeKysely((q) =>
      q.updateTable("skill").set({ status, updatedAt: Date.now() }).where("id", "=", skill.id),
    );
  }

  const meta = STATUS_META[skill.status];

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{skill.name || "Untitled skill"}</p>
          <p className="text-muted-foreground text-sm">{skill.whenToUse || "No trigger description"}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className={cn("rounded-full px-2 py-0.5 font-medium text-xs", meta.className)}>{meta.label}</span>
          <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground text-xs">
            {skill.source === "assistant" ? "Assistant" : "You"}
          </span>
        </div>
      </div>

      {editing ? (
        <SkillEditor key={skill.id} skill={skill} onClose={onClose} />
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onEdit}>
            Edit
          </Button>
          {skill.status !== "active" && (
            <Button type="button" size="sm" onClick={() => setStatus("active")}>
              Activate
            </Button>
          )}
          {skill.status === "active" && (
            <Button type="button" variant="outline" size="sm" onClick={() => setStatus("disabled")}>
              Disable
            </Button>
          )}
          {skill.status === "disabled" && (
            <Button type="button" variant="outline" size="sm" onClick={() => setStatus("active")}>
              Enable
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function SkillsPage() {
  const db = useDb();
  const { selected } = Route.useSearch();
  const navigate = Route.useNavigate();

  const setSelected = (id: string | undefined) =>
    navigate({ search: (prev) => ({ ...prev, selected: id }), replace: true });

  const { data: skills } = useDbQuery((db) =>
    db
      .selectFrom("skill")
      .select(["id", "name", "whenToUse", "instructions", "source", "status", "createdAt"])
      .orderBy("updatedAt", "desc"),
  );

  function newSkill() {
    const id = generateId();
    const now = Date.now();
    db.db.executeKysely((q) =>
      q.insertInto("skill").values({
        id,
        name: "",
        whenToUse: "",
        instructions: "",
        source: "user",
        status: "active",
        lastUsedAt: null,
        createdAt: now,
        updatedAt: now,
        tombstone: false,
      }),
    );
    setSelected(id);
  }

  const pending = skills.filter((s) => s.status === "pending");
  const active = skills.filter((s) => s.status === "active");
  const disabled = skills.filter((s) => s.status === "disabled");

  const sections: { key: SkillStatus; title: string; items: SkillRow[] }[] = [
    { key: "pending", title: "Pending review", items: pending },
    { key: "active", title: "Active", items: active },
    { key: "disabled", title: "Disabled", items: disabled },
  ];

  return (
    <div className="mx-auto max-w-2xl px-4 py-4 sm:px-6 sm:py-6">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h1 className="font-semibold text-xl">Skills</h1>
          <p className="text-muted-foreground text-sm">
            Reusable playbooks the assistant can follow. Active ones are offered in new chats and matched automatically.
          </p>
        </div>
        <Button type="button" size="sm" onClick={newSkill}>
          <PlusIcon />
          New
        </Button>
      </div>

      {skills.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed bg-card px-6 py-14 text-center">
          <Workflow className="size-8 text-muted-foreground" />
          <div>
            <p className="font-medium">No skills yet</p>
            <p className="text-muted-foreground text-sm">
              Create one, or ask the assistant to save a multi-step task it just completed as a skill.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {sections.map(
            (section) =>
              section.items.length > 0 && (
                <div key={section.key}>
                  <h2 className="mb-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    {section.title}
                  </h2>
                  <div className="flex flex-col gap-2">
                    {section.items.map((skill) => (
                      <SkillCard
                        key={skill.id}
                        skill={skill}
                        editing={skill.id === selected}
                        onEdit={() => setSelected(skill.id)}
                        onClose={() => setSelected(undefined)}
                      />
                    ))}
                  </div>
                </div>
              ),
          )}
        </div>
      )}
    </div>
  );
}
