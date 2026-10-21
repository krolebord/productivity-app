import { randomInt } from "node:crypto";
import { getContext } from "@/lib/context";
import { db } from "@/lib/db";
import { emailService } from "@/lib/emails/emails";

const CODE_TTL_MS = 20 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export async function sendSignInCode(email: string) {
  await deleteSignInCodes(email);

  const otp = randomInt(100000, 999999).toString();

  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
  const createdAt = new Date().toISOString();

  await db
    .insertInto("verification")
    .values({
      target: email,
      value: otp,
      expiresAt,
      createdAt,
    })
    .execute();

  const context = getContext();
  const magicLink = `${context.VITE_APP_URL}/magic-link-verify?email=${encodeURIComponent(email)}&code=${otp}`;

  await emailService.sendMagicLinkEmail({
    to: email,
    link: magicLink,
    code: otp,
  });
}

export type ConsumeSignInCodeResult = { success: true } | { success: false; error: string };

// The attempt is spent before the code is compared, so concurrent guesses can't exceed MAX_ATTEMPTS.
export async function consumeSignInCode(email: string, code: string): Promise<ConsumeSignInCodeResult> {
  const verification = await db
    .updateTable("verification")
    .set((eb) => ({ attempts: eb("attempts", "+", 1) }))
    .where("target", "=", email)
    .where("attempts", "<", MAX_ATTEMPTS)
    .returning(["value", "expiresAt", "attempts"])
    .executeTakeFirst();

  if (!verification) {
    return { success: false, error: "Invalid verification code" };
  }

  if (new Date(verification.expiresAt) < new Date()) {
    await deleteSignInCodes(email);
    return { success: false, error: "Verification code has expired" };
  }

  if (verification.value !== code) {
    if (verification.attempts >= MAX_ATTEMPTS) {
      await deleteSignInCodes(email);
      return { success: false, error: "Too many attempts. Request a new code." };
    }
    return { success: false, error: "Invalid verification code" };
  }

  await deleteSignInCodes(email);
  return { success: true };
}

async function deleteSignInCodes(email: string) {
  await db.deleteFrom("verification").where("target", "=", email).execute();
}
