#!/usr/bin/env node
// Lightweight ZIP helper for CI/local use. Tries native tools before failing.
// TODO: replace with cross-platform archiver if CI environment lacks zip/powershell.

const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const distDir = path.join(__dirname, "..", "dist");
const zipPath = path.join(distDir, "pr-sentinel-extension.zip");

if (!fs.existsSync(distDir)) {
  console.error("dist/ not found. Run `npm run build:extension` first.");
  process.exit(1);
}

try {
  // Try zip (Unix environments)
  execSync(`cd ${distDir} && zip -r pr-sentinel-extension.zip *`, { stdio: "inherit" });
  process.exit(0);
} catch (err) {
  console.warn("zip command unavailable, trying powershell Compress-Archive");
}

try {
  execSync(
    `powershell -Command "Compress-Archive -Path '${distDir}/*' -DestinationPath '${zipPath}' -Force"`,
    { stdio: "inherit" }
  );
  process.exit(0);
} catch (err) {
  console.error("Failed to create ZIP. Install zip or enable PowerShell Compress-Archive.");
  process.exit(1);
}
