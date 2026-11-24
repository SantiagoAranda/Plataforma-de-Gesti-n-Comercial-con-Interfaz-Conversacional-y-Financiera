/** Legacy catalog responses without this field retain their scheduled behavior. */
export function requiresItemAppointment(item: { type?: string; requiresAppointment?: boolean }) {
  return item.type === "SERVICE" && item.requiresAppointment !== false;
}
