import type { ConfigContext, ExpoConfig } from "expo/config";

const APP_ID = "com.krolebord.productivity";

/** Set per build profile in eas.json, and by the dev presets for Metro. */
const IS_DEV_VARIANT = process.env.APP_VARIANT === "development";

export default ({ config }: ConfigContext): ExpoConfig => {
  const base = config as ExpoConfig;
  const appId = `${APP_ID}.${IS_DEV_VARIANT ? "dev" : "prod"}`;

  return {
    ...base,
    name: IS_DEV_VARIANT ? `${base.name} (dev)` : base.name,
    scheme: IS_DEV_VARIANT ? `${base.scheme}-dev` : base.scheme,
    ios: { ...base.ios, bundleIdentifier: appId },
    android: { ...base.android, package: appId },
  };
};
