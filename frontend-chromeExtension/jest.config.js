/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  roots: ["<rootDir>/src"],
  moduleNameMapper: {
    "\\.(css|less|scss|sass)$": "identity-obj-proxy",
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  setupFiles: ["<rootDir>/src/tests/setupGlobals.ts"],
  setupFilesAfterEnv: ["<rootDir>/src/tests/setupTests.ts"],
};
