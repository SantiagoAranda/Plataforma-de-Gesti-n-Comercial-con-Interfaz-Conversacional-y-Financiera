import type { ReactNode } from "react";

import DesktopModulePanel from "@/src/components/layout/DesktopModulePanel";
import DesktopSidebar from "@/src/components/layout/DesktopSidebar";
import DesktopSidePanel from "@/src/components/layout/DesktopSidePanel";
import { DesktopSidePanelProvider } from "@/src/components/layout/DesktopSidePanelContext";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <DesktopSidePanelProvider>
      <div className="min-h-screen bg-white lg:grid lg:h-screen lg:grid-cols-[88px_320px_1fr] lg:overflow-hidden">
        <DesktopSidebar />
        <DesktopModulePanel />
        <div className="lg:h-screen lg:overflow-hidden">
          <DesktopSidePanel>{children}</DesktopSidePanel>
        </div>
      </div>
    </DesktopSidePanelProvider>
  );
}

