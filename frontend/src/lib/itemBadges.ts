export type ItemBadge = { text: string; color: string };

type AnyItem = {
  badges?: Array<{ text?: string | null; color?: string | null }> | null;
  badgeText?: string | null;
  badgeColor?: string | null;
};

const DEFAULT_BADGE_COLOR = "#ef4444";

const normalizeBadgeText = (value?: string | null) => {
  const cleaned = (value ?? "").trim();
  return cleaned ? cleaned : null;
};

const normalizeBadgeColor = (value?: string | null) => {
  const cleaned = (value ?? "").trim();
  const isValidHex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(cleaned);
  return isValidHex ? cleaned : DEFAULT_BADGE_COLOR;
};

const isSameBadge = (a: ItemBadge, b: ItemBadge) => {
  return a.text.toUpperCase() === b.text.toUpperCase() && a.color.toLowerCase() === b.color.toLowerCase();
};

export function getItemBadges(item: AnyItem | null | undefined): ItemBadge[] {
  if (!item) return [];

  const result: ItemBadge[] = [];

  if (Array.isArray(item.badges)) {
    for (const badge of item.badges) {
      const text = normalizeBadgeText(badge?.text ?? null);
      if (!text) continue;
      result.push({
        text,
        color: normalizeBadgeColor(badge?.color ?? null),
      });
    }
  }

  const legacyText = normalizeBadgeText(item.badgeText ?? null);
  if (legacyText) {
    const legacyBadge: ItemBadge = {
      text: legacyText,
      color: normalizeBadgeColor(item.badgeColor ?? null),
    };
    if (!result.some((b) => isSameBadge(b, legacyBadge))) {
      result.unshift(legacyBadge);
    }
  }

  return result.slice(0, 2);
}

export function getContrastColor(hexColor?: string | null): string {
  if (!hexColor || !hexColor.startsWith('#')) return '#FFFFFF';
  const hex = hexColor.replace('#', '');
  if (hex.length !== 6 && hex.length !== 3) return '#FFFFFF';
  const r = parseInt(hex.length === 3 ? hex[0] + hex[0] : hex.substring(0, 2), 16);
  const g = parseInt(hex.length === 3 ? hex[1] + hex[1] : hex.substring(2, 4), 16);
  const b = parseInt(hex.length === 3 ? hex[2] + hex[2] : hex.substring(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? '#000000' : '#FFFFFF';
}

