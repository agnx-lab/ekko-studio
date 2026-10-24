// 场景：EKKO Studio 胶水绑定宿主，面板共用同一个 host。
import type { WorkspaceAppHostApi } from "@agnx-lab/app-sdk";

let boundHost: WorkspaceAppHostApi | null = null;

export function bindEkkoStudioHost(host: WorkspaceAppHostApi): void {
  boundHost = host;
}

export function requireEkkoStudioHost(): WorkspaceAppHostApi {
  if (!boundHost) {
    throw new Error("EKKO Studio host 未绑定");
  }
  return boundHost;
}
