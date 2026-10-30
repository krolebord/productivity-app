import { isBuiltinSkillId, type SkillStarter, skillStarters } from "@productivity/core/agent/builtin-skills";
import { markSkillUsed, useActiveSkills } from "@productivity/core/data/skills";
import { useDb } from "@productivity/core/user-db/db-context";
import { Pressable, Text, View } from "react-native";
import { Icon } from "../ui/icon";

/** Skills offered on an empty chat; picking one drops its prompt into the composer. */
export function SkillStarters({ onPick }: { onPick: (skill: SkillStarter) => void }) {
  const db = useDb();
  const skills = skillStarters(useActiveSkills());
  if (skills.length === 0) return null;

  return (
    <View className="w-full gap-1.5">
      <Text className="text-muted-foreground text-xs">Or start from a skill</Text>
      {skills.map((skill) => (
        <Pressable
          key={skill.id}
          accessibilityRole="button"
          onPress={() => {
            if (!isBuiltinSkillId(skill.id)) markSkillUsed(db.db, skill.id);
            onPick(skill);
          }}
          className="flex-row items-start gap-2.5 rounded-lg border border-border bg-card p-3 active:bg-muted"
        >
          <Icon name="layers" size={15} colorClassName="accent-muted-foreground" className="mt-0.5" />
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="font-medium text-foreground text-sm">
              {skill.name || "Untitled skill"}
            </Text>
            {skill.whenToUse ? (
              <Text numberOfLines={2} className="text-muted-foreground text-xs">
                {skill.whenToUse}
              </Text>
            ) : null}
          </View>
        </Pressable>
      ))}
    </View>
  );
}
