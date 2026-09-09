import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import {
  applyEndTurnToLiveGameState,
  createInitialLiveGameState,
  type LiveGameState,
} from "./game/live-game-state";

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
  gameState?: LiveGameState;
};

function assertParticipant(match: MatchDoc, uid: string): 1 | 2 {
  if (match.player1?.uid === uid) {
    return 1;
  }
  if (match.player2?.uid === uid) {
    return 2;
  }
  throw new HttpsError(
    "permission-denied",
    "You are not a participant in this match.",
  );
}

/**
 * Creates the shared board once per match (idempotent).
 * Both clients should call this after matchmaking; only the first write wins.
 */
export const initializeLiveMatch = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in to initialize a match.");
  }

  const uid = request.auth.uid;
  const matchId =
    typeof request.data?.matchId === "string" ? request.data.matchId.trim() : "";
  if (!matchId) {
    throw new HttpsError("invalid-argument", "matchId is required.");
  }

  const matchRef = db.collection("matches").doc(matchId);

  const gameState = await db.runTransaction(async (tx) => {
    const matchSnap = await tx.get(matchRef);
    if (!matchSnap.exists) {
      throw new HttpsError("not-found", "Match not found.");
    }

    const match = matchSnap.data() as MatchDoc;
    assertParticipant(match, uid);

    if (match.gameState?.gameStarted) {
      return match.gameState;
    }

    const initial = createInitialLiveGameState();
    tx.update(matchRef, {
      gameState: initial,
      currentTurn: initial.currentTurn,
      actionSeq: 0,
    });
    return initial;
  });

  logger.info("initializeLiveMatch", { matchId, uid, version: gameState.version });
  return { ok: true, version: gameState.version };
});

type SubmitMatchActionRequest = {
  matchId?: string;
  type?: string;
};

/**
 * Action Sync entry point.
 * Clients send intents here; only Admin SDK writes authoritative match actions + gameState.
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

    const callerSeat = assertParticipant(match, uid);
    if (!match.gameState?.gameStarted) {
      throw new HttpsError(
        "failed-precondition",
        "Match game state is not initialized.",
      );
    }

    const currentTurn = match.gameState.currentTurn === 2 ? 2 : 1;
    if (callerSeat !== currentTurn) {
      throw new HttpsError(
        "failed-precondition",
        "It is not your turn to end the turn.",
      );
    }

    const nextState = applyEndTurnToLiveGameState(match.gameState);
    const nextSeq = (match.actionSeq ?? 0) + 1;
    const actionRef = matchRef.collection("actions").doc(String(nextSeq));

    tx.set(actionRef, {
      seq: nextSeq,
      type: "endTurn",
      byUid: uid,
      fromTurn: currentTurn,
      toTurn: nextState.currentTurn,
      createdAt: FieldValue.serverTimestamp(),
    });

    tx.update(matchRef, {
      currentTurn: nextState.currentTurn,
      actionSeq: nextSeq,
      gameState: nextState,
    });

    return { seq: nextSeq, currentTurn: nextState.currentTurn, version: nextState.version };
  });

  logger.info("endTurn applied", { matchId, uid, ...result });
  return result;
});
