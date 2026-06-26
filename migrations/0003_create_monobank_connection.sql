-- Migration number: 0003 	 2026-06-26T00:00:00.000Z
create table "monobank_connection" (
  "id" text primary key,
  "userId" text not null unique references "user" ("id") on delete cascade,
  "token" text not null,
  "webhookSecret" text not null,
  "status" text not null default 'connected',
  "webhookStatus" text not null default 'pending',
  "lastValidatedAt" text,
  "lastWebhookSetAt" text,
  "lastError" text,
  "createdAt" text not null,
  "updatedAt" text not null,
  "disconnectedAt" text
);
