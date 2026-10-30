import { useAccountLabels } from "@productivity/core/data/accounts";
import { searchPreview, useGlobalSearch } from "@productivity/core/data/search";
import { formatDueDateLabel } from "@productivity/core/date-time";
import type { NoteItem } from "@productivity/core/user-db/migrations";
import { useRouter } from "expo-router";
import { type ReactNode, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { ScreenHeader } from "../../components/screen-header";
import { TransactionRow } from "../../components/transaction-row";
import { EmptyState } from "../../components/ui/empty-state";
import { Icon } from "../../components/ui/icon";
import { Input } from "../../components/ui/input";
import { cn } from "../../lib/utils";

/** Searches notes, tasks and transactions at once, like the web's command palette. */
export default function SearchScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const { notes, tasks, transactions } = useGlobalSearch(query);
  const accounts = useAccountLabels();
  const accountLabels = useMemo(() => new Map(accounts.map((a) => [a.id, a.labelText])), [accounts]);
  const searching = query.trim().length > 0;
  const empty = notes.length + tasks.length + transactions.length === 0;

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Search" onBack={router.back}>
        <View className="h-10 flex-row items-center gap-2 rounded-lg bg-muted px-3">
          <Icon name="search" size={16} colorClassName="accent-muted-foreground" />
          <Input
            value={query}
            onChangeText={setQuery}
            placeholder="Notes, tasks and transactions"
            className="h-full flex-1"
            returnKeyType="search"
            clearButtonMode="while-editing"
            autoFocus
            autoCorrect={false}
          />
        </View>
      </ScreenHeader>
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-6 px-5 pt-1 pb-10"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {!searching ? (
          <EmptyState icon="search" title="Search everything" description="Find notes, tasks and transactions." />
        ) : empty ? (
          <EmptyState icon="slash" title="No matches" />
        ) : (
          <>
            {notes.length > 0 && (
              <ResultSection title="Notes">
                {notes.map((note, index) => (
                  <ItemResult
                    key={note.id}
                    item={note}
                    last={index === notes.length - 1}
                    onPress={() => router.push({ pathname: "/note/[id]", params: { id: note.id } })}
                  />
                ))}
              </ResultSection>
            )}
            {tasks.length > 0 && (
              <ResultSection title="Tasks">
                {tasks.map((task, index) => (
                  <ItemResult
                    key={task.id}
                    item={task}
                    last={index === tasks.length - 1}
                    onPress={() => router.push({ pathname: "/task/[id]", params: { id: task.id } })}
                  />
                ))}
              </ResultSection>
            )}
            {transactions.length > 0 && (
              <ResultSection title="Transactions">
                {transactions.map((transaction, index) => (
                  <TransactionRow
                    key={transaction.id}
                    transaction={transaction}
                    accountLabels={accountLabels}
                    onPress={() => router.push({ pathname: "/transaction/[id]", params: { id: transaction.id } })}
                    last={index === transactions.length - 1}
                  />
                ))}
              </ResultSection>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function ResultSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-2">
      <Text className="font-medium text-muted-foreground text-xs uppercase tracking-wide">{title}</Text>
      <View className="overflow-hidden rounded-xl border border-border bg-card">{children}</View>
    </View>
  );
}

/** A note or task: its title (or the start of its body), then a body preview or a task's state. */
function ItemResult({ item, last, onPress }: { item: NoteItem; last: boolean; onPress: () => void }) {
  const preview = searchPreview(item.content);
  const title = item.title.trim() || preview || "Untitled";
  const isTask = item.type === "task";
  const detail = isTask
    ? item.completedAt != null
      ? "Completed"
      : item.dueAt != null
        ? formatDueDateLabel(item.dueAt, item.hasDueTime)
        : "Inbox"
    : item.title.trim()
      ? preview
      : "";

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={cn(
        "min-h-14 flex-row items-center gap-3 px-4 py-2.5 active:bg-muted",
        !last && "border-border border-b",
      )}
    >
      <Icon name={isTask ? "check-square" : "file-text"} size={16} colorClassName="accent-muted-foreground" />
      <View className="min-w-0 flex-1">
        <Text
          numberOfLines={1}
          className={cn("text-base text-foreground", isTask && item.completedAt != null && "line-through opacity-60")}
        >
          {title}
        </Text>
        {detail ? (
          <Text numberOfLines={1} className="text-muted-foreground text-sm">
            {detail}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
