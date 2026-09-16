import nextConfig from "eslint-config-next";

export const complexityRules = {
  complexity: ["error", { max: 10, variant: "classic" }],
  "max-depth": ["error", 4],
};

const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "dist/**",
      "coverage/**",
      "generated/**",
      "src/generated/**",
    ],
  },
  ...nextConfig,
];

export default config;
