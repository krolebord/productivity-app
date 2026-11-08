// Keeps EAS Android release builds within the free worker's memory (4 vCPUs, ~16 GB). Release builds
// compile the big C++ modules (op-sqlite's SQLite, Skia, Reanimated, expo-modules-core) optimized and
// with debug info; run in parallel, clang ran the worker out of memory and the kernel killed the
// compiler, then the Gradle daemon. Fewer parallel tasks trades a few minutes for a build that finishes.
// Only on EAS (EAS_BUILD is set there), so local builds keep full parallelism.
const { withGradleProperties } = require("expo/config-plugins");

const PROPERTIES = {
  "org.gradle.workers.max": "2",
  "kotlin.daemon.jvmargs": "-Xmx1536m",
};

module.exports = function withAndroidBuildMemory(config) {
  if (!process.env.EAS_BUILD) return config;
  return withGradleProperties(config, (config) => {
    for (const [key, value] of Object.entries(PROPERTIES)) {
      config.modResults = config.modResults.filter((item) => !(item.type === "property" && item.key === key));
      config.modResults.push({ type: "property", key, value });
    }
    return config;
  });
};
