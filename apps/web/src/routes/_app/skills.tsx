import { BUILTIN_SKILLS, type BuiltinSkill } from "@productivity/core/agent/builtin-skills";
import {
  deleteSkill,
  isBlankSkill,
  type SkillFields,
  type SkillRow,
  type SkillStatus,
  saveSkill,
  setSkillStatus,
  useSkills,
} from "@productivity/core/data/skills";
import { useDb } from "@productivity/core/user-db/db-context";
import { generateId } from "@sqlite-sync/core";
import { useHotkey } from "@tanstack/react-hotkeys";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown, PlusIcon, Trash2, Workflow } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { useConfirmDialogStore } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const skillsSearchSchema = z.object({
  selected: z.string().optional(),
});

export const Route = createFileRoute("/_app/skills")({
  component: SkillsPage,
  validateSearch: skillsSearchSchema,
});

const STATUS_META: Record<SkillStatus, { label: string; className: string }> = {
  pending: { label: "Pending review", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  active: { label: "Active", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  disabled: { label: "Disabled", className: "bg-muted text-muted-foreground" },
};

function SkillEditor({
  skill,
  draft = false,
  onFieldsChange,
  onClose,
}: {
  skill: SkillFields & { id: string };
  /** A new skill without a row yet: Save inserts it once it has content, Cancel leaves nothing. */
  draft?: boolean;
  /** Reports every edit, so a draft's text outlives the editor while another skill is open. */
  onFieldsChange?: (fields: SkillFields) => void;
  onClose: () => void;
}) {
  const db = useDb();
  const confirm = useConfirmDialogStore((s) => s.confirm);
  const [fields, setFields] = useState<SkillFields>(() => ({
    name: skill.name,
    whenToUse: skill.whenToUse,
    instructions: skill.instructions,
  }));
  const { name, whenToUse, instructions } = fields;

  useHotkey("Escape", () => onClose());

  function update(patch: Partial<SkillFields>) {
    const next = { ...fields, ...patch };
    setFields(next);
    onFieldsChange?.(next);
  }

  function save() {
    saveSkill(db.db, skill.id, fields, { draft });
    onClose();
  }

  function remove() {
    confirm({
      title: "Delete skill",
      description: `"${skill.name || "Untitled"}" will be permanently deleted. This cannot be undone.`,
      confirmLabel: "Delete",
      onConfirm: () => {
        deleteSkill(db.db, skill.id);
        onClose();
      },
    });
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      <Input value={name} onChange={(e) => update({ name: e.target.value })} placeholder="Skill name" />
      <Input
        value={whenToUse}
        onChange={(e) => update({ whenToUse: e.target.value })}
        placeholder="When to use this skill…"
      />
      <Textarea
        value={instructions}
        onChange={(e) => update({ instructions: e.target.value })}
        rows={8}
        placeholder="Step-by-step instructions (markdown)…"
        className="resize-y font-mono text-xs"
      />
      <div className="flex items-center gap-2">
        {!draft && (
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
        )}
        <div className="ml-auto flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={save} disabled={draft && isBlankSkill(fields)}>
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
    setSkillStatus(db.db, skill.id, status);
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

type SkillDraft = SkillFields & { id: string };

function NewSkillCard({
  draft,
  onChange,
  onClose,
}: {
  draft: SkillDraft;
  onChange: (draft: SkillDraft) => void;
  onClose: () => void;
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="font-medium">New skill</p>
      <SkillEditor
        skill={draft}
        draft
        onFieldsChange={(fields) => onChange({ ...fields, id: draft.id })}
        onClose={onClose}
      />
    </div>
  );
}

function BuiltinSkillCard({ skill }: { skill: BuiltinSkill }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{skill.name}</p>
          <p className="text-muted-foreground text-sm">{skill.whenToUse}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className={cn("rounded-full px-2 py-0.5 font-medium text-xs", STATUS_META.active.className)}>
            Active
          </span>
          <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground text-xs">Built-in</span>
        </div>
      </div>
      <div className="mt-3">
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen((value) => !value)}>
          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
          {open ? "Hide" : "View"}
        </Button>
        {open && (
          <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-3 font-mono text-muted-foreground text-xs">
            {skill.instructions}
          </pre>
        )}
      </div>
    </div>
  );
}

function SkillsPage() {
  const { selected } = Route.useSearch();
  const navigate = Route.useNavigate();

  // An unsaved new skill, edited in a card above the list until it's saved. Its text lives here,
  // so opening another skill (here or from the assistant's "Review" link) only hides the card.
  const [draft, setDraft] = useState<SkillDraft>();

  const setSelected = (id: string | undefined) =>
    navigate({ search: (prev) => ({ ...prev, selected: id }), replace: true });

  const skills = useSkills();
  // One editor at a time: the draft card shows whenever no existing skill's editor is open.
  const editingExisting = skills.some((skill) => skill.id === selected);

  function newSkill() {
    setSelected(undefined);
    if (!draft) setDraft({ id: generateId(), name: "", whenToUse: "", instructions: "" });
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

      <div className="flex flex-col gap-6">
        {draft && !editingExisting && (
          <NewSkillCard key={draft.id} draft={draft} onChange={setDraft} onClose={() => setDraft(undefined)} />
        )}

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

        {skills.length === 0 && !draft && (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed bg-card px-6 py-10 text-center">
            <Workflow className="size-8 text-muted-foreground" />
            <div>
              <p className="font-medium">No skills of your own yet</p>
              <p className="text-muted-foreground text-sm">
                Create one, or ask the assistant to save a multi-step task it just completed as a skill.
              </p>
            </div>
          </div>
        )}

        {BUILTIN_SKILLS.length > 0 && (
          <div>
            <h2 className="mb-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">Built-in</h2>
            <div className="flex flex-col gap-2">
              {BUILTIN_SKILLS.map((skill) => (
                <BuiltinSkillCard key={skill.id} skill={skill} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
