"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import { createPortal } from "react-dom";

type NotificationType = "success" | "error" | "info" | "warning";

type Notification = {
  id: number;
  type: NotificationType;
  message: string;
};

type NotificationContextType = {
  notify: (n: Omit<Notification, "id">) => void;
};

const NotificationContext = createContext<NotificationContextType | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const notify = ({ type, message }: Omit<Notification, "id">) => {
    const id = Date.now();

    setNotifications((prev) => [...prev, { id, type, message }]);

    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 3000);
  };

  return (
    <NotificationContext.Provider value={{ notify }}>
      {children}

      {createPortal(
        <div className="fixed top-5 right-5 z-[999999] space-y-3">
          {notifications.map((n) => (
            <Toast key={n.id} {...n} />
          ))}
        </div>,
        document.body
      )}
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotification must be used inside NotificationProvider");
  return ctx;
}

/* ================= TOAST ================= */

function Toast({ type, message }: Notification) {
  const base =
    "px-4 py-3 rounded-xl shadow-lg text-sm font-medium animate-slideIn";

  const styles = {
    success: "bg-emerald-600 text-white",
    error: "bg-red-600 text-white",
    info: "bg-blue-600 text-white",
    warning: "bg-yellow-500 text-black",
  };

  return <div className={`${base} ${styles[type]}`}>{message}</div>;
}