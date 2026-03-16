export const MAX_ITEM_IMAGES = 5;
export const MAX_ITEM_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

export function formatBytesToMb(bytes: number) {
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
}
