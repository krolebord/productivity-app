// Print sign-in codes from the local D1, for e2e runs against `pnpm dev`.
//
//   pnpm e2e:code                    # latest codes: email, code, age
//   pnpm e2e:code e2e@example.com    # just the latest code for that email
//
// A code is deleted once used, so request a new one per sign-in.
import { execFileSync } from "node:child_process";

const email = process.argv[2];
const sql = email
  ? `SELECT target, value, createdAt FROM verification WHERE target = '${email.replaceAll("'", "''")}' ORDER BY createdAt DESC LIMIT 1`
  : "SELECT target, value, createdAt FROM verification ORDER BY createdAt DESC LIMIT 5";

let output;
try {
  output = execFileSync("wrangler", ["d1", "execute", "productivity-db", "--local", "--json", "--command", sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
} catch (error) {
  process.stderr.write(error.stderr || error.message);
  process.exit(1);
}

const rows = JSON.parse(output)[0]?.results ?? [];
if (email) {
  if (!rows.length) {
    console.error(`No code for ${email}. Request one first; used codes are deleted.`);
    process.exit(1);
  }
  console.log(rows[0].value);
} else if (!rows.length) {
  console.error("No sign-in codes yet.");
  process.exit(1);
} else {
  for (const row of rows) {
    const seconds = Math.round((Date.now() - new Date(row.createdAt).getTime()) / 1000);
    console.log(`${row.target}\t${row.value}\t${seconds}s ago`);
  }
}
