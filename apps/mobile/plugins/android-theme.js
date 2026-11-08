// Gives Android's native UI (alert dialogs, date/time pickers, the text cursor and selection
// handles, the window behind React Native) the app's colors instead of the platform's teal and
// greys. Values mirror the tokens in src/global.css; keep them in sync. The night variants apply
// when the app's theme is dark: Uniwind sets Appearance, which switches the native DayNight theme.
const { AndroidConfig, withAndroidColors, withAndroidColorsNight, withAndroidStyles } = require("expo/config-plugins");

const LIGHT = {
  // primary; the dialog buttons it colors are bold, so its 4.2:1 on white reads fine.
  colorAccent: "#8b5cf6",
  appWindowBackground: "#ffffff", // background
  appSurface: "#ffffff", // card
  appTextHighlight: "#598b5cf6", // primary at 35%
};

const DARK = {
  // Lighter than primary: #8b5cf6 is only 3.6:1 on the dark dialog surface.
  colorAccent: "#a78bfa",
  appWindowBackground: "#171717",
  appSurface: "#262626",
  appTextHighlight: "#598b5cf6",
};

const THEME_ITEMS = {
  colorAccent: "@color/colorAccent",
  // AppCompat's alert dialogs draw on colorBackgroundFloating; the platform date/time pickers
  // read the android: attribute.
  colorBackgroundFloating: "@color/appSurface",
  "android:colorBackgroundFloating": "@color/appSurface",
  "android:windowBackground": "@color/appWindowBackground",
  "android:textColorHighlight": "@color/appTextHighlight",
};

const setColors = (xml, colors) => {
  for (const [name, value] of Object.entries(colors)) {
    xml = AndroidConfig.Colors.assignColorValue(xml, { name, value });
  }
  return xml;
};

module.exports = function withAndroidTheme(config) {
  config = withAndroidColors(config, (mod) => {
    mod.modResults = setColors(mod.modResults, LIGHT);
    return mod;
  });
  config = withAndroidColorsNight(config, (mod) => {
    mod.modResults = setColors(mod.modResults, DARK);
    return mod;
  });
  config = withAndroidStyles(config, (mod) => {
    const parent = AndroidConfig.Styles.getAppThemeGroup();
    for (const [name, value] of Object.entries(THEME_ITEMS)) {
      mod.modResults = AndroidConfig.Styles.assignStylesValue(mod.modResults, {
        add: true,
        parent,
        name,
        value,
      });
    }
    return mod;
  });
  return config;
};
