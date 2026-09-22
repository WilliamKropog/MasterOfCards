import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import {
  applyAttackToLiveGameState,
  applyCastSpellToLiveGameState,
  applyDefendToLiveGameState,
  applyEndTurnToLiveGameState,
  applyPlayCardToLiveGameState,
  applyUseAbilityToLiveGameState,
  createInitialLiveGameState,
  stripUndefinedDeep,
  type AttackIntent,
  type CastSpellIntent,
  type LiveGameState,
  type PlayCardIntent,
  type UseAbilityIntent,
} from "./game/live-game-state";
import { PACK_SIZE, generatePackCards } from "./game/pack-open";
import { LIVE_CARD_RULES } from "./game/card-rules";

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
 * Loads a user's active constructed deck as catalog card ids (match draw order source).
 * Validates min weight and that every owned instance resolves to known rules.
 */
async function loadActiveCatalogDeck(uid: string): Promise<string[]> {
  const decksSnap = await db.collection("users").doc(uid).collection("decks").get();
  const activeDoc = decksSnap.docs.find((snap) => snap.data()?.isActiveDeck === true);
  if (!activeDoc) {
    throw new HttpsError(
      "failed-precondition",
      "Both players need a saved active deck to start a live match.",
    );
  }

  const ownedCardIdsRaw = activeDoc.data()?.ownedCardIds;
  if (!Array.isArray(ownedCardIdsRaw) || ownedCardIdsRaw.length === 0) {
    throw new HttpsError(
      "failed-precondition",
      "Active deck is empty. Save a deck with at least 100 weight.",
    );
  }

  const ownedCardIds = ownedCardIdsRaw.filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );
  if (ownedCardIds.length === 0) {
    throw new HttpsError(
      "failed-precondition",
      "Active deck is empty. Save a deck with at least 100 weight.",
    );
  }

  const collectionRef = db.collection("users").doc(uid).collection("cardCollection");
  const catalogIds: string[] = [];
  let totalWeight = 0;

  // Firestore getAll is safest in chunks.
  const chunkSize = 100;
  for (let i = 0; i < ownedCardIds.length; i += chunkSize) {
    const chunk = ownedCardIds.slice(i, i + chunkSize);
    const refs = chunk.map((id) => collectionRef.doc(id));
    const snaps = await db.getAll(...refs);
    for (let j = 0; j < snaps.length; j++) {
      const cardSnap = snaps[j]!;
      const ownedCardId = chunk[j]!;
      if (!cardSnap.exists) {
        throw new HttpsError(
          "failed-precondition",
          `Owned card missing from collection: ${ownedCardId}`,
        );
      }
      const catalogCardId = cardSnap.data()?.catalogCardId;
      if (typeof catalogCardId !== "string" || !catalogCardId) {
        throw new HttpsError(
          "failed-precondition",
          `Owned card ${ownedCardId} has no catalogCardId.`,
        );
      }
      const rules = LIVE_CARD_RULES[catalogCardId];
      if (!rules) {
        throw new HttpsError(
          "failed-precondition",
          `Unknown catalog card in deck: ${catalogCardId}`,
        );
      }
      catalogIds.push(catalogCardId);
      totalWeight += rules.weight;
    }
  }

  if (totalWeight < MIN_LIVE_DECK_WEIGHT) {
    throw new HttpsError(
      "failed-precondition",
      `Active deck needs at least ${MIN_LIVE_DECK_WEIGHT} weight (currently ${totalWeight}).`,
    );
  }

  if (totalWeight > MAX_DECK_WEIGHT) {
    throw new HttpsError(
      "failed-precondition",
      `Active deck exceeds the maximum of ${MAX_DECK_WEIGHT} weight.`,
    );
  }

  return catalogIds;
}

/** Shared options for Gen2 callables used by the web client. */
const callableOptions = {
  region: "us-central1",
  // Required so browsers can reach Gen2 (Cloud Run) callables; Auth is still enforced in-handler.
  invoker: "public" as const,
  cors: true,
};

