"use client";

import AppHeader from "@/src/components/layout/AppHeader";
import BottomNav from "@/src/components/layout/BottomNav";
import ThreadList from "@/src/components/chat/ThreadList";

export default function HomePage() {
  return (
    <div className="flex flex-col h-screen bg-white">
      <AppHeader title="MVP" />

      <main className="flex-1 overflow-y-auto">
        <ThreadList />
      </main>

      <BottomNav active="home" />
    </div>
  );
}
