export type OperationalItemType = "PRODUCT" | "SERVICE";

export type AgendaLine = {
  itemId: string;
  itemType?: OperationalItemType | null;
  durationMin?: number | null;
};

export function resolveAgendaLineType(
  line: AgendaLine,
  catalog: ReadonlyArray<{ id: string; type: OperationalItemType }>,
) {
  return line.itemType ?? catalog.find((item) => item.id === line.itemId)?.type;
}

export function requiresServiceAgenda(
  line: AgendaLine | undefined,
  catalog: ReadonlyArray<{ id: string; type: OperationalItemType }>,
) {
  return !!line && resolveAgendaLineType(line, catalog) === "SERVICE";
}

export function buildLocalScheduledAt(
  date: string | null,
  startMinute: number | null,
) {
  if (!date || startMinute == null) return undefined;
  const hour = String(Math.floor(startMinute / 60)).padStart(2, "0");
  const minute = String(startMinute % 60).padStart(2, "0");
  return `${date}T${hour}:${minute}:00`;
}

export function agendaPayloadForLine(input: {
  requiresAgenda: boolean;
  date: string | null;
  startMinute: number | null;
  durationMinutes: number | null | undefined;
}) {
  if (!input.requiresAgenda) return {};
  const scheduledAt = buildLocalScheduledAt(input.date, input.startMinute);
  return {
    scheduledAt,
    durationMinutes: input.durationMinutes,
  };
}
