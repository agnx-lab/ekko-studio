// 场景：EKKO Studio 面板 — 贴边 host.guest.mount，首帧品牌扫光，失败展示 GUEST 错误。
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ComponentType,
  type ReactElement,
} from "react";
import type { WorkspaceAppBrandLogoLoaderPanelProps } from "@agnx-lab/app-sdk";
import { EKKO_STUDIO_APP_ID, EKKO_STUDIO_ENSURE_TOOL_REL } from "./constants";
import { requireEkkoStudioHost } from "./host-bind";

const WEB_ROOT_STYLE: CSSProperties = {
  flex: "1 1 0%",
  alignSelf: "stretch",
  minHeight: 0,
  minWidth: 0,
  width: "100%",
  height: "100%",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  position: "relative",
  backgroundColor: "transparent",
};

const GUEST_HOST_STYLE: CSSProperties = {
  flex: "1 1 auto",
  minHeight: 0,
  minWidth: 0,
  width: "100%",
  height: "100%",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  position: "relative",
};

const BOOT_LAYER_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 2,
  display: "flex",
  flexDirection: "column",
  background: "transparent",
};

const ERROR_LAYER_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 3,
  display: "flex",
  flexDirection: "column",
  background: "transparent",
};

const ERROR_FALLBACK_STYLE: CSSProperties = {
  ...ERROR_LAYER_STYLE,
  alignItems: "center",
  justifyContent: "center",
  color: "#a1a1aa",
  padding: 24,
  textAlign: "center",
};

export function EkkoStudioPanel(): ReactElement {
  const guestHostRef = useRef<HTMLDivElement | null>(null);
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const host = requireEkkoStudioHost();
    host.background?.requestRetain?.({
      appId: EKKO_STUDIO_APP_ID,
      active: true,
      reason: "ekko-studio-open",
    });
    return () => {
      host.background?.requestRetain?.({
        appId: EKKO_STUDIO_APP_ID,
        active: false,
        reason: "ekko-studio-open",
      });
    };
  }, []);

  useEffect(() => {
    const host = requireEkkoStudioHost();
    if (!host.guest?.mount) {
      setBooting(false);
      setError("宿主未提供 host.guest.mount（需升级 Agnx）");
      return;
    }
    const container = guestHostRef.current;
    if (!container) {
      return;
    }
    if (typeof document === "undefined" || !host.platform.isWeb) {
      setBooting(false);
      setError("EKKO Studio 需要在本机 Agnx 网页或桌面打开。手机上访问不到这台机器的 loopback。");
      return;
    }
    const unmount = host.guest.mount({
      container,
      ensureTool: EKKO_STUDIO_ENSURE_TOOL_REL,
      ensureArgs: ["--supervised"], // packaged: no --mode dev; runtime-defaults/serve + reuse healthy port
      timeoutMs: 180_000,
      bootOverlay: false,
      onReady: () => {
        setError(null);
        window.setTimeout(() => setBooting(false), 320);
      },
      onError: (detail) => {
        setBooting(false);
        setError(`${detail.code}: ${detail.message}`);
      },
    });
    return unmount;
  }, []);

  const BrandPanel = requireEkkoStudioHost().ui?.BrandLogoLoaderPanel as
    | ComponentType<WorkspaceAppBrandLogoLoaderPanelProps>
    | undefined;

  return (
    <div
      style={WEB_ROOT_STYLE}
      aria-label="EKKO Studio panel"
      data-testid="workspace-mini-app-ekko-studio-root"
    >
      <div
        ref={guestHostRef}
        data-agnx-guest-surface-host="true"
        style={GUEST_HOST_STYLE}
      />
      {booting && !error && BrandPanel ? (
        <div data-agnx-guest-boot-overlay="true" style={BOOT_LAYER_STYLE} role="status">
          <BrandPanel title="正在启动 EKKO Studio…" testID="ekko-studio-boot-overlay" />
        </div>
      ) : null}
      {booting && !error && !BrandPanel ? (
        <div data-agnx-guest-boot-overlay="true" style={ERROR_FALLBACK_STYLE} role="status">
          正在启动 EKKO Studio…
        </div>
      ) : null}
      {error && BrandPanel ? (
        <div style={ERROR_LAYER_STYLE} role="alert">
          <BrandPanel
            title={error}
            description="打开命令面板 → EKKO Studio → 详情，复制 Guest Surface 贴给 AI。第一版未做 embed=1 裁剪与静默 token 登录。"
            testID="ekko-studio-mount-error"
          />
        </div>
      ) : null}
      {error && !BrandPanel ? (
        <div style={ERROR_FALLBACK_STYLE} role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}
