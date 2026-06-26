import { createFileRoute, Link } from "@tanstack/react-router";
import { Bot, Brain, Workflow } from "lucide-react";
import { Cell, Pie, PieChart } from "recharts";
import { z } from "zod";
import { ASSISTANT_MODELS } from "@/agent/models";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { cn } from "@/lib/utils";
import { useDbQuery } from "@/user-db/user-db";

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

function formatCost(cost: number) {
  if (cost > 0 && cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

function modelLabel(modelId: string | null) {
  if (!modelId) return "No model";
  return ASSISTANT_MODELS.find((model) => model.id === modelId)?.label ?? modelId;
}

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

  const { data: conversations } = useDbQuery((db) =>
    db.selectFrom("_conversation").select(["id", "tombstone", "model", "totalCost", "totalTokens"]),
  );

  const { data: memories } = useDbQuery((db) => db.selectFrom("memory").select(["id", "enabled"]));
  const { data: skills } = useDbQuery((db) => db.selectFrom("skill").select(["id", "status"]));

  const scopedConversations =
    scope === "live" ? conversations.filter((conversation) => !conversation.tombstone) : conversations;
  const totalConversations = scopedConversations.length;
  const totalCost = scopedConversations.reduce((sum, conversation) => sum + conversation.totalCost, 0);
  const totalTokens = scopedConversations.reduce((sum, conversation) => sum + conversation.totalTokens, 0);
  const averageCost = totalConversations > 0 ? totalCost / totalConversations : 0;

  const modelRows = Object.values(
    scopedConversations.reduce<Record<string, { model: string | null; conversations: number; cost: number }>>(
      (groups, conversation) => {
        const key = conversation.model ?? "__none";
        const current = groups[key] ?? { model: conversation.model, conversations: 0, cost: 0 };
        groups[key] = {
          ...current,
          conversations: current.conversations + 1,
          cost: current.cost + conversation.totalCost,
        };
        return groups;
      },
      {},
    ),
  ).sort((a, b) => b.cost - a.cost || b.conversations - a.conversations);

  const pieData = modelRows
    .filter((row) => row.cost > 0)
    .map((row, index) => ({
      ...row,
      key: `model_${index}`,
      label: modelLabel(row.model),
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
    <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6 sm:py-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Conversations"
          value={totalConversations.toLocaleString()}
          detail={scope === "live" ? "Active chats" : "Including deleted"}
        />
        <StatCard label="Total cost" value={formatCost(totalCost)} />
        <StatCard label="Total tokens" value={totalTokens.toLocaleString()} />
        <StatCard label="Average cost" value={formatCost(averageCost)} detail="Per conversation" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
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
                    <p className="min-w-0 truncate font-medium text-sm">{modelLabel(row.model)}</p>
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

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
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
