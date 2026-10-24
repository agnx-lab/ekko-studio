#!/usr/bin/env node
// 场景：EKKO Studio ensure --supervised — 只输出 daemon 启动计划，不在这里拉起 Vite/Koa。
import http from "node:http";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  LAUNCHER,
  dependencyWarnings,
  findNode23,
  fingerprint,
  guestCriticalDepsError,
  loadRuntimeConfig,
} from "./lib/ekko-studio-runtime.mjs";

function httpGetJson(url, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const statusCode = res.statusCode ?? 0;
        if (statusCode < 200 || statusCode >= 300) {
          resolve(null);
          return;
        }
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        } catch {
          resolve(null);
        }
      });
    });
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
    req.on("error", () => resolve(null));
  });
}

function isHealthy(body) {
  if (!body || typeof body !== "object") {
    return false;
  }
  // 上游 /health → { status: "ok", ... }；/livez → { status: "ok" }
  return body.status === "ok";
}

function buildPlan(cfg, warnings) {
  const nodeBin = findNode23();
  if (!nodeBin) {
    return {
      ok: false,
      error: "未找到 Node.js ≥23。请安装后再打开 EKKO Studio。",
      warnings,
    };
  }
  if (!existsSync(LAUNCHER)) {
    return { ok: false, error: `找不到启动器 ${LAUNCHER}`, warnings };
  }
  if (!existsSync(path.join(cfg.repoRoot, "node_modules"))) {
    return {
      ok: false,
      error: "未安装依赖。在项目根用 Node ≥23 执行：npm install",
      warnings,
    };
  }
  const depErr = guestCriticalDepsError();
  if (depErr) {
    return { ok: false, error: depErr, warnings };
  }
  // Guest URL = Vite 前端（默认 8649）；packaged 下 mode=serve：仍复用/拉起 Vite+Koa 启动器（非 AGNX glue debug-dev）；健康检查走 /health
  const healthUrl = `http://127.0.0.1:${cfg.webPort}/health`;
  return {
    ok: true,
    plan: {
      command: nodeBin,
      args: [LAUNCHER],
      cwd: cfg.repoRoot,
      env: {
        HERMES_WEB_UI_FRONTEND_PORT: String(cfg.webPort),
        HERMES_WEB_UI_BACKEND_PORT: String(cfg.serverPort),
        PORT: String(cfg.serverPort),
        HOST: "127.0.0.1",
        NODE_ENV: "development",
        HERMES_WEB_UI_STOP_GATEWAYS_ON_SHUTDOWN: "1",
      },
      fingerprint: fingerprint(cfg),
      healthUrl,
      port: cfg.webPort,
      launchMode: cfg.mode || "serve",
    },
  };
}

async function main() {
  const cfg = loadRuntimeConfig(process.argv.slice(2));
  const warnings = dependencyWarnings();
  const healthUrl = `http://127.0.0.1:${cfg.webPort}/health`;
  const origin = `http://127.0.0.1:${cfg.webPort}`;

  if (cfg.supervised && !cfg.forceRestart) {
    const body = await httpGetJson(healthUrl);
    if (isHealthy(body)) {
      console.log(
        JSON.stringify({
          ok: true,
          reused: true,
          origin,
          port: cfg.webPort,
          mode: cfg.mode,
          warnings,
          healthUrl,
        }),
      );
      return;
    }
  }

  // 无 --supervised：若已健康则直接复用；否则要求 daemon 走 supervised plan（对齐共工，并兼容漏加 flag 的探测）
  if (!cfg.supervised) {
    const body = await httpGetJson(healthUrl);
    if (isHealthy(body)) {
      console.log(
        JSON.stringify({
          ok: true,
          reused: true,
          origin,
          port: cfg.webPort,
          mode: cfg.mode,
          warnings,
          healthUrl,
        }),
      );
      return;
    }
    console.log(
      JSON.stringify({
        ok: false,
        error: "EKKO Studio 只支持 daemon 托管。请加 --supervised，由 Agnx 拉起 sidecar。",
        warnings,
      }),
    );
    process.exitCode = 1;
    return;
  }

  const planned = buildPlan(cfg, warnings);
  console.log(
    JSON.stringify({
      ...planned,
      reused: false,
      origin: planned.ok ? origin : undefined,
      port: cfg.webPort,
      mode: cfg.mode,
      warnings,
      repoRoot: cfg.repoRoot,
    }),
  );
  if (!planned.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.log(
    JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }),
  );
  process.exitCode = 1;
});
