import { formatBalance } from "@productivity/core/currency/format";
import {
  useCategoryExamples,
  useCategoryImportanceCounts,
  useExpenseCategoryCounts,
} from "@productivity/core/data/transactions";
import { formatDateTimeDisplay } from "@productivity/core/date-time";
import { IMPORTANCE_LABELS, resolveTransactionType } from "@productivity/core/finance/appearance";
import {
  type CategoryCount,
  type CategoryImportanceSummary,
  inferCategoryImportance,
  sortCategoryCounts,
  summarizeCategoryImportance,
} from "@productivity/core/finance/category-importance";
import {
  changeCategoryImportanceDefault,
  IMPORTANCE_TIERS,
  type ImportanceTier,
} from "@productivity/core/transactions";
import { useDb } from "@productivity/core/user-db/db-context";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, FlatList, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SheetHeader } from "../../components/screen-header";
import { Button } from "../../components/ui/button";
import { EmptyState } from "../../components/ui/empty-state";
import { Icon } from "../../components/ui/icon";
import { Input } from "../../components/ui/input";
import { Segmented } from "../../components/ui/segmented";
import { IMPORTANCE_STYLE, TRANSACTION_TYPE_STYLE } from "../../lib/finance";
import { cn } from "../../lib/utils";

type Mode = "backfill" | "manage";

const MODE_OPTIONS: readonly { value: Mode; label: string }[] = [
  { value: "backfill", label: "Backfill" },
  { value: "manage", label: "Manage" },
];
const IMPORTANCE_OPTIONS = IMPORTANCE_TIERS.map((tier) => ({ value: tier, label: IMPORTANCE_LABELS[tier] }));

/**
 * Classify expense categories in bulk, as the web's "Update default importance" dialog:
 * backfill walks the categories with unclassified expenses one by one, manage changes any
 * category's default. Picking a tier updates the category's unclassified expenses (and, when
 * changing a default, the ones that used the old one).
 */
export default function CategoryImportanceScreen() {
  const router = useRouter();
  const unclassifiedRows = useExpenseCategoryCounts({ unclassifiedOnly: true });
  const allRows = useExpenseCategoryCounts({ unclassifiedOnly: false });
  const importanceRows = useCategoryImportanceCounts();

  const backfill = useMemo(() => sortCategoryCounts(unclassifiedRows), [unclassifiedRows]);
  const inferred = useMemo(() => inferCategoryImportance(importanceRows), [importanceRows]);
  const summaries = useMemo(
    () => summarizeCategoryImportance({ categories: sortCategoryCounts(allRows), unclassified: backfill, inferred }),
    [allRows, backfill, inferred],
  );

  const [chosenMode, setChosenMode] = useState<Mode | null>(null);
  // Opens on manage when there's nothing left to backfill, until a tab is picked.
  const mode = chosenMode ?? (backfill.length === 0 && summaries.length > 0 ? "manage" : "backfill");

  return (
    <View className="flex-1 bg-background">
      <SheetHeader title="Default importance" onDone={() => router.back()} />
      <View className="px-4 pt-4 pb-1">
        <Segmented options={MODE_OPTIONS} value={mode} onChange={setChosenMode} />
      </View>
      {mode === "backfill" ? (
        <BackfillView categories={backfill} inferred={inferred} onClose={() => router.back()} />
      ) : (
        <ManageView categories={summaries} />
      )}
    </View>
  );
}

