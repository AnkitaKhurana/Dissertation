#!/usr/bin/env node
// Validate extension bundle size stays under 20MB to meet Chrome Web Store limits.

const fs = require("fs");
const path = require("path");

const MAX_MB = 20;
const distDir = path.join(__dirname, "..", "dist");
const zipPath = path.join(distDir, "pr-sentinel-extension.zip");

function getSizeBytes(p) {
  const stat = fs.statSync(p);
  if (stat.isDirectory()) {
    return fs.readdirSync(p).reduce((acc, name) => acc + getSizeBytes(path.join(p, name)), 0);
  }
  return stat.size;
}

if (fs.existsSync(zipPath)) {
  const bytes = fs.statSync(zipPath).size;
  const mb = bytes / (1024 * 1024);
  if (mb > MAX_MB) {
    console.error(`✗ Extension ZIP ${mb.toFixed(2)}MB exceeds ${MAX_MB}MB limit.`);
    process.exit(1);
  }
  console.log(`✓ Extension ZIP size ${mb.toFixed(2)}MB (< ${MAX_MB}MB)`);
  process.exit(0);
}

if (!fs.existsSync(distDir)) {
  console.error("dist/ not found. Run `npm run build:extension` first.");
  process.exit(1);
}

const bytes = getSizeBytes(distDir);
const mb = bytes / (1024 * 1024);
console.log(`Bundle size (unzipped): ${mb.toFixed(2)}MB. Generate ZIP for final check.`);
process.exit(mb > MAX_MB ? 1 : 0);
