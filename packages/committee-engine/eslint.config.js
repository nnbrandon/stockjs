// Minimal, dependency-free flat config: the engine is pure ESM with no DOM,
// no Dexie, no AWS — only console is expected as a global.
export default [
  {
    files: ["src/**/*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { console: "readonly", Intl: "readonly" },
    },
    rules: {
      "no-unused-vars": ["error", { varsIgnorePattern: "^[A-Z_]" }],
      "no-undef": "error",
      eqeqeq: ["error", "smart"],
    },
  },
];
