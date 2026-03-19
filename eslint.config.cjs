const ts = require("typescript-eslint");

module.exports = ts.config({
  files: ["src/**/*.ts"],
  extends: [
    ts.configs.recommended,
  ],
  rules: {
    // Add custom rules here if needed
  },
});
