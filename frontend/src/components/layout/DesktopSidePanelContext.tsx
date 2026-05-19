"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

export type DesktopSidePanelView =
  | { type: "default" }
  | { type: "agenda-details"; date: Date };

type DesktopSidePanelState = {
  sidePanelView: DesktopSidePanelView;
  openAgendaDetails: (date: Date) => void;
  closeSidePanel: () => void;
};

const DesktopSidePanelContext = createContext<DesktopSidePanelState | null>(null);

export function DesktopSidePanelProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [sidePanelView, setSidePanelView] = useState<DesktopSidePanelView>({
    type: "default",
  });

  const closeSidePanel = useCallback(() => {
    setSidePanelView({ type: "default" });
  }, []);

  const openAgendaDetails = useCallback((date: Date) => {
    setSidePanelView({ type: "agenda-details", date });
  }, []);

  useEffect(() => {
    closeSidePanel();
  }, [closeSidePanel, pathname]);

  const value = useMemo<DesktopSidePanelState>(() => {
    return { sidePanelView, openAgendaDetails, closeSidePanel };
  }, [closeSidePanel, openAgendaDetails, sidePanelView]);

  return (
    <DesktopSidePanelContext.Provider value={value}>
      {children}
    </DesktopSidePanelContext.Provider>
  );
}

export function useDesktopSidePanel() {
  return useContext(DesktopSidePanelContext);
}