function BackfillView({
  categories,
  inferred,
  onClose,
}: {
  categories: CategoryCount[];
  inferred: ReadonlyMap<string, ImportanceTier>;
  onClose: () => void;
}) {
  const db = useDb();
  const insets = useSafeAreaInsets();
  const [completed, setCompleted] = useState(0);
  const [selection, setSelection] = useState<{ category: string; importance: ImportanceTier } | null>(null);

  // A saved category drops out of the list, so the next one slides into the first slot.
  const current = categories[0];
  if (!current) {
    return (
      <EmptyState
        icon="check"
        title="All categorized expenses are classified"
        description="No categorized expenses need importance backfill."
      />
    );
  }

  const selected =
    selection?.category === current.category ? selection.importance : (inferred.get(current.category) ?? "optional");

  const save = () => {
    try {
      changeCategoryImportanceDefault(db.db, current.category, inferred.get(current.category) ?? null, selected);
      setSelection(null);
      setCompleted((count) => count + 1);
      if (categories.length === 1) onClose();
    } catch (error) {
      Alert.alert("Could not update default importance", error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <ScrollView
      contentContainerClassName="gap-4 px-4 pt-3"
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
    >
      <View className="flex-row items-start justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="font-semibold text-foreground text-lg">
            {current.category}
          </Text>
          <Text className="text-muted-foreground text-sm">
            {current.count.toLocaleString()} unclassified {current.count === 1 ? "expense" : "expenses"}
          </Text>
        </View>
        <Text className="text-muted-foreground text-sm tabular-nums">
          {completed + 1} of {completed + categories.length}
        </Text>
      </View>
      <CategoryExamples category={current.category} />
      <Segmented
        options={IMPORTANCE_OPTIONS}
        value={selected}
        onChange={(importance) => setSelection({ category: current.category, importance })}
      />
      <Button label={categories.length === 1 ? "Finish" : "Next"} onPress={save} />
    </ScrollView>
  );
}

function ManageView({ categories }: { categories: CategoryImportanceSummary[] }) {
  const db = useDb();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selection, setSelection] = useState<ImportanceTier | null>(null);

  if (categories.length === 0) {
    return (
      <EmptyState
        icon="tag"
        title="No categorized expenses found"
        description="Create categorized expenses before managing defaults."
      />
    );
  }

  const summary = categories.find((category) => category.category === selectedCategory);
  if (summary) {
    const selected = selection ?? summary.inferredImportance ?? "optional";
    const canSave = selected !== summary.inferredImportance || summary.unclassifiedCount > 0;
    const apply = () => {
      try {
        changeCategoryImportanceDefault(db.db, summary.category, summary.inferredImportance, selected);
        setSelection(null);
      } catch (error) {
        Alert.alert("Could not update default importance", error instanceof Error ? error.message : String(error));
      }
    };

    return (
      <ScrollView
        contentContainerClassName="gap-4 px-4 pt-3"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setSelectedCategory(null);
            setSelection(null);
          }}
          hitSlop={8}
          className="flex-row items-center gap-1 self-start active:opacity-60"
        >
          <Icon name="chevron-left" size={16} colorClassName="accent-primary" />
          <Text className="text-base text-primary">All categories</Text>
        </Pressable>
        <View className="flex-row items-center justify-between gap-3">
          <Text numberOfLines={1} className="shrink font-semibold text-foreground text-lg">
            {summary.category}
          </Text>
          <ImportanceBadge importance={summary.inferredImportance} />
        </View>
        <CategoryExamples category={summary.category} />
        <Segmented options={IMPORTANCE_OPTIONS} value={selected} onChange={setSelection} />
        {!canSave && (
          <Text className="text-muted-foreground text-sm">
            Already the current default — pick another tier to change it.
          </Text>
        )}
        <Button
          label={summary.unclassifiedCount > 0 ? "Apply to category" : "Change default"}
          onPress={apply}
          disabled={!canSave}
        />
      </ScrollView>
    );
  }

  const q = search.trim().toLowerCase();
  const filtered = q ? categories.filter((category) => category.category.toLowerCase().includes(q)) : categories;

  return (
    <FlatList
      data={filtered}
      keyExtractor={(category) => category.category}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: insets.bottom + 24 }}
      ListHeaderComponent={
        <View className="mb-3 h-10 flex-row items-center gap-2 rounded-lg bg-muted px-3">
          <Icon name="search" size={16} colorClassName="accent-muted-foreground" />
          <Input
            value={search}
            onChangeText={setSearch}
            placeholder="Search categories"
            className="h-full flex-1"
            clearButtonMode="while-editing"
          />
        </View>
      }
      renderItem={({ item, index }) => (
        <Pressable
          accessibilityRole="button"
          onPress={() => setSelectedCategory(item.category)}
          className={cn(
            "min-h-14 flex-row items-center gap-3 border-border border-x bg-card px-4 py-2.5 active:bg-muted",
            index === 0 && "rounded-t-xl border-t",
            index === filtered.length - 1 ? "rounded-b-xl border-b" : "border-b",
          )}
        >
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="font-medium text-base text-foreground">
              {item.category}
            </Text>
            <Text className="text-muted-foreground text-xs">
              {item.count.toLocaleString()} {item.count === 1 ? "expense" : "expenses"}
              {item.unclassifiedCount > 0 ? ` · ${item.unclassifiedCount.toLocaleString()} unclassified` : ""}
            </Text>
          </View>
          <ImportanceBadge importance={item.inferredImportance} />
          <Icon name="chevron-right" size={16} colorClassName="accent-muted-foreground" />
        </Pressable>
      )}
      ListEmptyComponent={<Text className="py-6 text-center text-muted-foreground text-sm">No categories found.</Text>}
    />
  );
}

function ImportanceBadge({ importance }: { importance: ImportanceTier | null }) {
  const style = importance ? IMPORTANCE_STYLE[importance] : null;
  return (
    <View className={cn("rounded-md px-2 py-1", style?.badge ?? "bg-muted")}>
      <Text className={cn("font-medium text-xs", style?.badgeText ?? "text-muted-foreground")}>
        {style?.label ?? "None"}
      </Text>
    </View>
  );
}

function CategoryExamples({ category }: { category: string }) {
  const examples = useCategoryExamples(category);
  return (
    <View className="overflow-hidden rounded-xl border border-border bg-card">
      <Text className="border-border border-b px-4 py-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">
        Examples
      </Text>
      {examples.length === 0 ? (
        <Text className="px-4 py-6 text-center text-muted-foreground text-sm">No examples found.</Text>
      ) : (
        examples.map((example, index) => (
          <View
            key={example.id}
            className={cn(
              "flex-row items-center gap-3 px-4 py-2",
              index < examples.length - 1 && "border-border border-b",
            )}
          >
            <View className="min-w-0 flex-1">
              <Text numberOfLines={1} className="font-medium text-foreground text-sm">
                {example.title || "Untitled"}
              </Text>
              <Text className="text-muted-foreground text-xs">{formatDateTimeDisplay(example.effectiveAt)}</Text>
            </View>
            <Text
              className={cn("font-medium text-xs", TRANSACTION_TYPE_STYLE[resolveTransactionType(example.type)].accent)}
            >
              {formatBalance(Number(example.amount), example.accountCurrency)}
            </Text>
          </View>
        ))
      )}
    </View>
  );
}
