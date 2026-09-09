import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { onCall, HttpsError } from "firebase-functions/v2/https";

initializeApp();

const db = getFirestore();

type MatchPlayer = {
  uid: string;
  username: string;
};

type MatchDoc = {
  player1: MatchPlayer;
  player2: MatchPlayer;
  status: string;
  currentTurn?: number;
  actionSeq?: number;
};

type SubmitMatchActionRequest = {
  matchId?: string;
  type?: string;
};

/**
 * Action Sync entry point.
 * Clients send intents here; only Admin SDK writes authoritative match actions.
 */
export const submitMatchAction = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in to submit a match action.");
  }

  const uid = request.auth.uid;
  const data = (request.data ?? {}) as SubmitMatchActionRequest;
  const matchId = typeof data.matchId === "string" ? data.matchId.trim() : "";
  const type = typeof data.type === "string" ? data.type.trim() : "";

  if (!matchId) {
    throw new HttpsError("invalid-argument", "matchId is required.");
  }
  if (type !== "endTurn") {
    throw new HttpsError(
      "invalid-argument",
      "Only endTurn is supported in this slice.",
    );
  }

  const matchRef = db.collection("matches").doc(matchId);

  const result = await db.runTransaction(async (tx) => {
    const matchSnap = await tx.get(matchRef);
    if (!matchSnap.exists) {
      throw new HttpsError("not-found", "Match not found.");
    }

    const match = matchSnap.data() as MatchDoc;
    if (match.status !== "active") {
      throw new HttpsError("failed-precondition", "Match is not active.");
    }

    const isP1 = match.player1?.uid === uid;
    const isP2 = match.player2?.uid === uid;
    if (!isP1 && !isP2) {
      throw new HttpsError(
        "permission-denied",
        "You are not a participant in this match.",
      );
    }

    const currentTurn = match.currentTurn === 2 ? 2 : 1;
    const callerSeat = isP1 ? 1 : 2;
    if (callerSeat !== currentTurn) {
      throw new HttpsError(
        "failed-precondition",
        "It is not your turn to end the turn.",
      );
    }

    const nextSeq = (match.actionSeq ?? 0) + 1;
    const nextTurn = currentTurn === 1 ? 2 : 1;
    const actionRef = matchRef.collection("actions").doc(String(nextSeq));

    tx.set(actionRef, {
      seq: nextSeq,
      type: "endTurn",
      byUid: uid,
      fromTurn: currentTurn,
      toTurn: nextTurn,
      createdAt: FieldValue.serverTimestamp(),
    });

    tx.update(matchRef, {
      currentTurn: nextTurn,
      actionSeq: nextSeq,
    });

    return { seq: nextSeq, currentTurn: nextTurn };
  });

  logger.info("endTurn applied", { matchId, uid, ...result });
  return result;
});
