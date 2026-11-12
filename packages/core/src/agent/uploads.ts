export const MAX_UPLOAD_FILES = 10;
// Uploads reach the assistant's Durable Object in one RPC call, which Cloudflare caps at 32 MiB.
export const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;

export function uploadTotalBytes(files: readonly { size: number }[]): number {
  let total = 0;
  for (const file of files) total += file.size;
  return total;
}
