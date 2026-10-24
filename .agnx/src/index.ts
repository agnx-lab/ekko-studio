// 场景：EKKO Studio 子应用入口 — 打开上游 Web Guest，并向 Agent 暴露打开 Tab。
import type { WorkspaceAppHostApi, WorkspaceAppModule } from "@agnx-lab/app-sdk";
import {
  EKKO_STUDIO_APP_ID,
  EKKO_STUDIO_ENSURE_TOOL_REL,
  EKKO_STUDIO_OPEN_COMMAND_ID,
  EKKO_STUDIO_PANEL_ID,
} from "./constants";
import { bindEkkoStudioHost } from "./host-bind";
import { EkkoStudioPanel } from "./panel";

export const appId = EKKO_STUDIO_APP_ID;

function openEkkoStudioTab(
  host: WorkspaceAppHostApi,
  context?: {
    serverId?: string;
    workspaceId?: string;
    currentPathname?: string | null;
  },
): void {
  host.openSubAppTab({
    appId: EKKO_STUDIO_APP_ID,
    panelId: EKKO_STUDIO_PANEL_ID,
    serverId: context?.serverId,
    workspaceId: context?.workspaceId,
    currentPathname: context?.currentPathname,
  });
}

export function activate(host: WorkspaceAppHostApi): () => void {
  bindEkkoStudioHost(host);

  host.registerMiniApp({
    id: EKKO_STUDIO_PANEL_ID,
    appId: EKKO_STUDIO_APP_ID,
    title: "EKKO Studio",
    component: EkkoStudioPanel,
    iframeShortcutCapture: true,
    isolation: {
      mode: "iframe",
      sidecarTools: [EKKO_STUDIO_ENSURE_TOOL_REL],
      note: "Tab 嵌 EKKO Studio Web；daemon 托管 Koa 后端 + Vite 前端",
    },
  });

  host.registerCommand({
    id: EKKO_STUDIO_OPEN_COMMAND_ID,
    appId: EKKO_STUDIO_APP_ID,
    title: "EKKO Studio",
    keywords: ["ekko", "ekko-studio", "hermes", "studio", "agent"],
    sidebarAction: {
      defaultVisible: true,
      label: "EKKO",
      order: 66,
    },
    run: (context) => {
      openEkkoStudioTab(host, context);
    },
  });

  const unregisterTools = host.registerAgentTools({
    appId: EKKO_STUDIO_APP_ID,
    availability: "always",
    tools: [
      {
        name: "open",
        description: "在当前工作区打开 EKKO Studio Tab",
        groupId: "ekko-studio-runtime",
        groupTitle: "运行",
        execute: () => {
          const opened = host.openSubAppTab({
            appId: EKKO_STUDIO_APP_ID,
            panelId: EKKO_STUDIO_PANEL_ID,
          });
          return { ok: opened };
        },
      },
    ],
  });

  return () => {
    unregisterTools();
  };
}

const moduleExport: WorkspaceAppModule = {
  appId: EKKO_STUDIO_APP_ID,
  activate,
};

export default moduleExport;
