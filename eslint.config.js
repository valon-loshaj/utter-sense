const eslint = require("@eslint/js");
const lwc = require("@lwc/eslint-plugin-lwc");
const salesforceLwc = require("@salesforce/eslint-config-lwc/recommended");

module.exports = [
  eslint.configs.recommended,
  {
    files: ["**/lwc/**/*.js"],
    plugins: {
      lwc
    },
    rules: {
      ...salesforceLwc.rules
      // Any custom rules you want to add
    }
  },
  {
    files: ["**/aura/**/*.js"],
    rules: {
      // Aura specific rules
    }
  }
];