/**
 * Prototype pack open: mints 5 random owned cards into users/{uid}/cardCollection.
 * Clients may read the subcollection; only Admin/Cloud Functions may write.
 */
export const openTestPack = onCall(callableOptions, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in to open a pack.");
  }

  const uid = request.auth.uid;
  const drafts = generatePackCards(PACK_SIZE, "test-pack");

  for (const draft of drafts) {
    if (!LIVE_CARD_RULES[draft.catalogCardId]) {
      throw new HttpsError(
        "internal",
        `Invalid catalog card id rolled: ${draft.catalogCardId}`,
      );
    }
  }

  const collectionRef = db.collection("users").doc(uid).collection("cardCollection");
  const batch = db.batch();
  const created = drafts.map((draft) => {
    const docRef = collectionRef.doc();
    const payload = {
      ...draft,
      acquiredAt: FieldValue.serverTimestamp(),
    };
    batch.set(docRef, payload);
    return {
      ownedCardId: docRef.id,
      catalogCardId: draft.catalogCardId,
      cardQuality: draft.cardQuality,
      specialty: draft.specialty,
      foil: draft.foil,
      skin: draft.skin,
      source: draft.source,
    };
  });

  await batch.commit();

  logger.info("openTestPack", {
    uid,
    count: created.length,
    catalogCardIds: created.map((c) => c.catalogCardId),
  });

  return {
    ok: true,
    packSize: created.length,
    cards: created,
  };
});

const DECK_KEYS = new Set(["deck-1", "deck-2", "deck-3"]);
/** Max total catalog weight for a constructed deck (matches client DECK_WEIGHT_CAPACITY). */
const MAX_DECK_WEIGHT = 200;
/** Absolute ceiling on card instances (all weight-1 cards). */
const MAX_DECK_CARD_COUNT = MAX_DECK_WEIGHT;
/** Minimum active-deck weight required to enter / start a live match. */
const MIN_LIVE_DECK_WEIGHT = 100;

type DeckKey = "deck-1" | "deck-2" | "deck-3";

/**
 * Saves a user deck under users/{uid}/decks/{deckKey}.
 * Assigns owned cards' deckId to this deck, clears deckId for cards removed,
 * and when isActiveDeck is true, clears the flag on the user's other decks.
 */
