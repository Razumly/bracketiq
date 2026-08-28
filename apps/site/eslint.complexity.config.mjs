import config, { complexityRules } from "./eslint.config.mjs";

const complexityConfig = [
  ...config,
  {
    name: "bracketiq/complexity",
    files: ["**/*.{cjs,cts,js,jsx,mjs,mts,ts,tsx}"],
    rules: complexityRules,
  },
];

export default complexityConfig;
