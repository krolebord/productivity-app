export const MAX_UPLOAD_FILES = 5;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export function uploadTotalBytes(files: readonly { size: number }[]): number {
  let total = 0;
  for (const file of files) total += file.size;
  return total;
}
