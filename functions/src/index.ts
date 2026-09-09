import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import {
  applyEndTurnToLiveGameState,
  applyPlayCardToLiveGameState,
  createInitialLiveGameState,
  stripUndefinedDeep,
  type LiveGameState,
  type PlayCardIntent,
} from "./game/live-game-state";

initializeApp();

const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });

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

function seatToSlot(seat: 1 | 2): "player1" | "player2" {
  return seat === 1 ? "player1" : "player2";
}

/**
 * Creates the shared board once per match (idempotent).
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

    const initial = stripUndefinedDeep(createInitialLiveGameState());
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
  cardId?: string;
  handIndex?: number;
  fieldSlot?: number;
  targetRowSlot?: "player1" | "player2";
  influencedSpaces?: number[];
};

/**
 * Action Sync entry point for endTurn + playCard.
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
  if (type !== "endTurn" && type !== "playCard") {
    throw new HttpsError(
      "invalid-argument",
      "Supported actions: endTurn, playCard.",
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
      throw new HttpsError("failed-precondition", "It is not your turn.");
    }

    let nextState: LiveGameState;
    let actionPayload: Record<string, unknown>;

    if (type === "endTurn") {
      nextState = applyEndTurnToLiveGameState(match.gameState);
      actionPayload = {
        type: "endTurn",
        fromTurn: currentTurn,
        toTurn: nextState.currentTurn,
      };
    } else {
      const cardId = typeof data.cardId === "string" ? data.cardId : "";
      const handIndex =
        typeof data.handIndex === "number" ? data.handIndex : -1;
      if (!cardId || handIndex < 0) {
        throw new HttpsError(
          "invalid-argument",
          "playCard requires cardId and handIndex.",
        );
      }

      let intent: PlayCardIntent;
      if (typeof data.fieldSlot === "number") {
        intent = {
          cardKind: "Monster",
          cardId,
          handIndex,
          fieldSlot: data.fieldSlot,
        };
      } else if (
        (data.targetRowSlot === "player1" || data.targetRowSlot === "player2") &&
        Array.isArray(data.influencedSpaces)
      ) {
        intent = {
          cardKind: "Land",
          cardId,
          handIndex,
          targetRowSlot: data.targetRowSlot,
          influencedSpaces: data.influencedSpaces.filter(
            (n): n is number => typeof n === "number",
          ),
        };
      } else {
        throw new HttpsError(
          "invalid-argument",
          "playCard requires fieldSlot (monster) or targetRowSlot + influencedSpaces (land).",
        );
      }

      const applied = applyPlayCardToLiveGameState(
        match.gameState,
        seatToSlot(callerSeat),
        intent,
      );
      if (!applied) {
        throw new HttpsError("failed-precondition", "Illegal playCard move.");
      }
      nextState = applied;
      actionPayload = { type: "playCard", ...intent };
    }

    const nextSeq = (match.actionSeq ?? 0) + 1;
    const actionRef = matchRef.collection("actions").doc(String(nextSeq));

    tx.set(actionRef, {
      seq: nextSeq,
      byUid: uid,
      createdAt: FieldValue.serverTimestamp(),
      ...actionPayload,
    });

    tx.update(matchRef, {
      currentTurn: nextState.currentTurn,
      actionSeq: nextSeq,
      gameState: stripUndefinedDeep(nextState),
    });

    return {
      seq: nextSeq,
      currentTurn: nextState.currentTurn,
      version: nextState.version,
      type,
    };
  });

  logger.info("submitMatchAction applied", { matchId, uid, ...result });
  return result;
});
