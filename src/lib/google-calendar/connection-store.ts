import { db } from "@/lib/db";

/**
 * Active Google Calendar connections for a user. The schema allows several (one per Google
 * account); the v1 UI only ever creates one.
 */
export function getGoogleCalendarConnectionsByUserId(userId: string) {
  return db
    .selectFrom("google_calendar_connection")
    .selectAll()
    .where("userId", "=", userId)
    .where("status", "!=", "disconnected")
    .execute();
}

export function getGoogleCalendarConnectionById(id: string) {
  return db.selectFrom("google_calendar_connection").selectAll().where("id", "=", id).executeTakeFirst();
}

export function getGoogleCalendarConnectionByGoogleUser(userId: string, googleUserId: string) {
  return db
    .selectFrom("google_calendar_connection")
    .selectAll()
    .where("userId", "=", userId)
    .where("googleUserId", "=", googleUserId)
    .executeTakeFirst();
}
