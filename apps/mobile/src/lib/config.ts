export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "https://productivity.krolebord.com").replace(/\/+$/, "");

export function userDbSyncUrl(userId: string) {
  return `${API_URL.replace(/^http/, "ws")}/user-db/user-db-server/user-${userId}`;
}
