/**
 * One-time production backfill: grant one sealed Rock Starter Tin to every
 * existing Auth account that does not already have users/{uid}/packInventory/starter-rock-tin.
 *
 * Usage (from functions/):
 *   node scripts/backfill-starter-tins.mjs
 *
 * Requires Application Default Credentials with access to project master-of-cards
 * (e.g. `gcloud auth application-default login`).
 */

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const PROJECT_ID = "master-of-cards";
const STARTER_TIN_DOC_ID = "starter-rock-tin";
const STARTER_TIN_PACK_ID = "rock-starter-tin";

initializeApp({
  credential: applicationDefault(),
  projectId: PROJECT_ID,
});

const auth = getAuth();
const db = getFirestore();

async function grantStarterTin(uid) {
  const packRef = db
    .collection("users")
    .doc(uid)
    .collection("packInventory")
    .doc(STARTER_TIN_DOC_ID);

  try {
    await packRef.create({
      packId: STARTER_TIN_PACK_ID,
      status: "sealed",
      source: "starter-grant-backfill",
      acquiredAt: FieldValue.serverTimestamp(),
    });
    return "granted";
  } catch (error) {
    const code = error?.code;
    // Already exists (create() conflict) — treat as skip.
    if (code === 6 || code === "already-exists") {
      return "skipped";
    }
    throw error;
  }
}

async function main() {
  let pageToken;
  let scanned = 0;
  let granted = 0;
  let skipped = 0;
  let failed = 0;

  console.log(`[backfill] Starting starter tin grant for project ${PROJECT_ID}…`);

  do {
    const result = await auth.listUsers(1000, pageToken);
    for (const user of result.users) {
      scanned += 1;
      try {
        const outcome = await grantStarterTin(user.uid);
        if (outcome === "granted") {
          granted += 1;
          console.log(`[backfill] granted → ${user.uid} (${user.email ?? "no-email"})`);
        } else {
          skipped += 1;
        }
      } catch (error) {
        failed += 1;
        console.error(`[backfill] FAILED ${user.uid}:`, error?.message ?? error);
      }
    }
    pageToken = result.pageToken;
  } while (pageToken);

  console.log("[backfill] Done.");
  console.log(
    JSON.stringify({ scanned, granted, skipped, failed }, null, 2),
  );

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("[backfill] Fatal:", error);
  process.exit(1);
});
