import { getServerByName } from "partyserver";
import { getContext } from "./context";

/** RPC stub for a user's synced-database Durable Object, the single writer for their data. */
export async function getUserDbStub(userId: string) {
  const env = getContext();
  return getServerByName(env.UserDbServer, `user-${userId}`, { locationHint: "weur" });
}
