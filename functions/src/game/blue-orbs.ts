import { FieldValue, type DocumentReference, type Transaction } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";

/** Blue Orbs awarded to each participant when a match finishes. */
export const MATCH_COMPLETION_ORB_REWARD = 350;

export type OrbLedgerReason = "match-completion" | "local-match-completion";

export function userOrbLedgerRef(
  db: Firestore,
  uid: string,
  ledgerId: string,
): DocumentReference {
  return db.collection("users").doc(uid).collection("orbLedger").doc(ledgerId);
}

/**
 * Write a Blue Orbs grant inside an open transaction.
 * Caller must have already read `ledgerRef` and skip when it exists.
 */
export function writeBlueOrbsGrant(
  tx: Transaction,
  db: Firestore,
  uid: string,
  ledgerId: string,
  amount: number,
  meta: {
    reason: OrbLedgerReason;
    matchId?: string;
  },
): void {
  const userRef = db.collection("users").doc(uid);
  const ledgerRef = userOrbLedgerRef(db, uid, ledgerId);
  tx.set(
    userRef,
    {
      blueOrbs: FieldValue.increment(amount),
    },
    { merge: true },
  );
  tx.create(ledgerRef, {
    amount,
    reason: meta.reason,
    matchId: meta.matchId ?? null,
    createdAt: FieldValue.serverTimestamp(),
  });
}
