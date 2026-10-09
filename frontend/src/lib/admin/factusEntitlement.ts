export type AdminFactus = {
  enabled: boolean;
  configured: boolean;
  environment: "sandbox" | "production";
};

// The synchronous lock also covers clicks before React commits the disabled state.
export async function saveFactusEntitlement({
  lock, businessId, enabled, request, onSaving, onSuccess, onError,
}: {
  lock: { current: boolean };
  businessId: string;
  enabled: boolean;
  request: (path: string, options: RequestInit) => Promise<{ factus: AdminFactus }>;
  onSaving: (saving: boolean) => void;
  onSuccess: (factus: AdminFactus) => void;
  onError: (error: unknown) => void;
}) {
  if (lock.current) return;
  lock.current = true;
  onSaving(true);
  try {
    const result = await request(`/businesses/admin/${encodeURIComponent(businessId)}/factus`, {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    });
    onSuccess(result.factus);
  } catch (error) {
    onError(error);
  } finally {
    lock.current = false;
    onSaving(false);
  }
}