export const saveUserDeck = onCall(callableOptions, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in to save a deck.");
  }

  const uid = request.auth.uid;
  const deckKey = request.data?.deckKey as string | undefined;
  const ownedCardIdsRaw = request.data?.ownedCardIds;
  const isActiveDeck = request.data?.isActiveDeck === true;

  if (!deckKey || !DECK_KEYS.has(deckKey)) {
    throw new HttpsError("invalid-argument", "deckKey must be deck-1, deck-2, or deck-3.");
  }

  if (!Array.isArray(ownedCardIdsRaw)) {
    throw new HttpsError("invalid-argument", "ownedCardIds must be an array.");
  }

  if (ownedCardIdsRaw.length > MAX_DECK_CARD_COUNT) {
    throw new HttpsError(
      "invalid-argument",
      `A deck may contain at most ${MAX_DECK_CARD_COUNT} cards.`,
    );
  }

  const ownedCardIds: string[] = [];
  const seen = new Set<string>();
  for (const id of ownedCardIdsRaw) {
    if (typeof id !== "string" || !id) {
      throw new HttpsError("invalid-argument", "ownedCardIds must be non-empty strings.");
    }
    if (seen.has(id)) {
      throw new HttpsError("invalid-argument", "Duplicate ownedCardId in deck.");
    }
    seen.add(id);
    ownedCardIds.push(id);
  }

  const userRef = db.collection("users").doc(uid);
  const collectionRef = userRef.collection("cardCollection");
  const decksRef = userRef.collection("decks");
  const deckRef = decksRef.doc(deckKey);

  const previousSnap = await deckRef.get();
  const previousIds: string[] = Array.isArray(previousSnap.data()?.ownedCardIds)
    ? (previousSnap.data()!.ownedCardIds as unknown[]).filter(
        (id): id is string => typeof id === "string",
      )
    : [];

  // Validate every requested card exists, is free or already on this deck, and sum weight.
  let totalWeight = 0;
  for (const ownedCardId of ownedCardIds) {
    const cardSnap = await collectionRef.doc(ownedCardId).get();
    if (!cardSnap.exists) {
      throw new HttpsError("failed-precondition", `Owned card not found: ${ownedCardId}`);
    }
    const data = cardSnap.data()!;
    const cardDeckId = data.deckId;
    if (
      cardDeckId != null &&
      cardDeckId !== "" &&
      cardDeckId !== deckKey
    ) {
      throw new HttpsError(
        "failed-precondition",
        `Card ${ownedCardId} is already assigned to ${cardDeckId}.`,
      );
    }
    const catalogCardId = data.catalogCardId;
    if (typeof catalogCardId !== "string" || !catalogCardId) {
      throw new HttpsError("failed-precondition", `Card ${ownedCardId} has no catalogCardId.`);
    }
    const rules = LIVE_CARD_RULES[catalogCardId];
    if (!rules) {
      throw new HttpsError("failed-precondition", `Unknown catalog card: ${catalogCardId}`);
    }
    totalWeight += rules.weight;
  }

  if (totalWeight > MAX_DECK_WEIGHT) {
    throw new HttpsError(
      "invalid-argument",
      `Deck weight ${totalWeight} exceeds the maximum of ${MAX_DECK_WEIGHT}.`,
    );
  }

  const batch = db.batch();
  const nextSet = new Set(ownedCardIds);

  for (const ownedCardId of ownedCardIds) {
    batch.update(collectionRef.doc(ownedCardId), { deckId: deckKey });
  }
  for (const ownedCardId of previousIds) {
    if (!nextSet.has(ownedCardId)) {
      batch.update(collectionRef.doc(ownedCardId), { deckId: null });
    }
  }

  const deckNames: Record<DeckKey, string> = {
    "deck-1": "Deck 1",
    "deck-2": "Deck 2",
    "deck-3": "Deck 3",
  };

  batch.set(
    deckRef,
    {
      deckKey,
      name: deckNames[deckKey as DeckKey],
      ownedCardIds,
      totalWeight,
      isActiveDeck,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  if (isActiveDeck) {
    for (const otherKey of DECK_KEYS) {
      if (otherKey === deckKey) {
        continue;
      }
      const otherRef = decksRef.doc(otherKey);
      const otherSnap = await otherRef.get();
      if (otherSnap.exists) {
        batch.update(otherRef, { isActiveDeck: false });
      }
    }
  }

  await batch.commit();

  logger.info("saveUserDeck", {
    uid,
    deckKey,
    count: ownedCardIds.length,
    totalWeight,
    removed: previousIds.filter((id) => !nextSet.has(id)).length,
    isActiveDeck,
  });

  return {
    ok: true,
    deckKey,
    ownedCardIds,
    totalWeight,
    isActiveDeck,
  };
});

/**
 * Creates the shared board once per match (idempotent).
 * Uses each participant's saved active constructed deck (catalog card ids).
 */
