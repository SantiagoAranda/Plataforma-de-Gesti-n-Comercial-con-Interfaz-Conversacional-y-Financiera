"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import type { PublicItemOptionGroup } from "@/src/types/item";

export type OptionSelection = {
  groupId: string;
  optionId: string;
  action: "SELECT" | "ADD" | "REMOVE";
};

type SelectableItem = {
  id: string;
  name: string;
  price: number;
  optionGroups?: PublicItemOptionGroup[];
};

function selectedIdsFromSelections(
  item: SelectableItem,
  selections: OptionSelection[],
) {
  const selected = new Set(
    (item.optionGroups ?? []).flatMap((group) =>
      group.options
        .filter((option) => option.selectedByDefault)
        .map((option) => option.id),
    ),
  );
  for (const selection of selections) {
    if (selection.action === "REMOVE") selected.delete(selection.optionId);
    else selected.add(selection.optionId);
  }
  return selected;
}

function selectionsFromSelectedIds(item: SelectableItem, selected: Set<string>) {
  const result: OptionSelection[] = [];
  for (const group of item.optionGroups ?? []) {
    for (const option of group.options) {
      const active = selected.has(option.id);
      if (active && !option.selectedByDefault) {
        result.push({ groupId: group.id, optionId: option.id, action: "ADD" });
      } else if (!active && option.selectedByDefault) {
        result.push({ groupId: group.id, optionId: option.id, action: "REMOVE" });
      }
    }
  }
  return result.sort((a, b) =>
    `${a.groupId}:${a.optionId}:${a.action}`.localeCompare(
      `${b.groupId}:${b.optionId}:${b.action}`,
    ),
  );
}

export default function ProductOptionSelector({
  item,
  quantity,
  initialSelections = [],
  onClose,
  onConfirm,
}: {
  item: SelectableItem;
  quantity: number;
  initialSelections?: OptionSelection[];
  onClose: () => void;
  onConfirm: (result: {
    optionSelections: OptionSelection[];
    optionNames: string[];
    unitPrice: number;
  }) => void;
}) {
  const [selectedIds, setSelectedIds] = useState(
    () => selectedIdsFromSelections(item, initialSelections),
  );
  const selectedOptions = useMemo(
    () =>
      (item.optionGroups ?? []).flatMap((group) =>
        group.options
          .filter((option) => selectedIds.has(option.id))
          .map((option) => ({ ...option, groupTitle: group.title })),
      ),
    [item.optionGroups, selectedIds],
  );
  const unitPrice =
    Number(item.price) +
    selectedOptions.reduce(
      (sum, option) => sum + Number(option.priceDelta ?? 0),
      0,
    );

  const toggle = (group: PublicItemOptionGroup, optionId: string) => {
    const option = group.options.find((entry) => entry.id === optionId);
    if (!option) return;
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(optionId)) {
        if (option.selectedByDefault && !option.removable) return current;
        next.delete(optionId);
      } else {
        if (group.maxSelections === 1) {
          group.options.forEach((entry) => next.delete(entry.id));
        }
        next.add(optionId);
      }
      return next;
    });
  };

  const valid = (item.optionGroups ?? []).every((group) => {
    const count = group.options.filter((option) => selectedIds.has(option.id)).length;
    const minimum = Math.max(group.required ? 1 : 0, group.minSelections);
    return count >= minimum && (group.maxSelections == null || count <= group.maxSelections);
  });

  return (
    <div className="fixed inset-0 z-[10000] flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="relative max-h-[85vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl">
        <button type="button" onClick={onClose} className="absolute right-4 top-4 p-2 text-neutral-400">
          <X size={18} />
        </button>
        <h3 className="pr-10 text-lg font-semibold text-neutral-900">{item.name}</h3>
        <p className="mt-1 text-xs text-neutral-500">Configura las opciones del producto.</p>

        <div className="mt-5 space-y-4">
          {(item.optionGroups ?? []).map((group) => (
            <section key={group.id}>
              <div className="mb-2 text-xs font-semibold text-neutral-700">
                {group.title}{group.required ? " *" : ""}
              </div>
              <div className="space-y-2">
                {group.options.map((option) => (
                  <label key={option.id} className="flex cursor-pointer items-center justify-between rounded-xl border border-neutral-200 p-3">
                    <span>
                      <span className="block text-sm font-medium text-neutral-800">{option.name}</span>
                      {Number(option.priceDelta) !== 0 && (
                        <span className="text-xs text-emerald-600">+${Number(option.priceDelta).toLocaleString("es-CO")}</span>
                      )}
                    </span>
                    <input
                      type={group.maxSelections === 1 ? "radio" : "checkbox"}
                      name={group.id}
                      checked={selectedIds.has(option.id)}
                      onChange={() => toggle(group, option.id)}
                    />
                  </label>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between border-t pt-4">
          <span className="text-sm text-neutral-500">Total x{quantity}</span>
          <strong>${(unitPrice * quantity).toLocaleString("es-CO")}</strong>
        </div>
        <button
          type="button"
          disabled={!valid}
          onClick={() =>
            onConfirm({
              optionSelections: selectionsFromSelectedIds(item, selectedIds),
              optionNames: selectedOptions.map(
                (option) => `${option.groupTitle}: ${option.name}`,
              ),
              unitPrice,
            })
          }
          className="mt-4 h-12 w-full rounded-xl bg-emerald-600 text-sm font-semibold text-white disabled:opacity-40"
        >
          Guardar configuración
        </button>
      </div>
    </div>
  );
}
