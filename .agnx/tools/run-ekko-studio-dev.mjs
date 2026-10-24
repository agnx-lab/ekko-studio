#!/usr/bin/env node
// 场景：daemon 托管的 EKKO Studio 进程 — Koa 后端 + Vite 前端，退出时收回子进程。
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { findNode23, loadRuntimeConfig } from "./lib/ekko-studio-runtime.mjs";

const cfg = loadRuntimeConfig(process.argv.slice(2), process.env, { honorProcessEnv: true });
const children = [];
let shuttingDown = false;

function fail(message) {
  console.error(`[ekko-studio] ${message}`);
  process.exit(1);
}

function shutdown(code) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  for (const child of children) {
    if (child.exitCode == null && child.signalCode == null) {
      child.kill("SIGTERM");
    }
  }
  process.exit(code);
}

function spawnLogged(name, command, args, env, cwd = cfg.repoRoot) {
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  const write = (stream, chunk) => {
    const text = chunk.toString();
    for (const line of text.split(/\n/)) {
      if (line.length > 0) {
        stream.write(`[${name}] ${line}\n`);
      }
    }
  };
  child.stdout?.on("data", (chunk) => write(process.stdout, chunk));
  child.stderr?.on("data", (chunk) => write(process.stderr, chunk));
  child.on("exit", (exitCode, signal) => {
    if (shuttingDown) {
      return;
    }
    console.error(`[ekko-studio] ${name} 退出 code=${exitCode} signal=${signal ?? ""}`);
    shutdown(exitCode && exitCode !== 0 ? exitCode : 1);
  });
  return child;
}

const nodeBin = findNode23();
if (!nodeBin) {
  fail("未找到 Node.js ≥23。");
}

const serverEntry = path.join(cfg.repoRoot, "packages/server/src/index.ts");
const viteCli = path.join(cfg.repoRoot, "node_modules/vite/bin/vite.js");
const tsNodeRegister = path.join(cfg.repoRoot, "node_modules/ts-node/register/index.js");
if (!existsSync(viteCli) || !existsSync(serverEntry)) {
  fail("未安装依赖或缺少入口。在项目根用 Node ≥23 执行：npm install");
}

const nodeDir = path.dirname(nodeBin);
const baseEnv = {
  ...process.env,
  PATH: `${nodeDir}${path.delimiter}${process.env.PATH || ""}`,
  NODE_ENV: "development",
  PORT: String(cfg.serverPort),
  HOST: "127.0.0.1",
  HERMES_WEB_UI_BACKEND_PORT: String(cfg.serverPort),
  HERMES_WEB_UI_FRONTEND_PORT: String(cfg.webPort),
  HERMES_WEB_UI_STOP_GATEWAYS_ON_SHUTDOWN: "1",
  TS_NODE_PROJECT: path.join(cfg.repoRoot, "packages/server/tsconfig.json"),
};

console.error(
  `[ekko-studio] 启动 web=127.0.0.1:${cfg.webPort} server=127.0.0.1:${cfg.serverPort} node=${nodeBin}`,
);

// 后端：对齐 nodemon.json / npm run dev:server（不用长期 nodemon，由 Agnx supervisor 托管）
const serverArgs = existsSync(tsNodeRegister)
  ? ["--no-warnings", "-r", "ts-node/register", serverEntry]
  : ["--no-warnings", "--import", "tsx", serverEntry];

spawnLogged("ekko-server", nodeBin, serverArgs, baseEnv, cfg.repoRoot);

// 前端：对齐 npm run dev:client — vite --host --port <webPort> --strictPort
const viteArgs = [
  viteCli,
  "--host",
  "127.0.0.1",
  "--port",
  String(cfg.webPort),
  "--strictPort",
];
spawnLogged("ekko-web", nodeBin, viteArgs, baseEnv, cfg.repoRoot);

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => shutdown(0));
}

