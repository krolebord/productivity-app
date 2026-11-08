// Compiles react-native-screens' "gamma" iOS sources, which hold the native FormSheet that
// src/components/ui/form-sheet.tsx renders. Its podspec only includes them when
// RNS_GAMMA_ENABLED=1 at `pod install`, so the Podfile sets it before the pods resolve.
// Android registers FormSheet unconditionally and needs nothing.
const { withPodfile } = require("expo/config-plugins");

const LINE = "ENV['RNS_GAMMA_ENABLED'] = '1' # plugins/rns-gamma.js";

module.exports = function withRnsGamma(config) {
  return withPodfile(config, (config) => {
    if (!config.modResults.contents.includes(LINE)) {
      config.modResults.contents = `${LINE}\n${config.modResults.contents}`;
    }
    return config;
  });
};
