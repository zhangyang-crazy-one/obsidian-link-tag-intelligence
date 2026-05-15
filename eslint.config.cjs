const ts = require("typescript-eslint");

module.exports = ts.config({
  files: ["src/**/*.ts"],
  ignores: ["dist/**", "main.js", "speech-worker.js", "asr-worker.js"],
  extends: [
    ts.configs.recommended,
  ],
  rules: {
    // Add custom rules here if needed
  },
});
