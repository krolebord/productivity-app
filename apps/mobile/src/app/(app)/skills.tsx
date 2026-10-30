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
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Alert, Pressable, ScrollView, type ScrollViewInstance, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "../../components/screen-header";
import { EmptyState } from "../../components/ui/empty-state";
import { Icon } from "../../components/ui/icon";
import { IconButton } from "../../components/ui/icon-button";
import { Input } from "../../components/ui/input";
import { cn } from "../../lib/utils";

const STATUS_META: Record<SkillStatus, { label: string; badge: string; text: string }> = {
  pending: { label: "Pending review", badge: "bg-amber-500/15", text: "text-amber-700 dark:text-amber-400" },
  active: { label: "Active", badge: "bg-emerald-500/15", text: "text-emerald-700 dark:text-emerald-400" },
  disabled: { label: "Disabled", badge: "bg-muted", text: "text-muted-foreground" },
};

const SECTIONS: { status: SkillStatus; title: string }[] = [
  { status: "pending", title: "Pending review" },
  { status: "active", title: "Active" },
  { status: "disabled", title: "Disabled" },
];

function Badge({ label, badge, text }: { label: string; badge: string; text: string }) {
  return (
    <View className={cn("rounded-full px-2 py-0.5", badge)}>
      <Text className={cn("font-medium text-xs", text)}>{label}</Text>
    </View>
  );
}

