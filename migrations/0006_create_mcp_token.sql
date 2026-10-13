-- Migration number: 0006 	 2026-10-13T00:00:00.000Z
create table "mcp_token" (
  "id" text primary key,
  "userId" text not null references "user" ("id") on delete cascade,
  "name" text not null,
  "tokenHash" text not null unique,
  "access" text not null default 'read',
  "createdAt" text not null,
  "lastUsedAt" text
);

create index "mcp_token_user" on "mcp_token" ("userId");
