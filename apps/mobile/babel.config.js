// Expo's default preset, plus one Hermes parser fix it no longer ships (see the plugin's comment).
module.exports = (api) => {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: ["./babel/hermes-async-arrow-rest-pattern"],
  };
};
