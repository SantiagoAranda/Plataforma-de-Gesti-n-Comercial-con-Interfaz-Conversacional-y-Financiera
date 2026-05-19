"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

type HomeDetailView = "welcome" | "agenda";

type HomeDesktopViewState = {
  detailView: HomeDetailView;
  selectedAgendaDate: Date;
  openDetailedAgenda: (date: Date) => void;
  showWelcome: () => void;
};

const HomeDesktopViewContext = createContext<HomeDesktopViewState | null>(null);

export function HomeDesktopViewProvider({ children }: { children: ReactNode }) {
  const [detailView, setDetailView] = useState<HomeDetailView>("welcome");
  const [selectedAgendaDate, setSelectedAgendaDate] = useState<Date>(() => new Date());

  const value = useMemo<HomeDesktopViewState>(() => {
    return {
      detailView,
      selectedAgendaDate,
      openDetailedAgenda: (date: Date) => {
        setSelectedAgendaDate(date);
        setDetailView("agenda");
      },
      showWelcome: () => setDetailView("welcome"),
    };
  }, [detailView, selectedAgendaDate]);

  return (
    <HomeDesktopViewContext.Provider value={value}>
      {children}
    </HomeDesktopViewContext.Provider>
  );
}

export function useHomeDesktopView() {
  return useContext(HomeDesktopViewContext);
}