export const initializeLiveMatch = onCall(callableOptions, async (request) => {
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
  const matchSnap = await matchRef.get();
  if (!matchSnap.exists) {
    throw new HttpsError("not-found", "Match not found.");
  }

  const matchPreview = matchSnap.data() as MatchDoc;
  assertParticipant(matchPreview, uid);

  if (matchPreview.gameState?.gameStarted) {
    return { ok: true, version: matchPreview.gameState.version };
  }

  const player1Uid = matchPreview.player1?.uid;
  const player2Uid = matchPreview.player2?.uid;
  if (!player1Uid || !player2Uid) {
    throw new HttpsError("failed-precondition", "Match is missing player seats.");
  }

  const [deck1, deck2] = await Promise.all([
    loadActiveCatalogDeck(player1Uid),
    loadActiveCatalogDeck(player2Uid),
  ]);

  const gameState = await db.runTransaction(async (tx) => {
    const matchInTx = await tx.get(matchRef);
    if (!matchInTx.exists) {
      throw new HttpsError("not-found", "Match not found.");
    }

    const match = matchInTx.data() as MatchDoc;
    assertParticipant(match, uid);

    if (match.gameState?.gameStarted) {
      return match.gameState;
    }

    const initial = stripUndefinedDeep(createInitialLiveGameState(deck1, deck2));
    tx.update(matchRef, {
      gameState: initial,
      currentTurn: initial.currentTurn,
      actionSeq: 0,
    });
    return initial;
  });

  logger.info("initializeLiveMatch", {
    matchId,
    uid,
    version: gameState.version,
    player1DeckSize: deck1.length,
    player2DeckSize: deck2.length,
  });
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
  monsterFieldSlot?: number;
  attackerFieldSlot?: number;
  defenderRowSlot?: "player1" | "player2";
  defenderZone?: "monster" | "land";
  defenderIdentifier?: number;
  defenderPlayerSlot?: "player1" | "player2";
  abilityId?: string;
  casterMonsterSlot?: number;
  landRowSlot?: "player1" | "player2";
  landIndex?: number;
};

const SUPPORTED_ACTIONS = new Set([
  "endTurn",
  "playCard",
  "defend",
  "attack",
  "castSpell",
  "useAbility",
]);

/**
 * Action Sync entry point for live match mutations.
 */
export const submitMatchAction = onCall(callableOptions, async (request) => {
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
  if (!SUPPORTED_ACTIONS.has(type)) {
    throw new HttpsError(
      "invalid-argument",
      "Supported actions: endTurn, playCard, defend, attack, castSpell, useAbility.",
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
    const controllerSlot = seatToSlot(callerSeat);

    if (type === "endTurn") {
      nextState = applyEndTurnToLiveGameState(match.gameState);
      actionPayload = {
        type: "endTurn",
        fromTurn: currentTurn,
        toTurn: nextState.currentTurn,
      };
    } else if (type === "defend") {
      const monsterFieldSlot =
        typeof data.monsterFieldSlot === "number"
          ? data.monsterFieldSlot
          : typeof data.fieldSlot === "number"
            ? data.fieldSlot
            : -1;
      if (monsterFieldSlot < 1) {
        throw new HttpsError(
          "invalid-argument",
          "defend requires monsterFieldSlot.",
        );
      }
      const applied = applyDefendToLiveGameState(
        match.gameState,
        controllerSlot,
        monsterFieldSlot,
      );
      if (!applied) {
        throw new HttpsError("failed-precondition", "Illegal defend move.");
      }
      nextState = applied;
      actionPayload = { type: "defend", monsterFieldSlot };
    } else if (type === "attack") {
      const attackerFieldSlot =
        typeof data.attackerFieldSlot === "number" ? data.attackerFieldSlot : -1;
      if (attackerFieldSlot < 1) {
        throw new HttpsError(
          "invalid-argument",
          "attack requires attackerFieldSlot.",
        );
      }

      let intent: AttackIntent;
      if (
        data.defenderPlayerSlot === "player1" ||
        data.defenderPlayerSlot === "player2"
      ) {
        intent = {
          kind: "life",
          attackerFieldSlot,
          defenderPlayerSlot: data.defenderPlayerSlot,
        };
      } else if (
        (data.defenderRowSlot === "player1" || data.defenderRowSlot === "player2") &&
        (data.defenderZone === "monster" || data.defenderZone === "land") &&
        typeof data.defenderIdentifier === "number"
      ) {
        intent = {
          kind: "field",
          attackerFieldSlot,
          defenderRowSlot: data.defenderRowSlot,
          defenderZone: data.defenderZone,
          defenderIdentifier: data.defenderIdentifier,
        };
      } else {
        throw new HttpsError(
          "invalid-argument",
          "attack requires a field target or defenderPlayerSlot for life.",
        );
      }

      const applied = applyAttackToLiveGameState(
        match.gameState,
        controllerSlot,
        intent,
      );
      if (!applied) {
        throw new HttpsError("failed-precondition", "Illegal attack move.");
      }
      nextState = applied;
      actionPayload = { type: "attack", ...intent };
    } else if (type === "castSpell") {
      const cardId = typeof data.cardId === "string" ? data.cardId : "";
      const handIndex =
        typeof data.handIndex === "number" ? data.handIndex : -1;
      if (!cardId || handIndex < 0) {
        throw new HttpsError(
          "invalid-argument",
          "castSpell requires cardId and handIndex.",
        );
      }

      let intent: CastSpellIntent;
      if (
        data.defenderPlayerSlot === "player1" ||
        data.defenderPlayerSlot === "player2"
      ) {
        intent = {
          kind: "life",
          cardId,
          handIndex,
          defenderPlayerSlot: data.defenderPlayerSlot,
        };
      } else if (
        (data.defenderRowSlot === "player1" || data.defenderRowSlot === "player2") &&
        (data.defenderZone === "monster" || data.defenderZone === "land") &&
        typeof data.defenderIdentifier === "number"
      ) {
        intent = {
          kind: "field",
          cardId,
          handIndex,
          defenderRowSlot: data.defenderRowSlot,
          defenderZone: data.defenderZone,
          defenderIdentifier: data.defenderIdentifier,
        };
      } else {
        throw new HttpsError(
          "invalid-argument",
          "castSpell requires a field target or defenderPlayerSlot for life.",
        );
      }

      const applied = applyCastSpellToLiveGameState(
        match.gameState,
        controllerSlot,
        intent,
      );
      if (!applied) {
        throw new HttpsError("failed-precondition", "Illegal castSpell move.");
      }
      nextState = applied;
      actionPayload = { type: "castSpell", ...intent };
    } else if (type === "useAbility") {
      const abilityId =
        typeof data.abilityId === "string" ? data.abilityId.trim() : "";
      let intent: UseAbilityIntent;
      if (abilityId === "burrow") {
        const casterMonsterSlot =
          typeof data.casterMonsterSlot === "number"
            ? data.casterMonsterSlot
            : typeof data.monsterFieldSlot === "number"
              ? data.monsterFieldSlot
              : -1;
        if (casterMonsterSlot < 1) {
          throw new HttpsError(
            "invalid-argument",
            "burrow requires casterMonsterSlot.",
          );
        }
        intent = { abilityId: "burrow", casterMonsterSlot };
      } else if (abilityId === "tail-smash") {
        const casterMonsterSlot =
          typeof data.casterMonsterSlot === "number"
            ? data.casterMonsterSlot
            : -1;
        if (
          casterMonsterSlot < 1 ||
          (data.defenderRowSlot !== "player1" &&
            data.defenderRowSlot !== "player2") ||
          (data.defenderZone !== "monster" && data.defenderZone !== "land") ||
          typeof data.defenderIdentifier !== "number"
        ) {
          throw new HttpsError(
            "invalid-argument",
            "tail-smash requires caster and field target.",
          );
        }
        intent = {
          abilityId: "tail-smash",
          casterMonsterSlot,
          defenderRowSlot: data.defenderRowSlot,
          defenderZone: data.defenderZone,
          defenderIdentifier: data.defenderIdentifier,
        };
      } else if (abilityId === "praise") {
        if (
          (data.landRowSlot !== "player1" && data.landRowSlot !== "player2") ||
          typeof data.landIndex !== "number"
        ) {
          throw new HttpsError(
            "invalid-argument",
            "praise requires landRowSlot and landIndex.",
          );
        }
        intent = {
          abilityId: "praise",
          landRowSlot: data.landRowSlot,
          landIndex: data.landIndex,
        };
      } else {
        throw new HttpsError(
          "invalid-argument",
          "Supported abilities: burrow, tail-smash, praise.",
        );
      }

      const applied = applyUseAbilityToLiveGameState(
        match.gameState,
        controllerSlot,
        intent,
      );
      if (!applied) {
        throw new HttpsError("failed-precondition", "Illegal useAbility move.");
      }
      nextState = applied;
      actionPayload = { type: "useAbility", ...intent };
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
        controllerSlot,
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
