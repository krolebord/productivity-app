import { db } from "@/lib/db";

export function getMonobankConnectionByUserId(userId: string) {
  return db.selectFrom("monobank_connection").selectAll().where("userId", "=", userId).executeTakeFirst();
}

export function getMonobankConnectionById(id: string) {
  return db.selectFrom("monobank_connection").selectAll().where("id", "=", id).executeTakeFirst();
}
