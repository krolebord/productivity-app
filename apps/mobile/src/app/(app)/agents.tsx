import { formatCost } from "@productivity/core/agent/format";
import { summarizeAssistantUsage, type UsageScope, usageModelLabel } from "@productivity/core/agent/usage";
import { useConversationUsage } from "@productivity/core/data/conversations";
import { useMemoryEnabledStates } from "@productivity/core/data/memories";
import { useSkillStatuses } from "@productivity/core/data/skills";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Pie, PolarChart } from "victory-native";
import { DetailRow, useChartTheme } from "../../components/overview-charts";
import { ScreenHeader } from "../../components/screen-header";
import { FormRow, FormSection, FormValue } from "../../components/ui/form";
import { Segmented } from "../../components/ui/segmented";

const SCOPE_OPTIONS = [
  { value: "live", label: "Live" },
  { value: "all", label: "All" },
] as const satisfies readonly { value: UsageScope; label: string }[];

function StatCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <View className="min-w-[45%] flex-1 rounded-xl border border-border bg-card p-3">
      <Text className="text-muted-foreground text-xs">{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit className="mt-1 font-semibold text-2xl text-foreground tabular-nums">
        {value}
      </Text>
      {detail && <Text className="mt-1 text-muted-foreground text-xs">{detail}</Text>}
    </View>
  );
}

/** Assistant usage and spend, with links to the context it carries (memories, skills). */
export default function AgentsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useChartTheme();
  const [scope, setScope] = useState<UsageScope>("live");
  const usage = summarizeAssistantUsage(useConversationUsage(), scope);
  const memories = useMemoryEnabledStates();
  const skills = useSkillStatuses();

  const slices = usage.models
    .filter((row) => row.cost > 0)
    .map((row, index) => ({
      label: usageModelLabel(row.model),
      value: row.cost,
      color: theme.palette[index % theme.palette.length],
    }));
  const enabledMemories = memories.filter((memory) => memory.enabled).length;
  const countSkills = (status: string) => skills.filter((skill) => skill.status === status).length;

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader
        title="Agents"
        subtitle="Conversation usage, model spend, and assistant context controls."
        onBack={router.back}
      >
        <Segmented options={SCOPE_OPTIONS} value={scope} onChange={setScope} />
      </ScreenHeader>
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-6 px-5 pt-1"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        <View className="flex-row flex-wrap gap-3">
          <StatCard
            label="Conversations"
            value={usage.conversations.toLocaleString()}
            detail={scope === "live" ? "Active chats" : "Including deleted"}
          />
          <StatCard label="Total cost" value={formatCost(usage.totalCost)} />
          <StatCard label="Total tokens" value={usage.totalTokens.toLocaleString()} />
          <StatCard label="Average cost" value={formatCost(usage.averageCost)} detail="Per conversation" />
        </View>

        <View className="gap-3 rounded-xl border border-border bg-card p-4">
          <Text className="font-medium text-base text-foreground">Cost by model</Text>
          {slices.length > 0 ? (
            <View className="h-48">
              <PolarChart data={slices} labelKey="label" valueKey="value" colorKey="color">
                {/* A ring a little smaller than the 192pt canvas, which otherwise clips its bottom edge. */}
                <Pie.Chart innerRadius="58%" size={184} />
              </PolarChart>
            </View>
          ) : (
            <Text className="text-muted-foreground text-sm">
              No cost recorded. Conversations without usage cost are left out of the chart.
            </Text>
          )}
          {usage.models.length === 0 ? (
            <Text className="text-muted-foreground text-sm">No conversations yet.</Text>
          ) : (
            <View className="gap-2 border-border border-t pt-3">
              {usage.models.map((row) => (
                <DetailRow
                  key={row.model ?? "__none"}
                  color={slices.find((slice) => slice.label === usageModelLabel(row.model))?.color}
                  label={usageModelLabel(row.model)}
                  hint={`· ${row.conversations.toLocaleString()} ${row.conversations === 1 ? "chat" : "chats"}`}
                  value={formatCost(row.cost)}
                />
              ))}
            </View>
          )}
        </View>

        <FormSection>
          <FormRow icon="bookmark" label="Memories" onPress={() => router.push("/memories")}>
            <FormValue muted>
              {enabledMemories} enabled / {memories.length}
            </FormValue>
          </FormRow>
          <FormRow icon="layers" label="Skills" onPress={() => router.push("/skills")} last>
            <FormValue muted>
              {countSkills("active")} active / {countSkills("pending")} pending
            </FormValue>
          </FormRow>
        </FormSection>
      </ScrollView>
    </View>
  );
}
