#!/usr/bin/env node
/**
 * Patches expo-router to add internal/routing and internal/testing shims
 * required by @expo/router-server@55 (bundled with expo@55) but missing
 * from expo-router@6.0.x.
 */
const fs = require("fs");
const path = require("path");
const { glob } = require("fs");

const pnpmStore = path.join(__dirname, "../node_modules/.pnpm");

const ROUTING_SHIM = `"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const matchers = require("../build/matchers");
exports.isTypedRoute = matchers.isTypedRoute;
`;

const TESTING_SHIM = `"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const contextStubs = require("../build/testing-library/context-stubs");
exports.requireContext = contextStubs.requireContext;
exports.requireContextWithOverrides = contextStubs.requireContextWithOverrides;
`;

if (!fs.existsSync(pnpmStore)) {
  console.log("[patch-expo-router] pnpm store not found, skipping patch.");
  process.exit(0);
}

const entries = fs.readdirSync(pnpmStore);
const routerDirs = entries.filter((e) => e.startsWith("expo-router@6."));

if (routerDirs.length === 0) {
  console.log("[patch-expo-router] No expo-router@6 found, skipping patch.");
  process.exit(0);
}

for (const dir of routerDirs) {
  const routerPath = path.join(pnpmStore, dir, "node_modules", "expo-router");
  const internalDir = path.join(routerPath, "internal");

  if (!fs.existsSync(routerPath)) continue;

  fs.mkdirSync(internalDir, { recursive: true });
  fs.writeFileSync(path.join(internalDir, "routing.js"), ROUTING_SHIM);
  fs.writeFileSync(path.join(internalDir, "testing.js"), TESTING_SHIM);
  console.log(`[patch-expo-router] Patched: ${dir}`);
}
