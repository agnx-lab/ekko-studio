#!/usr/bin/env node
// 场景：EKKO Studio 胶水打包 — esbuild 打 CJS 到 .agnx/dist/index.js。
import { createRequire } from "node:module";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const agnxRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entry = path.join(agnxRoot, "src/index.ts");
const outFile = path.join(agnxRoot, "dist/index.js");

const candidates = [
  // 宿主仓库位置：优先环境变量，其次按 app 根相对推导（外部克隆通常两者都不可用，
  // 此时走下面的 require("esbuild") 兜底，由 .agnx/ 自己的 devDependencies 提供）。
  process.env.AGNX_MONOREPO_ROOT && path.join(process.env.AGNX_MONOREPO_ROOT, "node_modules/esbuild"),
  path.resolve(agnxRoot, "../../../Documents/github/agnx/node_modules/esbuild"),
  path.join(agnxRoot, "../node_modules/esbuild"),
].filter((p) => typeof p === "string" && p.length > 0);

let esbuild;
for (const candidate of candidates) {
  if (existsSync(candidate)) {
    esbuild = require(candidate);
    break;
  }
}
if (!esbuild) {
  try {
    esbuild = require("esbuild");
  } catch {
    console.error("[ekko-studio agnx build] 找不到 esbuild。请在 Agnx 仓安装依赖，或在本仓 npm install。");
    process.exit(1);
  }
}

mkdirSync(path.dirname(outFile), { recursive: true });
await esbuild.build({
  absWorkingDir: agnxRoot,
  entryPoints: [entry],
  outfile: outFile,
  bundle: true,
  format: "cjs",
  platform: "neutral",
  mainFields: ["module", "main", "browser"],
  conditions: ["import", "require", "default"],
  target: ["es2022"],
  jsx: "automatic",
  sourcemap: false,
  minify: true,
  external: [
    "react",
    "react-native",
    "react/jsx-runtime",
    "@agnx-lab/app-sdk",
    "react-native-unistyles",
  ],
  logLevel: "info",
});
console.log(`[ekko-studio agnx build] ok → ${outFile}`);
