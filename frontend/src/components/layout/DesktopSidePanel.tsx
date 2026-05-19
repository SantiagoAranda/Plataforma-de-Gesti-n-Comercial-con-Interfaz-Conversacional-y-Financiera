"use client";

import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

import { useDesktopSidePanel } from "@/src/components/layout/DesktopSidePanelContext";
import { HomeAgendaDetailsContent } from "@/src/components/home/HomeAgendaDetails";
import { getAgendaEventsForDate } from "@/src/lib/agenda/events";
import { useHomeModuleSummaries } from "@/src/lib/home/useHomeModuleSummaries";

export default function DesktopSidePanel({ children }: { children: ReactNode }) {
  const sidePanel = useDesktopSidePanel();
  const { orders } = useHomeModuleSummaries();

  if (sidePanel?.sidePanelView.type === "agenda-details") {
    const date = sidePanel.sidePanelView.date;
    const events = getAgendaEventsForDate(orders, date);

    return (
      <div className="h-full w-full bg-white">
        <div className="flex items-center gap-2 px-4 pt-4">
          <button
            onClick={sidePanel.closeSidePanel}
            className="grid h-10 w-10 place-items-center rounded-full text-neutral-700 hover:bg-black/5"
            aria-label="Volver"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        </div>

        <div className="h-[calc(100%-56px)]">
          <HomeAgendaDetailsContent date={date} events={events} />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
