import { Buffer } from "node:buffer";

const LEGACY_TABLE = "cf_workspace_default";

type LegacyEntry = {
  path: string;
  type: "file" | "directory" | "symlink";
  storage_backend: "inline" | "r2";
};

type LegacyContent = {
  content_encoding: "utf8" | "base64";
  content: string | null;
};

type TargetFs = {
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  writeFile(path: string, content: string | Uint8Array): Promise<void>;
};

function parentDir(path: string) {
  return path.slice(0, path.lastIndexOf("/")) || "/";
}

// Think 0.18+ keeps workspace files in @cloudflare/computer's tables and does not move the ones
// @cloudflare/shell wrote. Copies them to the same paths so stored upload/download paths keep
// resolving, then drops the old table; a failed copy leaves it in place to retry on next start.
export async function copyLegacyShellWorkspace(sql: SqlStorage, fs: TargetFs): Promise<number> {
  const exists = sql.exec("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", LEGACY_TABLE).toArray();
  if (exists.length === 0) return 0;

  let copied = 0;
  const entries = sql
    .exec<LegacyEntry>(`SELECT path, type, storage_backend FROM ${LEGACY_TABLE} ORDER BY path`)
    .toArray();
  for (const entry of entries) {
    if (entry.path === "/") continue;
    if (entry.type === "directory") {
      await fs.mkdir(entry.path, { recursive: true });
      continue;
    }
    if (entry.type !== "file" || entry.storage_backend !== "inline") {
      console.warn(`Skipping legacy workspace entry ${entry.path} (${entry.type}, ${entry.storage_backend})`);
      continue;
    }
    const { content_encoding, content } = sql
      .exec<LegacyContent>(`SELECT content_encoding, content FROM ${LEGACY_TABLE} WHERE path = ?`, entry.path)
      .one();
    await fs.mkdir(parentDir(entry.path), { recursive: true });
    await fs.writeFile(
      entry.path,
      content_encoding === "base64" ? new Uint8Array(Buffer.from(content ?? "", "base64")) : (content ?? ""),
    );
    copied++;
  }

  sql.exec(`DROP TABLE ${LEGACY_TABLE}`);
  return copied;
}
