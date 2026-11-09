import type { Kysely } from "kysely";
import { useCallback } from "react";
import type { AppCurrencyCode } from "../currency/currencies";
import { APP_CURRENCIES } from "../currency/currencies";
import { clampDashboardRangeValue, type DashboardRangeConfig, type DashboardRangeMode } from "../dashboard-range-store";
import { DASHBOARD_SETTINGS_DEFAULTS, DASHBOARD_SETTINGS_ID } from "../dashboard-settings-defaults";
import { type UserDbDatabase, useDb, useDbQuery } from "../user-db/db-context";
import type { DashboardSettingsItem, UserDb } from "../user-db/migrations";

const appCurrencySet = new Set<string>(APP_CURRENCIES);

export interface DashboardSettings extends DashboardRangeConfig {
  baseCurrency: AppCurrencyCode;
  /** IANA zone; empty until a device reports it. */
  timeZone: string;
}

export type DashboardSettingsPatch = Partial<DashboardSettings>;

export const DEFAULT_DASHBOARD_SETTINGS: DashboardSettings = {
  mode: DASHBOARD_SETTINGS_DEFAULTS.rangeMode,
  days: DASHBOARD_SETTINGS_DEFAULTS.rangeDays,
  cycleDay: DASHBOARD_SETTINGS_DEFAULTS.cycleDay,
  baseCurrency: DASHBOARD_SETTINGS_DEFAULTS.baseCurrency,
  timeZone: DASHBOARD_SETTINGS_DEFAULTS.timeZone,
};

export function isRangeMode(value: string): value is DashboardRangeMode {
  return value === "days" || value === "cycle";
}

export function isAppCurrency(value: string): value is AppCurrencyCode {
  return appCurrencySet.has(value);
}

export const dashboardSettingsQuery = (q: Kysely<UserDb>) =>
  q.selectFrom("dashboard_settings").selectAll().where("id", "=", DASHBOARD_SETTINGS_ID).limit(1);

/** The stored settings row with defaults filled in and out-of-range values clamped. */
export function normalizeDashboardSettings(row?: DashboardSettingsItem): DashboardSettings {
  if (!row) return DEFAULT_DASHBOARD_SETTINGS;

  return {
    mode: isRangeMode(row.rangeMode) ? row.rangeMode : DEFAULT_DASHBOARD_SETTINGS.mode,
    days: clampDashboardRangeValue(row.rangeDays),
    cycleDay: clampDashboardRangeValue(row.cycleDay),
    baseCurrency: isAppCurrency(row.baseCurrency) ? row.baseCurrency : DEFAULT_DASHBOARD_SETTINGS.baseCurrency,
    timeZone: row.timeZone,
  };
}

function toStoredPatch(patch: DashboardSettingsPatch) {
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

export function updateDashboardSettings(db: UserDbDatabase, patch: DashboardSettingsPatch) {
  const storedPatch = toStoredPatch(patch);
  if (Object.keys(storedPatch).length === 0) return;

  const now = Date.now();
  db.executeTransaction((trx) => {
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
}

/**
 * The synced dashboard settings with typed setters. `isStored` is false until a settings row
 * exists, i.e. while everything reads from the defaults.
 */
export function useDashboardSettings() {
  const db = useDb();
  const { data: rows } = useDbQuery(dashboardSettingsQuery);
  const syncedRow = rows[0];
  const settings = normalizeDashboardSettings(syncedRow);

  const updateSettings = useCallback((patch: DashboardSettingsPatch) => updateDashboardSettings(db.db, patch), [db.db]);

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
    isStored: syncedRow !== undefined,
    updateSettings,
    setTimeZone,
    setMode,
    setDays,
    setCycleDay,
    setBaseCurrency,
  };
}
