/**
 * Push local .data/petrafi-db.json to the deployed Cloudflare Worker (remote D1).
 *
 * Usage:
 *   npx tsx scripts/push-db-to-remote.ts https://petrafi-inspiration-demo-x7k2p9q4.kperez.workers.dev
 *
 * Or set DEPLOY_URL in the environment.
 */
import { promises as fs } from "fs";
import path from "path";

const OUT_FILE = path.join(process.cwd(), ".data", "petrafi-db.json");

async function main() {
  const base =
    process.argv[2] ??
    process.env.DEPLOY_URL ??
    process.env.NEXT_PUBLIC_DEPLOY_URL;
  if (!base?.trim()) {
    console.error(
      "Usage: npx tsx scripts/push-db-to-remote.ts <workers.dev URL>\n" +
        "Example: npx tsx scripts/push-db-to-remote.ts https://petrafi-inspiration-demo-x7k2p9q4.kperez.workers.dev"
    );
    process.exit(1);
  }

  const url = `${base.replace(/\/$/, "")}/api/db`;
  let raw: string;
  try {
    raw = await fs.readFile(OUT_FILE, "utf-8");
  } catch {
    console.error(`Missing ${OUT_FILE}. Run npm run import:atpb first.`);
    process.exit(1);
  }

  const db = JSON.parse(raw) as {
    vendors?: unknown[];
    contractors?: unknown[];
    haulRates?: unknown[];
  };

  console.log("Pushing local DB to:", url);
  console.log(
    `  vendors: ${db.vendors?.length ?? 0}, contractors: ${db.contractors?.length ?? 0}, haul rates: ${db.haulRates?.length ?? 0}`
  );

  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: raw,
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    console.error(`Push failed (${res.status}):`, err || res.statusText);
    process.exit(1);
  }

  console.log("Push complete. Refresh the hosted app to see vendors and contractors.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