function SmallButton({
  label,
  onPress,
  primary = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      className={cn(
        "h-9 items-center justify-center rounded-lg px-3 active:opacity-70 disabled:opacity-40",
        primary ? "bg-primary" : "border border-border bg-card",
      )}
    >
      <Text className={cn("font-medium text-sm", primary ? "text-primary-foreground" : "text-foreground")}>
        {label}
      </Text>
    </Pressable>
  );
}

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
  const [fields, setFields] = useState<SkillFields>(() => ({
    name: skill.name,
    whenToUse: skill.whenToUse,
    instructions: skill.instructions,
  }));
  const { name, whenToUse, instructions } = fields;

  const update = (patch: Partial<SkillFields>) => {
    const next = { ...fields, ...patch };
    setFields(next);
    onFieldsChange?.(next);
  };

  const save = () => {
    saveSkill(db.db, skill.id, fields, { draft });
    onClose();
  };

  const remove = () =>
    Alert.alert("Delete skill?", `"${skill.name || "Untitled"}" will be permanently deleted.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          deleteSkill(db.db, skill.id);
          onClose();
        },
      },
    ]);

  return (
    <View className="mt-3 gap-2">
      <Input
        value={name}
        onChangeText={(text) => update({ name: text })}
        placeholder="Skill name"
        className="h-10 rounded-lg border border-border px-3"
      />
      <Input
        value={whenToUse}
        onChangeText={(text) => update({ whenToUse: text })}
        placeholder="When to use this skill…"
        multiline
        className="min-h-10 rounded-lg border border-border px-3 py-2"
      />
      <Input
        value={instructions}
        onChangeText={(text) => update({ instructions: text })}
        placeholder="Step-by-step instructions (markdown)…"
        multiline
        textAlignVertical="top"
        className="rounded-lg border border-border px-3 py-2 font-mono text-sm"
        style={{ minHeight: 160 }}
      />
      <View className="flex-row items-center gap-2">
        {!draft && (
          <IconButton
            icon="trash-2"
            label="Delete skill"
            onPress={remove}
            iconClassName="accent-destructive"
            size={18}
          />
        )}
        <View className="ml-auto flex-row gap-2">
          <SmallButton label="Cancel" onPress={onClose} />
          <SmallButton label="Save" onPress={save} primary disabled={draft && isBlankSkill(fields)} />
        </View>
      </View>
    </View>
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
  const setStatus = (status: SkillStatus) => setSkillStatus(db.db, skill.id, status);

  return (
    <View className="rounded-xl border border-border bg-card p-4">
      <View className="flex-row items-start gap-2">
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="font-medium text-base text-foreground">
            {skill.name || "Untitled skill"}
          </Text>
          <Text className="text-muted-foreground text-sm">{skill.whenToUse || "No trigger description"}</Text>
        </View>
        <View className="items-end gap-1">
          <Badge {...STATUS_META[skill.status]} />
          <Badge
            label={skill.source === "assistant" ? "Assistant" : "You"}
            badge="bg-muted"
            text="text-muted-foreground"
          />
        </View>
      </View>
      {editing ? (
        <SkillEditor key={skill.id} skill={skill} onClose={onClose} />
      ) : (
        <View className="mt-3 flex-row flex-wrap gap-2">
          <SmallButton label="Edit" onPress={onEdit} />
          {skill.status !== "active" && (
            <SmallButton
              label={skill.status === "disabled" ? "Enable" : "Activate"}
              onPress={() => setStatus("active")}
              primary
            />
          )}
          {skill.status === "active" && <SmallButton label="Disable" onPress={() => setStatus("disabled")} />}
        </View>
      )}
    </View>
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
    <View className="rounded-xl border border-border bg-card p-4">
      <Text className="font-medium text-base text-foreground">New skill</Text>
      <SkillEditor
        skill={draft}
        draft
        onFieldsChange={(fields) => onChange({ ...fields, id: draft.id })}
        onClose={onClose}
      />
    </View>
  );
}

function BuiltinSkillCard({ skill }: { skill: BuiltinSkill }) {
  const [open, setOpen] = useState(false);
  return (
    <View className="rounded-xl border border-border bg-card p-4">
      <View className="flex-row items-start gap-2">
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="font-medium text-base text-foreground">
            {skill.name}
          </Text>
          <Text className="text-muted-foreground text-sm">{skill.whenToUse}</Text>
        </View>
        <View className="items-end gap-1">
          <Badge {...STATUS_META.active} />
          <Badge label="Built-in" badge="bg-muted" text="text-muted-foreground" />
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        className="mt-3 h-9 flex-row items-center gap-1.5 self-start rounded-lg border border-border px-3 active:opacity-70"
      >
        <Icon name={open ? "chevron-up" : "chevron-down"} size={14} colorClassName="accent-foreground" />
        <Text className="font-medium text-foreground text-sm">{open ? "Hide" : "View"}</Text>
      </Pressable>
      {open && (
        <Text
          selectable
          className="mt-2 rounded-lg border border-border bg-muted/40 p-3 font-mono text-muted-foreground text-xs"
        >
          {skill.instructions}
        </Text>
      )}
    </View>
  );
}

export default function SkillsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // `selected` opens a skill's editor, e.g. from the assistant's "Review" chip on a drafted skill.
  const params = useLocalSearchParams<{ selected?: string }>();
  const [selected, setSelected] = useState(params.selected);
  // An unsaved new skill, edited in a card above the list until it's saved. Its text lives here,
  // so editing another skill only hides the card.
  const [draft, setDraft] = useState<SkillDraft>();
  const skills = useSkills();
  const scrollRef = useRef<ScrollViewInstance>(null);
  // One editor at a time: the draft card shows whenever no existing skill's editor is open.
  const editingExisting = skills.some((skill) => skill.id === selected);

  const newSkill = () => {
    setSelected(undefined);
    if (!draft) setDraft({ id: generateId(), name: "", whenToUse: "", instructions: "" });
    scrollRef.current?.scrollTo({ y: 0 });
  };

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader
        title="Skills"
        subtitle="Reusable playbooks the assistant can follow. Active ones are offered in new chats and matched automatically."
        onBack={router.back}
        actions={<IconButton icon="plus" label="New skill" onPress={newSkill} />}
      />
      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerClassName="gap-6 px-5 pt-1"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
      >
        {draft && !editingExisting && (
          <NewSkillCard key={draft.id} draft={draft} onChange={setDraft} onClose={() => setDraft(undefined)} />
        )}

        {SECTIONS.map((section) => {
          const items = skills.filter((skill) => skill.status === section.status);
          if (items.length === 0) return null;
          return (
            <View key={section.status} className="gap-2">
              <Text className="px-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                {section.title}
              </Text>
              {items.map((skill) => (
                <SkillCard
                  key={skill.id}
                  skill={skill}
                  editing={skill.id === selected}
                  onEdit={() => setSelected(skill.id)}
                  onClose={() => setSelected(undefined)}
                />
              ))}
            </View>
          );
        })}

        {skills.length === 0 && !draft && (
          <EmptyState
            icon="layers"
            title="No skills of your own yet"
            description="Create one, or ask the assistant to save a multi-step task it just completed as a skill."
          />
        )}

        {BUILTIN_SKILLS.length > 0 && (
          <View className="gap-2">
            <Text className="px-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">Built-in</Text>
            {BUILTIN_SKILLS.map((skill) => (
              <BuiltinSkillCard key={skill.id} skill={skill} />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
