-- Migration number: 0002 	 2026-06-18T00:00:00.000Z
alter table "user" add column "role" text not null default 'user';
