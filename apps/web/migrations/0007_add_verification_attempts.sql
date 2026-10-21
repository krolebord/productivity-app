-- Migration number: 0007 	 2026-10-20T00:00:00.000Z
alter table "verification" add column "attempts" integer not null default 0;
