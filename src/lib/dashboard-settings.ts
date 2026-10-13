import { useCallback, useEffect } from "react";
import type { AppCurrencyCode } from "@/lib/currency/currencies";
import { APP_CURRENCIES } from "@/lib/currency/currencies";
import {
  clampDashboardRangeValue,
  type DashboardRangeConfig,
  type DashboardRangeMode,
} from "@/lib/dashboard-range-store";
import { DASHBOARD_SETTINGS_DEFAULTS, DASHBOARD_SETTINGS_ID } from "@/lib/dashboard-settings-defaults";
import type { DashboardSettingsItem } from "@/user-db/migrations";
import { useDb, useDbQuery } from "@/user-db/user-db";

const LEGACY_DASHBOARD_RANGE_KEY = "productivity-dashboard-range";
const LEGACY_BASE_CURRENCY_KEY = "productivity-base-currency";
const appCurrencySet = new Set<string>(APP_CURRENCIES);

export interface DashboardSettings extends DashboardRangeConfig {
  baseCurrency: AppCurrencyCode;
  /** IANA zone; empty until a device reports it. */
  timeZone: string;
}

export const DEFAULT_DASHBOARD_SETTINGS: DashboardSettings = {
  mode: DASHBOARD_SETTINGS_DEFAULTS.rangeMode,
  days: DASHBOARD_SETTINGS_DEFAULTS.rangeDays,
  cycleDay: DASHBOARD_SETTINGS_DEFAULTS.cycleDay,
  baseCurrency: DASHBOARD_SETTINGS_DEFAULTS.baseCurrency,
  timeZone: DASHBOARD_SETTINGS_DEFAULTS.timeZone,
};

function isRangeMode(value: string): value is DashboardRangeMode {
  return value === "days" || value === "cycle";
}

function isAppCurrency(value: string): value is AppCurrencyCode {
  return appCurrencySet.has(value);
}

function normalizeDashboardSettings(row?: DashboardSettingsItem): DashboardSettings {
  if (!row) return DEFAULT_DASHBOARD_SETTINGS;

  return {
    mode: isRangeMode(row.rangeMode) ? row.rangeMode : DEFAULT_DASHBOARD_SETTINGS.mode,
    days: clampDashboardRangeValue(row.rangeDays),
    cycleDay: clampDashboardRangeValue(row.cycleDay),
    baseCurrency: isAppCurrency(row.baseCurrency) ? row.baseCurrency : DEFAULT_DASHBOARD_SETTINGS.baseCurrency,
    timeZone: row.timeZone,
  };
}

type SettingsPatch = Partial<DashboardSettings>;

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

function readLegacyDashboardSettings(): SettingsPatch | null {
  const patch: SettingsPatch = {};
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

function toStoredPatch(patch: SettingsPatch) {
  const stored: Partial<
    Pick<DashboardSettingsItem, "rangeMode" | "rangeDays" | "cycleDay" | "baseCurrency" | "timeZone">
  > = {};

  if (patch.mode) {
    stored.rangeMode = patch.mode;
  }
  if (patch.days !== undefined) {
    stored.rangeDays = clampDashboardRangeValue(patch.days);
  }
  if (patch.cycleDay !== undefined) {
    stored.cycleDay = clampDashboardRangeValue(patch.cycleDay);
  }
  if (patch.baseCurrency) {
    stored.baseCurrency = patch.baseCurrency;
  }
  if (patch.timeZone) {
    stored.timeZone = patch.timeZone;
  }

  return stored;
}

export function useDashboardSettings() {
  const db = useDb();
  const { data: rows } = useDbQuery((db) =>
    db.selectFrom("dashboard_settings").selectAll().where("id", "=", DASHBOARD_SETTINGS_ID).limit(1),
  );
  const syncedRow = rows[0];
  const settings = normalizeDashboardSettings(syncedRow);

  const updateSettings = useCallback(
    (patch: SettingsPatch) => {
      const storedPatch = toStoredPatch(patch);
      if (Object.keys(storedPatch).length === 0) return;

      const now = Date.now();
      db.db.executeTransaction((trx) => {
        const [existing] = trx.executeKysely((q) =>
          q.selectFrom("dashboard_settings").select("id").where("id", "=", DASHBOARD_SETTINGS_ID),
        ).rows;

        if (existing) {
          trx.executeKysely((q) =>
            q
              .updateTable("dashboard_settings")
              .set({ ...storedPatch, updatedAt: now })
              .where("id", "=", DASHBOARD_SETTINGS_ID),
          );
          return;
        }

        trx.executeKysely((q) =>
          q.insertInto("dashboard_settings").values({
            id: DASHBOARD_SETTINGS_ID,
            tombstone: false,
            rangeMode: storedPatch.rangeMode ?? DEFAULT_DASHBOARD_SETTINGS.mode,
            rangeDays: storedPatch.rangeDays ?? DEFAULT_DASHBOARD_SETTINGS.days,
            cycleDay: storedPatch.cycleDay ?? DEFAULT_DASHBOARD_SETTINGS.cycleDay,
            baseCurrency: storedPatch.baseCurrency ?? DEFAULT_DASHBOARD_SETTINGS.baseCurrency,
            timeZone: storedPatch.timeZone ?? DEFAULT_DASHBOARD_SETTINGS.timeZone,
            createdAt: now,
            updatedAt: now,
          }),
        );
      });
    },
    [db.db],
  );

  useEffect(() => {
    if (syncedRow) return;

    const legacySettings = readLegacyDashboardSettings();
    if (!legacySettings) return;

    updateSettings(legacySettings);
  }, [syncedRow, updateSettings]);

  const setMode = useCallback((mode: DashboardRangeMode) => updateSettings({ mode }), [updateSettings]);
  const setDays = useCallback((days: number) => updateSettings({ days }), [updateSettings]);
  const setCycleDay = useCallback((cycleDay: number) => updateSettings({ cycleDay }), [updateSettings]);
  const setBaseCurrency = useCallback(
    (baseCurrency: AppCurrencyCode) => updateSettings({ baseCurrency }),
    [updateSettings],
  );

  const setTimeZone = useCallback((timeZone: string) => updateSettings({ timeZone }), [updateSettings]);

  return {
    ...settings,
    setTimeZone,
    setMode,
    setDays,
    setCycleDay,
    setBaseCurrency,
  };
}
