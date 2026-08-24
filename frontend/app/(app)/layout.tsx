"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getToken, handleSessionExpired } from "@/src/lib/auth";
import DesktopModulePanel from "@/src/components/layout/DesktopModulePanel";
import DesktopSidebar from "@/src/components/layout/DesktopSidebar";
import DesktopSidePanel from "@/src/components/layout/DesktopSidePanel";
import { DesktopSidePanelProvider } from "@/src/components/layout/DesktopSidePanelContext";
import { ManualPaidOutflowProvider } from "@/src/components/layout/ManualPaidOutflowProvider";

export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    const token = getToken();
    if (!token) {
      handleSessionExpired();
    }
  }, [router]);

  return (
    <ManualPaidOutflowProvider>
      <DesktopSidePanelProvider>
        <div className="min-h-screen bg-white lg:grid lg:h-screen lg:grid-cols-[88px_320px_1fr] lg:overflow-hidden">
          <DesktopSidebar />
          <DesktopModulePanel />
          <div className="lg:h-screen lg:overflow-hidden">
            <DesktopSidePanel>{children}</DesktopSidePanel>
          </div>
        </div>
      </DesktopSidePanelProvider>
    </ManualPaidOutflowProvider>
  );
}
