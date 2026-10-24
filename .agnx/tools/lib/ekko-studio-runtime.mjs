// 场景：EKKO Studio sidecar 共用运行参数 — 默认端口、Node≥23、依赖提示。
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const APP_ID = "ekko-studio";
export const REPO_ROOT = path.resolve(here, "../../..");
export const LAUNCHER = path.join(REPO_ROOT, ".agnx/tools/run-ekko-studio-dev.mjs");

const defaultsPath = path.join(REPO_ROOT, ".agnx/runtime-defaults.json");
export const DEFAULTS = JSON.parse(readFileSync(defaultsPath, "utf8"));

export function resolveAgnxHome(env = process.env) {
  const raw = (env.AGNX_HOME || "").trim() || path.join(os.homedir(), ".agnx-dev");
  if (raw === "~") {
    return os.homedir();
  }
  if (raw.startsWith("~/")) {
    return path.join(os.homedir(), raw.slice(2));
  }
  return path.resolve(raw);
}

export function dataRoot(env = process.env) {
  const explicit = (env.EKKO_STUDIO_DATA_ROOT || env.AGNX_APP_DATA_ROOT || "").trim();
  if (explicit) {
    return path.resolve(explicit);
  }
  return path.join(resolveAgnxHome(env), "apps", "data", APP_ID);
}

export function runtimeConfigPath(env = process.env) {
  return path.join(dataRoot(env), "config", "runtime.json");
}

function asPort(value, fallback) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return fallback;
  }
  return parsed;
}

function readArg(argv, name) {
  const eq = argv.find((arg) => arg.startsWith(`--${name}=`));
  if (eq) {
    return eq.slice(name.length + 3);
  }
  const index = argv.indexOf(`--${name}`);
  if (index >= 0) {
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      return next;
    }
  }
  return undefined;
}

function normalizeGuestMode(raw) {
  const v = String(raw || "").trim().toLowerCase();
  if (v === "dev" || v === "development") return "dev";
  if (v === "start" || v === "prod" || v === "production") return "start";
  // serve | packaged | omitted → guest serve（可复用 Vite+Koa 启动器，但非 AGNX glue debug-dev）
  return "serve";
}

export function parseArgs(argv) {
  return {
    supervised: argv.includes("--supervised"),
    forceRestart: argv.includes("--force-restart") || argv.includes("--forceRestart"),
    mode: normalizeGuestMode(readArg(argv, "mode") || DEFAULTS.mode || "serve"),
    webPort: readArg(argv, "web-port"),
    serverPort: readArg(argv, "server-port"),
  };
}

export function loadRuntimeConfig(argv = [], env = process.env, options = {}) {
  const args = parseArgs(argv);
  const honorProcessEnv = options.honorProcessEnv === true;
  let file = {};
  const filePath = runtimeConfigPath(env);
  if (existsSync(filePath)) {
    try {
      const parsed = JSON.parse(readFileSync(filePath, "utf8"));
      if (parsed && typeof parsed === "object") {
        file = parsed;
      }
    } catch {
      file = {};
    }
  }
  const webPort = asPort(
    args.webPort ?? (honorProcessEnv ? env.HERMES_WEB_UI_FRONTEND_PORT : undefined) ?? file.webPort,
    DEFAULTS.webPort,
  );
  const serverPort = asPort(
    args.serverPort ??
      (honorProcessEnv ? env.HERMES_WEB_UI_BACKEND_PORT || env.PORT : undefined) ??
      file.serverPort,
    DEFAULTS.serverPort,
  );
  return {
    ...args,
    webPort,
    serverPort,
    dataRoot: dataRoot(env),
    repoRoot: REPO_ROOT,
  };
}

export function fingerprint(cfg) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        webPort: cfg.webPort,
        serverPort: cfg.serverPort,
        mode: cfg.mode,
      }),
    )
    .digest("hex")
    .slice(0, 16);
}

function nodeMajor(version) {
  return Number(String(version).replace(/^v/, "").split(".")[0]);
}

/** engines.node >= 23；优先当前进程，其次 nvm/fnm 里最高的 v23+ */
export function findNode23() {
  if (nodeMajor(process.version) >= 23 && existsSync(process.execPath)) {
    return process.execPath;
  }
  const roots = [
    path.join(os.homedir(), ".nvm/versions/node"),
    path.join(os.homedir(), ".local/share/fnm/node-versions"),
  ];
  const hits = [];
  for (const root of roots) {
    if (!existsSync(root)) {
      continue;
    }
    for (const name of readdirSync(root)) {
      const major = nodeMajor(name);
      if (!Number.isFinite(major) || major < 23) {
        continue;
      }
      const candidate = path.join(root, name, "bin", "node");
      if (existsSync(candidate)) {
        hits.push({ major, candidate, name });
      }
    }
  }
  hits.sort((a, b) => a.major - b.major || a.name.localeCompare(b.name));
  return hits.at(-1)?.candidate ?? null;
}

/** Guest 登录后主界面会动态 import mermaid；包残缺时 Vite overlay 挡住主 UI，像登录失败。 */
export function guestCriticalDepsError() {
  const mermaidPkg = path.join(REPO_ROOT, "node_modules/mermaid/package.json");
  const mermaidCore = path.join(REPO_ROOT, "node_modules/mermaid/dist/mermaid.core.mjs");
  if (!existsSync(path.join(REPO_ROOT, "node_modules"))) {
    return null;
  }
  if (existsSync(mermaidPkg) && !existsSync(mermaidCore)) {
    return "依赖 mermaid 安装不完整（缺 dist/mermaid.core.mjs）。在项目根执行：npm install mermaid";
  }
  if (!existsSync(mermaidPkg)) {
    return "未安装 mermaid（登录后聊天页会 Vite 报错遮罩）。在项目根执行：npm install";
  }
  return null;
}

export function dependencyWarnings() {
  const warnings = [];
  if (!existsSync(path.join(REPO_ROOT, "node_modules"))) {
    warnings.push("未安装依赖。在项目根用 Node ≥23 执行：npm install");
  }
  if (!findNode23()) {
    warnings.push("未找到 Node.js ≥23。ekko-studio engines 要求 node >= 23.0.0");
  }
  const depErr = guestCriticalDepsError();
  if (depErr) {
    warnings.push(depErr);
  }
  return warnings;
}
