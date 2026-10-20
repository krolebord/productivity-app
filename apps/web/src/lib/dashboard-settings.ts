import {
  type DashboardSettingsPatch,
  isAppCurrency,
  isRangeMode,
  useDashboardSettings as useSyncedDashboardSettings,
} from "@productivity/core/data/dashboard-settings";
import { useEffect } from "react";

const LEGACY_DASHBOARD_RANGE_KEY = "productivity-dashboard-range";
const LEGACY_BASE_CURRENCY_KEY = "productivity-base-currency";

function getObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readLegacyPersistedState(key: string): Record<string, unknown> | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;

    const parsed = getObject(JSON.parse(raw));
    const persistedState = getObject(parsed?.state);
    return persistedState ?? parsed;
  } catch {
    return null;
  }
}

function readLegacyDashboardSettings(): DashboardSettingsPatch | null {
  const patch: DashboardSettingsPatch = {};
  const rangeState = readLegacyPersistedState(LEGACY_DASHBOARD_RANGE_KEY);
  const currencyState = readLegacyPersistedState(LEGACY_BASE_CURRENCY_KEY);

  if (typeof rangeState?.mode === "string" && isRangeMode(rangeState.mode)) {
    patch.mode = rangeState.mode;
  }
  if (typeof rangeState?.days === "number" && Number.isFinite(rangeState.days)) {
    patch.days = rangeState.days;
  }
  if (typeof rangeState?.cycleDay === "number" && Number.isFinite(rangeState.cycleDay)) {
    patch.cycleDay = rangeState.cycleDay;
  }
  if (typeof currencyState?.baseCurrency === "string" && isAppCurrency(currencyState.baseCurrency)) {
    patch.baseCurrency = currencyState.baseCurrency;
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

/** Synced dashboard settings, seeded once from the pre-sync localStorage stores when no row exists yet. */
export function useDashboardSettings() {
  const settings = useSyncedDashboardSettings();
  const { isStored, updateSettings } = settings;

  useEffect(() => {
    if (isStored) return;

    const legacySettings = readLegacyDashboardSettings();
    if (!legacySettings) return;

    updateSettings(legacySettings);
  }, [isStored, updateSettings]);

  return settings;
}
