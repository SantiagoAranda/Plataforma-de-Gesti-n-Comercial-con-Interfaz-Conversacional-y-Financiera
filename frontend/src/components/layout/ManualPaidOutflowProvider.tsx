"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import ManualPaidOutflowSheet from "@/src/components/home/ManualPaidOutflowSheet";

type ManualPaidOutflowContextValue = {
  openManualPaidOutflow: () => void;
};

const ManualPaidOutflowContext =
  createContext<ManualPaidOutflowContextValue | null>(null);

export function ManualPaidOutflowProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openManualPaidOutflow = useCallback(() => setOpen(true), []);
  const value = useMemo(
    () => ({ openManualPaidOutflow }),
    [openManualPaidOutflow],
  );

  return (
    <ManualPaidOutflowContext.Provider value={value}>
      {children}
      <ManualPaidOutflowSheet open={open} onOpenChange={setOpen} />
    </ManualPaidOutflowContext.Provider>
  );
}

export function useManualPaidOutflow() {
  const context = useContext(ManualPaidOutflowContext);
  if (!context) {
    throw new Error(
      "useManualPaidOutflow debe usarse dentro de ManualPaidOutflowProvider",
    );
  }
  return context;
}
