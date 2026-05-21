module.exports = {
  root: true,
  env: {
    browser: true,
    es2021: true,
    jest: true,
    node: true,
    webextensions: true,
  },
  extends: ["eslint:recommended", "plugin:react/recommended", "plugin:react-hooks/recommended"],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaFeatures: { jsx: true },
    ecmaVersion: "latest",
    sourceType: "module",
  },
  plugins: ["react", "react-hooks", "@typescript-eslint"],
  settings: {
    react: { version: "detect" },
  },
  globals: {
    chrome: "readonly",
    global: "readonly",
    globalThis: "readonly",
    process: "readonly",
  },
  rules: {
    "react/react-in-jsx-scope": "off",
    "react/prop-types": "off",
    "no-eval": "error",
    "no-implied-eval": "error",
    "no-new-func": "error",
    "no-restricted-properties": [
      "error",
      { object: "document", property: "write", message: "document.write is disallowed in MV3" },
    ],
    "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
  },
  overrides: [
    {
      files: ["src/tests/**/*.ts", "src/tests/**/*.tsx"],
      env: {
        jest: true,
        node: true,
      },
      globals: {
        global: "readonly",
      },
    },
  ],
};
