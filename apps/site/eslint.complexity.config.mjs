import config, { complexityRules } from "./eslint.config.mjs";

const complexityConfig = [
  ...config,
  {
    name: "bracketiq/complexity",
    files: ["**/*.{cjs,cts,js,jsx,mjs,mts,ts,tsx}"],
    rules: complexityRules,
  },
  {
    name: "bracketiq/ui-complexity",
    files: ["**/*.{jsx,tsx}"],
    rules: {
      complexity: ["warn", { max: 20, variant: "classic" }],
    },
  },
];

export default complexityConfig;
