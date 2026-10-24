#!/usr/bin/env node
// 场景：EKKO Studio 胶水 watch — 改 src 后重建 dist。
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const agnxRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const build = path.join(agnxRoot, "scripts/build.mjs");

function runBuild() {
  const child = spawn(process.execPath, [build], { stdio: "inherit", cwd: agnxRoot });
  child.on("exit", (code) => {
    if (code !== 0) {
      console.error(`[ekko-studio agnx watch] build exit ${code}`);
    }
  });
}

runBuild();

try {
  const { watch } = await import("node:fs");
  watch(path.join(agnxRoot, "src"), { recursive: true }, () => {
    console.error("[ekko-studio agnx watch] src changed → rebuild");
    runBuild();
  });
} catch (error) {
  console.error("[ekko-studio agnx watch] fs.watch 不可用，仅跑了一次 build", error);
}
