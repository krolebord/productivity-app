import { formatCost } from "@productivity/core/agent/format";
import { summarizeAssistantUsage, usageModelLabel } from "@productivity/core/agent/usage";
import { useConversationUsage } from "@productivity/core/data/conversations";
import { useMemoryEnabledStates } from "@productivity/core/data/memories";
import { useSkillStatuses } from "@productivity/core/data/skills";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Bot, Brain, Workflow } from "lucide-react";
import { Cell, Pie, PieChart } from "recharts";
import { z } from "zod";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { cn } from "@/lib/utils";

const agentSearchSchema = z.object({
  scope: z.enum(["live", "all"]).optional(),
});

export const Route = createFileRoute("/_app/agents")({
  component: AgentsPage,
  validateSearch: agentSearchSchema,
});

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

function StatCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 font-semibold text-2xl tabular-nums">{value}</p>
      {detail && <p className="mt-1 text-muted-foreground text-xs">{detail}</p>}
    </div>
  );
}

function QuickLink({
  to,
  icon: Icon,
  title,
  detail,
}: {
  to: "/memories" | "/skills";
  icon: typeof Brain;
  title: string;
  detail: string;
}) {
  return (
    <Link to={to} className="flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-accent">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <p className="font-medium">{title}</p>
        <p className="truncate text-muted-foreground text-sm">{detail}</p>
      </div>
    </Link>
  );
}

function AgentsPage() {
  const { scope: searchScope } = Route.useSearch();
  const navigate = Route.useNavigate();
  const scope = searchScope ?? "live";

  const conversations = useConversationUsage();

  const memories = useMemoryEnabledStates();
  const skills = useSkillStatuses();

  const usage = summarizeAssistantUsage(conversations, scope);
  const modelRows = usage.models;

  const pieData = modelRows
    .filter((row) => row.cost > 0)
    .map((row, index) => ({
      ...row,
      key: `model_${index}`,
      label: usageModelLabel(row.model),
      fill: CHART_COLORS[index % CHART_COLORS.length],
    }));

  const chartConfig = Object.fromEntries(pieData.map((row) => [row.key, { label: row.label, color: row.fill }]));

  const enabledMemories = memories.filter((memory) => memory.enabled).length;
  const activeSkills = skills.filter((skill) => skill.status === "active").length;
  const pendingSkills = skills.filter((skill) => skill.status === "pending").length;
  const disabledSkills = skills.filter((skill) => skill.status === "disabled").length;

  function setScope(nextScope: "live" | "all") {
    navigate({ search: (prev) => ({ ...prev, scope: nextScope === "live" ? undefined : nextScope }), replace: true });
  }

  return (
    <div className="@container mx-auto max-w-5xl px-4 py-4 sm:px-6 sm:py-6">
      <div className="mb-4 flex @xl:flex-row flex-col @xl:items-start @xl:justify-between gap-3">
        <div>
          <h1 className="font-semibold text-xl">Agents</h1>
          <p className="text-muted-foreground text-sm">
            Conversation usage, model spend, and assistant context controls.
          </p>
        </div>
        <div className="grid grid-cols-2 rounded-md border bg-muted p-0.5 text-sm">
          {(["live", "all"] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={cn(
                "rounded-sm px-3 py-1.5 font-medium capitalize transition-colors",
                scope === option
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setScope(option)}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div className="grid @4xl:grid-cols-4 @md:grid-cols-2 gap-3">
        <StatCard
          label="Conversations"
          value={usage.conversations.toLocaleString()}
          detail={scope === "live" ? "Active chats" : "Including deleted"}
        />
        <StatCard label="Total cost" value={formatCost(usage.totalCost)} />
        <StatCard label="Total tokens" value={usage.totalTokens.toLocaleString()} />
        <StatCard label="Average cost" value={formatCost(usage.averageCost)} detail="Per conversation" />
      </div>

      <div className="mt-4 grid @4xl:grid-cols-[minmax(0,1fr)_20rem] gap-4">
        <div className="rounded-lg border bg-card p-3">
          <div className="mb-3 flex items-center gap-2">
            <Bot className="size-4 text-muted-foreground" />
            <h2 className="font-medium">Cost by model</h2>
          </div>
          {pieData.length > 0 ? (
            <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-72">
              <PieChart>
                <ChartTooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const row = payload[0].payload as (typeof pieData)[number];
                    return (
                      <div className="rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
                        <p className="font-medium">{row.label}</p>
                        <p className="mt-1 text-muted-foreground">
                          {formatCost(row.cost)} across {row.conversations.toLocaleString()}{" "}
                          {row.conversations === 1 ? "conversation" : "conversations"}
                        </p>
                      </div>
                    );
                  }}
                />
                <Pie data={pieData} dataKey="cost" nameKey="label" innerRadius={54} outerRadius={92} paddingAngle={2}>
                  {pieData.map((row) => (
                    <Cell key={row.key} fill={row.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
          ) : (
            <div className="flex min-h-72 flex-col items-center justify-center gap-2 rounded-md border border-dashed text-center">
              <Bot className="size-8 text-muted-foreground" />
              <div>
                <p className="font-medium">No cost recorded</p>
                <p className="text-muted-foreground text-sm">
                  Conversations without usage cost are excluded from the chart.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-lg border bg-card p-3">
          <h2 className="mb-3 font-medium">Model details</h2>
          {modelRows.length === 0 ? (
            <p className="text-muted-foreground text-sm">No conversations yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {modelRows.map((row) => (
                <div key={row.model ?? "__none"} className="rounded-md border bg-background px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="min-w-0 truncate font-medium text-sm">{usageModelLabel(row.model)}</p>
                    <span className="shrink-0 font-mono text-sm tabular-nums">{formatCost(row.cost)}</span>
                  </div>
                  <p className="mt-1 text-muted-foreground text-xs">
                    {row.conversations.toLocaleString()} {row.conversations === 1 ? "conversation" : "conversations"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 grid @md:grid-cols-2 gap-3">
        <QuickLink
          to="/memories"
          icon={Brain}
          title="Memories"
          detail={`${enabledMemories.toLocaleString()} enabled / ${memories.length.toLocaleString()} total`}
        />
        <QuickLink
          to="/skills"
          icon={Workflow}
          title="Skills"
          detail={`${activeSkills.toLocaleString()} active / ${pendingSkills.toLocaleString()} pending / ${disabledSkills.toLocaleString()} disabled`}
        />
      </div>
    </div>
  );
}
