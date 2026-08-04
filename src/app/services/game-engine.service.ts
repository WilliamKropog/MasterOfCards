import { computed, Injectable, signal } from '@angular/core';
import type { CdkDragDrop } from '@angular/cdk/drag-drop';
import {
  addManaToPool,
  addManaToPoolCapped,
  aggregateManaFromActiveFieldLands,
  aggregateMaxManaFromActiveFieldLands,
  buildShuffledDeck,
  canAffordManaCost,
  CardIds,
  clampManaPoolToMax,
  effectiveLandBuildTime,
  effectiveLandSpace,
  getCardDefinition,
  hasManaCost,
  isElderGopherStatue,
  isExcavationSite,
  isLandStillBuilding,
  isThousandMileWall,
  isKingColossus,
  landCapacityOwner,
  landCapacityOwnerForPlay,
  monsterSummoningSicknessCleared,
  mustPlaceLandOnOpponentRow,
  OPENING_HAND_SIZE,
  spellAllowsPlayerLifeTarget,
  spellAllowsTargetZone,
  spendManaCost,
  type ManaCostMap,
  type ManaGenerationMap,
} from '../game/card-catalog';

/** Which seat is acting in the match (extend as your rules need). */
export type PlayerId = 1 | 2;

/** Starting life total per player (win condition: reduce opponent to 0). */
export const STARTING_LIFE_POINTS = 1000;

/** Maximum land capacity per player (displayed as current / max). */
export const MAX_LAND_CAPACITY = 9;

/** Number of numbered spaces in each player's monster row (1–9). */
export const MONSTER_FIELD_SLOTS = 9;

/** Field row entry: catalog id + turn counter when played (for summoning / tap rules). */
export interface FieldCardEntry {
  /** Stable render identity so removing a neighbor does not reuse another card's DOM state. */
  fieldInstanceId: number;
  cardId: string;
  /** Global round counter when played (monster summoning sickness, etc.). */
  placedAtTurnCounter: number;
  /** Owning player's turn-start counter when played (land build timer). */
  placedAtOwnerTurnCounter: number;
  /** Who played / controls the card (mana, build). Defaults to the field row owner when unset. */
  controllerSlot?: FieldPlayerSlot;
  /** Battle damage; defaults to catalog `maxHealth` when missing. */
  currentHealth?: number;
  /**
   * Runtime max HP when different from catalog (e.g. King Colossus Rock mana bonus).
   * Used for "current / max" display; damage still tracks `currentHealth`.
   */
  maxHealthOverride?: number;
  /** Monster/land has attacked or been in combat this turn; cleared on Next Turn. */
  hasActedThisTurn?: boolean;
  /**
   * Monster-only: attacks completed this turn (for `multiAttack`).
   * Cleared on Next Turn with other acted flags.
   */
  attacksThisTurn?: number;
  /** Monster is in defense position (horizontal); cleared when that player’s turn begins. */
  defending?: boolean;
  /**
   * While true, the card cannot be targeted by spells.
   * Used by abilities like Mighty Gopher's Burrow.
   */
  spellImmune?: boolean;
  /**
   * Monster-only: each block negates one incoming attack or spell (any damage).
   * Initialized from catalog `startingBlocks` when placed.
   */
  blocks?: number;
  /** Monster-only: which numbered space (1–9) this monster occupies on the field. */
  fieldSlot?: number;
  /** Land-only: which monster-row spaces (1–9) this land card influences. */
  influencedSpaces?: number[];
  /** Land-only: permanent bonus Rock mana from Praise activations. */
  praiseBonusRock?: number;
  /** Ability ids already used this match (e.g. one-time Tail Smash). */
  usedAbilities?: string[];
}

/** Which row a field card sits in (land vs monster). */
export type FieldZone = 'land' | 'monster';

export type FieldPlayerSlot = 'player1' | 'player2';

/** Field card chosen by spell snap line / tether (see `data-field-*` on field `app-card`). */
export interface SpellTetherTarget {
  slot: FieldPlayerSlot;
  zone: FieldZone;
  index: number;
}

/** Monster attack targeting: player is choosing an enemy for this field monster. */
export interface AttackModeState {
  attackerSlot: FieldPlayerSlot;
  /** The monster's fieldSlot (1–9) on the monster row, not an array index. */
  attackerMonsterSlot: number;
}

/** Monster ability targeting (e.g. Tail Smash): choose an enemy field card. */
export interface AbilityTargetModeState {
  abilityId: string;
  casterSlot: FieldPlayerSlot;
  /** The caster monster's fieldSlot (1–9). */
  casterMonsterSlot: number;
}

/** A damage event emitted for floating damage text. */
export interface DamageEvent {
  /** For field cards: slot + zone + identifier. For player LP: playerSlot only. */
  playerSlot: FieldPlayerSlot;
  zone?: FieldZone;
  identifier?: number;
  amount: number;
  /** True when the hit was absorbed by a block/shield instead of dealing HP damage. */
  blocked?: boolean;
  timestamp: number;
}

export type ActionFeedbackKind =
  | 'praising'
  | 'praise-bonus-rock'
  | 'mana-generated'
  | 'excavated'
  | 'wall-shielding';

export interface ManaFeedbackPart {
  element: string;
  amount: number;
}

/** Floating action feedback (e.g. Praise indicators on field cards). */
export interface ActionFeedbackEvent {
  playerSlot: FieldPlayerSlot;
  zone: FieldZone;
  identifier: number;
  kind: ActionFeedbackKind;
  /** Display text; when set, UI uses this instead of a kind default. */
  text?: string;
  /** Per-element mana lines for turn-start land generation feedback. */
  manaParts?: ManaFeedbackPart[];
  timestamp: number;
}

export interface LandPraiseState {
  isElderGopher: boolean;
  landActive: boolean;
  isControllerTurn: boolean;
  hasMightyGopher: boolean;
  mightyGopherCanAct: boolean;
  canActivate: boolean;
  mightyGopherSlot: number | null;
}

/**
 * Tracks a card removed from hand but not yet placed on the field.
 * The player must select which monster-row space(s) to assign.
 */
export interface PendingPlacement {
  cardId: string;
  controllerSlot: FieldPlayerSlot;
  targetZone: FieldZone;
  targetRowSlot: FieldPlayerSlot;
  spacesNeeded: number;
  selectedSpaces: number[];
}

/**
 * Central place for match state and rule-driven updates.
 * Inject in components with `inject(GameEngineService)` or constructor DI.
 */
@Injectable({
  providedIn: 'root',
})
export class GameEngineService {
  private nextFieldInstanceId = 1;

  /** True after `startGame()` has been called for this session. */
  readonly gameStarted = signal(false);

  /** Hand contents (catalog ids); mutated by CDK drag-drop, then `touchDropContainers` refreshes signals. */
  readonly player1Hand = signal<string[]>([]);
  readonly player2Hand = signal<string[]>([]);

  /**
   * Draw pile (front = index 0). Built in `startGame()`; cards are shifted off when drawn.
   */
  readonly player1Deck = signal<string[]>([]);
  readonly player2Deck = signal<string[]>([]);

  /** Cards played onto each field row. */
  readonly player1FieldLand = signal<FieldCardEntry[]>([]);
  readonly player1FieldMonster = signal<FieldCardEntry[]>([]);
  readonly player2FieldLand = signal<FieldCardEntry[]>([]);
  readonly player2FieldMonster = signal<FieldCardEntry[]>([]);

  /** Whose turn it is once the match has started; `null` before `startGame()`. */
  readonly currentTurn = signal<PlayerId | null>(null);

  /** Label for UI: "—" pre-game, then "Player 1" / "Player 2". */
  readonly currentTurnDisplay = computed(() => {
    const t = this.currentTurn();
    return t === null ? '—' : `Player ${t}`;
  });

  /**
   * Mana available this turn (refilled from lands at turn start; spent on spells, abilities, and plays).
   */
  readonly player1ManaPool = signal<ManaGenerationMap>({});
  readonly player2ManaPool = signal<ManaGenerationMap>({});

  /** Accumulated mana pool for UI and affordability checks. */
  readonly player1Mana = computed(() => this.player1ManaPool());
  readonly player2Mana = computed(() => this.player2ManaPool());

  /** Kept in sync with `currentTurn` when a game is active. */
  readonly activePlayer = signal<PlayerId>(1);

  /**
   * While set, enemy field cards that are legal attack targets shimmer red — among monsters,
   * defending enemies first, then others; lands only when no enemy monsters remain; hand when empty field.
   */
  readonly attackMode = signal<AttackModeState | null>(null);

  /**
   * While set, enemy field cards that are legal ability targets shimmer red
   * (e.g. Rockterrior Tail Smash).
   */
  readonly abilityTargetMode = signal<AbilityTargetModeState | null>(null);

  /**
   * Card removed from hand awaiting space selection before being placed on the field.
   * While non-null, the player must click numbered slots on the monster row to finalize.
   */
  readonly pendingPlacement = signal<PendingPlacement | null>(null);

  /**
   * True after the active player has placed a **free** (no mana cost) Land or Monster this turn.
   * Cards that cost mana can be played as many times as the player can afford.
   */
  readonly placedFreeFieldCardThisTurn = signal(false);

  /** True while a match is active (Next Turn is always available during a game). */
  readonly canAdvanceTurn = computed(() => this.mayAdvanceTurn());

  /** Emitted when damage is dealt to a field card or player LP. Consumers watch for changes. */
  readonly damageEvents = signal<DamageEvent[]>([]);

  readonly actionFeedbackEvents = signal<ActionFeedbackEvent[]>([]);

  /** True when the active player has exhausted all available moves this turn. */
  readonly noMovesRemaining = computed(() => this.computeNoMovesRemaining());

  /**
   * Round counter. `0` before the game starts; becomes `1` when `startGame()` runs;
   * then increases by 1 each time both players have pressed Next Turn (full round completes).
   */
  readonly turnCounter = signal(0);

  /**
   * How many times each player has started their turn this match (1 on their first turn).
   * Used for land `buildTime` relative to the owner, not the global round counter.
   */
  readonly player1TurnCounter = signal(0);
  readonly player2TurnCounter = signal(0);

  /** Player life points (game loss at 0). */
  readonly player1LifePoints = signal(STARTING_LIFE_POINTS);
  readonly player2LifePoints = signal(STARTING_LIFE_POINTS);

  /** Land capacity used by lands this player controls (max {@link MAX_LAND_CAPACITY}). */
  readonly player1LandCapacity = computed(() => this.landCapacityUsed('player1'));
  readonly player2LandCapacity = computed(() => this.landCapacityUsed('player2'));

  /** Begin the match: turn counter → 1, current turn → Player 1. */
  startGame(): void {
    this.player1LifePoints.set(STARTING_LIFE_POINTS);
    this.player2LifePoints.set(STARTING_LIFE_POINTS);
    this.nextFieldInstanceId = 1;
    this.gameStarted.set(true);
    this.turnCounter.set(1);
    this.player1TurnCounter.set(1);
    this.player2TurnCounter.set(0);
    this.currentTurn.set(1);
    this.activePlayer.set(1);
    const deck1 = buildShuffledDeck();
    const deck2 = buildShuffledDeck();
    const hand1 = deck1.splice(0, OPENING_HAND_SIZE);
    const hand2 = deck2.splice(0, OPENING_HAND_SIZE);
    this.player1Hand.set(hand1);
    this.player2Hand.set(hand2);
    this.player1Deck.set(deck1);
    this.player2Deck.set(deck2);
    console.log('Player 1 opening hand:', hand1);
    console.log('Player 1 deck (remaining):', deck1);
    console.log('Player 2 opening hand:', hand2);
    console.log('Player 2 deck (remaining):', deck2);
    this.player1FieldLand.set([]);
    this.player1FieldMonster.set([]);
    this.player2FieldLand.set([]);
    this.player2FieldMonster.set([]);
    this.placedFreeFieldCardThisTurn.set(false);
    this.attackMode.set(null);
    this.abilityTargetMode.set(null);
    this.pendingPlacement.set(null);
    this.player1ManaPool.set({});
    this.player2ManaPool.set({});
    this.refreshManaPool('player1');
  }

  createFieldCardEntry(cardId: string, controllerSlot: FieldPlayerSlot): FieldCardEntry {
    const turn = this.currentTurn();
    const placedAtOwnerTurnCounter =
      turn === 1
        ? this.player1TurnCounter()
        : turn === 2
          ? this.player2TurnCounter()
          : 0;
    const def = getCardDefinition(cardId);
    const entry: FieldCardEntry = {
      fieldInstanceId: this.nextFieldInstanceId++,
      cardId,
      placedAtTurnCounter: this.turnCounter(),
      placedAtOwnerTurnCounter,
      controllerSlot,
    };
    if (def?.cardType === 'Monster') {
      const startingBlocks = def.startingBlocks ?? 0;
      if (startingBlocks > 0) {
        entry.blocks = startingBlocks;
      }
    }
    return entry;
  }

  /** Adds this turn's mana from active lands onto the player's existing pool (accumulates, capped by maxMana). */
  refreshManaPool(slot: FieldPlayerSlot): void {
    const generated = this.manaCapacityFromLands(slot);
    const maxMana = this.manaMaxFromLands(slot);
    if (slot === 'player1') {
      this.player1ManaPool.update((pool) => addManaToPoolCapped(pool, generated, maxMana));
    } else {
      this.player2ManaPool.update((pool) => addManaToPoolCapped(pool, generated, maxMana));
    }
    this.emitLandManaGenerationFeedback(slot);
  }

  /**
   * Floating "+N Element mana" above each active land that contributes to `controller`'s pool.
   */
  private emitLandManaGenerationFeedback(controller: FieldPlayerSlot): void {
    const ownerTurn = this.ownerTurnCounter(controller);
    const emitForRow = (rowSlot: FieldPlayerSlot, lands: FieldCardEntry[]) => {
      lands.forEach((entry, index) => {
        if ((entry.controllerSlot ?? rowSlot) !== controller) {
          return;
        }
        const def = getCardDefinition(entry.cardId);
        if (!def?.generateMana) {
          return;
        }
        if (isLandStillBuilding(def, entry.placedAtOwnerTurnCounter, ownerTurn)) {
          return;
        }

        const totals: ManaGenerationMap = {};
        for (const [element, amount] of Object.entries(def.generateMana)) {
          if (amount > 0) {
            totals[element] = (totals[element] ?? 0) + amount;
          }
        }
        const praiseRock = entry.praiseBonusRock ?? 0;
        if (praiseRock > 0) {
          totals['Rock'] = (totals['Rock'] ?? 0) + praiseRock;
        }

        const manaParts = Object.entries(totals)
          .filter(([, amount]) => amount > 0)
          .map(([element, amount]) => ({ element, amount }))
          .sort((a, b) => b.amount - a.amount || a.element.localeCompare(b.element));
        if (manaParts.length === 0) {
          return;
        }

        this.emitActionFeedback({
          playerSlot: rowSlot,
          zone: 'land',
          identifier: index,
          kind: 'mana-generated',
          manaParts,
        });
      });
    };

    emitForRow('player1', this.player1FieldLand());
    emitForRow('player2', this.player2FieldLand());
  }

  /**
   * Spends mana from the player's current turn pool when affordable.
   * Returns false without mutating the pool when they cannot pay.
   */
  trySpendMana(slot: FieldPlayerSlot, cost: ManaCostMap | undefined): boolean {
    const pool = slot === 'player1' ? this.player1ManaPool() : this.player2ManaPool();
    const next = spendManaCost(pool, cost);
    if (next === null) {
      return false;
    }
    if (slot === 'player1') {
      this.player1ManaPool.set(next);
    } else {
      this.player2ManaPool.set(next);
    }
    return true;
  }

  /**
   * Lands with no `buildTime` add their `generateMana` to the placer's pool as soon as they hit the field.
   * Lands still building only contribute on later turn refreshes. Amounts are capped by active maxMana.
   */
  grantImmediateManaFromPlacedLand(controllerSlot: FieldPlayerSlot, cardId: string): void {
    const def = getCardDefinition(cardId);
    if (!def || def.cardType !== 'Land' || !def.generateMana) {
      return;
    }
    if (effectiveLandBuildTime(def) > 0) {
      return;
    }
    const pool = controllerSlot === 'player1' ? this.player1ManaPool() : this.player2ManaPool();
    const next = addManaToPoolCapped(pool, def.generateMana, this.manaMaxFromLands(controllerSlot));
    if (controllerSlot === 'player1') {
      this.player1ManaPool.set(next);
    } else {
      this.player2ManaPool.set(next);
    }
  }

  /** Mana generated per turn from lands this player controls. */
  private manaCapacityFromLands(controller: FieldPlayerSlot): ManaGenerationMap {
    return aggregateManaFromActiveFieldLands(
      this.controlledLandManaEntries(controller),
      this.ownerTurnCounter(controller),
    );
  }

  /** Storage caps from active lands this player controls (sum of catalog `maxMana`). */
  manaMaxFromLands(controller: FieldPlayerSlot): ManaGenerationMap {
    return aggregateMaxManaFromActiveFieldLands(
      this.controlledLandManaEntries(controller),
      this.ownerTurnCounter(controller),
    );
  }

  private controlledLandManaEntries(controller: FieldPlayerSlot): FieldCardEntry[] {
    const entries: FieldCardEntry[] = [];
    for (const entry of this.player1FieldLand()) {
      if ((entry.controllerSlot ?? 'player1') === controller) {
        entries.push(entry);
      }
    }
    for (const entry of this.player2FieldLand()) {
      if ((entry.controllerSlot ?? 'player2') === controller) {
        entries.push(entry);
      }
    }
    return entries;
  }

  /** Drop excess mana when lands (and thus caps) are lost. */
  private clampManaPoolForController(controller: FieldPlayerSlot): void {
    const maxMana = this.manaMaxFromLands(controller);
    if (controller === 'player1') {
      this.player1ManaPool.update((pool) => clampManaPoolToMax(pool, maxMana));
    } else {
      this.player2ManaPool.update((pool) => clampManaPoolToMax(pool, maxMana));
    }
  }

  /** Sum of catalog `space` counting toward this player's land capacity. */
  landCapacityUsed(player: FieldPlayerSlot): number {
    let total = 0;
    for (const entry of this.player1FieldLand()) {
      const def = getCardDefinition(entry.cardId);
      const space = effectiveLandSpace(def);
      if (space <= 0) {
        continue;
      }
      const controller = entry.controllerSlot ?? 'player1';
      if (landCapacityOwner(def, controller, 'player1') === player) {
        total += space;
      }
    }
    for (const entry of this.player2FieldLand()) {
      const def = getCardDefinition(entry.cardId);
      const space = effectiveLandSpace(def);
      if (space <= 0) {
        continue;
      }
      const controller = entry.controllerSlot ?? 'player2';
      if (landCapacityOwner(def, controller, 'player2') === player) {
        total += space;
      }
    }
    return total;
  }

  /** True when playing this land would not exceed the relevant player's {@link MAX_LAND_CAPACITY}. */
  canPlayLand(playerPlayingFromHand: FieldPlayerSlot, cardId: string): boolean {
    const def = getCardDefinition(cardId);
    if (!def || def.cardType !== 'Land') {
      return true;
    }
    const space = effectiveLandSpace(def);
    if (space <= 0) {
      return true;
    }
    const capacityOwner = landCapacityOwnerForPlay(def, playerPlayingFromHand);
    return this.landCapacityUsed(capacityOwner) + space <= MAX_LAND_CAPACITY;
  }

  /** Turn-start count for the given seat (for land build timers). */
  ownerTurnCounter(slot: FieldPlayerSlot): number {
    return slot === 'player1' ? this.player1TurnCounter() : this.player2TurnCounter();
  }

  /** Monster can attack, defend, or use activated abilities on the owner's turn. */
  private canMonsterAct(ownerSlot: FieldPlayerSlot, entry: FieldCardEntry): boolean {
    if (!this.gameStarted()) {
      return false;
    }
    const turn = this.currentTurn();
    if (turn === null) {
      return false;
    }
    const ownerId: PlayerId = ownerSlot === 'player1' ? 1 : 2;
    if (turn !== ownerId) {
      return false;
    }
    const def = getCardDefinition(entry.cardId);
    if (!def || def.cardType !== 'Monster') {
      return false;
    }
    if (entry.hasActedThisTurn) {
      return false;
    }
    // Already spent an attack this turn — may still multi-attack, but cannot defend/use abilities.
    if ((entry.attacksThisTurn ?? 0) > 0) {
      return false;
    }
    return monsterSummoningSicknessCleared(
      def,
      entry.placedAtTurnCounter,
      this.turnCounter(),
    );
  }

  /** True when this monster may perform another attack this turn (honors `multiAttack`). */
  private canMonsterAttack(ownerSlot: FieldPlayerSlot, entry: FieldCardEntry): boolean {
    if (!this.gameStarted()) {
      return false;
    }
    const turn = this.currentTurn();
    if (turn === null) {
      return false;
    }
    const ownerId: PlayerId = ownerSlot === 'player1' ? 1 : 2;
    if (turn !== ownerId) {
      return false;
    }
    const def = getCardDefinition(entry.cardId);
    if (!def || def.cardType !== 'Monster') {
      return false;
    }
    if (entry.hasActedThisTurn) {
      return false;
    }
    const multi = Math.max(1, def.multiAttack ?? 1);
    if ((entry.attacksThisTurn ?? 0) >= multi) {
      return false;
    }
    return monsterSummoningSicknessCleared(
      def,
      entry.placedAtTurnCounter,
      this.turnCounter(),
    );
  }

  /**
   * Begin choosing an attack target for a monster on the field. If the same monster is already
   * selected, toggles attack mode off. Does nothing when the enemy has no cards to attack.
   */
  beginAttackFromMonster(attackerSlot: FieldPlayerSlot, monsterSlot: number): void {
    if (!this.gameStarted()) {
      return;
    }
    const current = this.attackMode();
    if (
      current &&
      current.attackerSlot === attackerSlot &&
      current.attackerMonsterSlot === monsterSlot
    ) {
      // Mid multi-attack: clicking Attack again should not cancel targeting.
      const entry = this.getMonsterBySlot(attackerSlot, monsterSlot);
      if (entry && this.canMonsterAttack(attackerSlot, entry) && (entry.attacksThisTurn ?? 0) > 0) {
        return;
      }
      this.attackMode.set(null);
      return;
    }
    const entry = this.getMonsterBySlot(attackerSlot, monsterSlot);
    if (!entry || !this.canMonsterAttack(attackerSlot, entry)) {
      return;
    }
    this.attackMode.set({ attackerSlot, attackerMonsterSlot: monsterSlot });
    this.abilityTargetMode.set(null);
  }

  cancelAttackMode(): void {
    this.attackMode.set(null);
  }

  cancelAbilityTargetMode(): void {
    this.abilityTargetMode.set(null);
  }

  /** Clears both attack and ability targeting modes. */
  cancelAllTargetModes(): void {
    this.attackMode.set(null);
    this.abilityTargetMode.set(null);
  }

  /**
   * Put a monster into defense position for the rest of the opponent’s turn (uses the monster’s
   * action for this turn). Cleared when this player’s next turn starts.
   */
  setMonsterDefending(ownerSlot: FieldPlayerSlot, monsterSlot: number): boolean {
    if (!this.gameStarted()) {
      return false;
    }
    const turn = this.currentTurn();
    if (turn === null) {
      return false;
    }
    const ownerId: PlayerId = ownerSlot === 'player1' ? 1 : 2;
    if (turn !== ownerId) {
      return false;
    }

    const entry = this.getMonsterBySlot(ownerSlot, monsterSlot);
    if (!entry) {
      return false;
    }

    if (!this.canMonsterAct(ownerSlot, entry)) {
      return false;
    }

    if (this.attackMode()) {
      this.attackMode.set(null);
    }

    const updated: FieldCardEntry = {
      ...entry,
      defending: true,
      hasActedThisTurn: true,
    };
    this.applyFieldEntry(ownerSlot, 'monster', monsterSlot, updated);
    return true;
  }

  /**
   * Mighty Gopher ability: Burrow.
   * Requires 1 Rock mana, enters defense mode, and becomes spell-immune.
   * Uses the monster's action for the turn.
   */
  tryUseBurrow(ownerSlot: FieldPlayerSlot, monsterSlot: number): boolean {
    if (!this.gameStarted()) {
      return false;
    }
    const turn = this.currentTurn();
    if (turn === null) {
      return false;
    }
    const ownerId: PlayerId = ownerSlot === 'player1' ? 1 : 2;
    if (turn !== ownerId) {
      return false;
    }

    const entry = this.getMonsterBySlot(ownerSlot, monsterSlot);
    if (!entry) {
      return false;
    }

    const def = getCardDefinition(entry.cardId);
    if (!def || def.cardType !== 'Monster') {
      return false;
    }
    if (def.id !== 'mighty-gopher') {
      return false;
    }

    if (!this.canMonsterAct(ownerSlot, entry)) {
      return false;
    }

    const burrowCost: ManaCostMap = { Rock: 1 };
    if (!this.trySpendMana(ownerSlot, burrowCost)) {
      return false;
    }

    if (this.attackMode()) {
      this.attackMode.set(null);
    }

    const updated: FieldCardEntry = {
      ...entry,
      defending: true,
      spellImmune: true,
      hasActedThisTurn: true,
    };
    this.applyFieldEntry(ownerSlot, 'monster', monsterSlot, updated);
    return true;
  }

  /** True when Rockterrior still has Tail Smash available and can pay / act. */
  canBeginTailSmash(ownerSlot: FieldPlayerSlot, monsterSlot: number): boolean {
    if (!this.gameStarted()) {
      return false;
    }
    const entry = this.getMonsterBySlot(ownerSlot, monsterSlot);
    if (!entry || entry.cardId !== CardIds.rockterrior) {
      return false;
    }
    if ((entry.usedAbilities ?? []).includes('tail-smash')) {
      return false;
    }
    if (!this.canMonsterAct(ownerSlot, entry)) {
      return false;
    }
    const pool = ownerSlot === 'player1' ? this.player1ManaPool() : this.player2ManaPool();
    return canAffordManaCost(pool, { Rock: 3 });
  }

  /**
   * Begin Tail Smash targeting for Rockterrior. Toggles off if already selecting for the same monster.
   * Mana is spent when the target is chosen, not when targeting begins.
   */
  beginTailSmash(ownerSlot: FieldPlayerSlot, monsterSlot: number): void {
    if (!this.canBeginTailSmash(ownerSlot, monsterSlot)) {
      return;
    }
    const current = this.abilityTargetMode();
    if (
      current &&
      current.abilityId === 'tail-smash' &&
      current.casterSlot === ownerSlot &&
      current.casterMonsterSlot === monsterSlot
    ) {
      this.abilityTargetMode.set(null);
      return;
    }
    this.attackMode.set(null);
    this.abilityTargetMode.set({
      abilityId: 'tail-smash',
      casterSlot: ownerSlot,
      casterMonsterSlot: monsterSlot,
    });
  }

  /** Enemy field lands/monsters are legal Tail Smash targets (not spell-immune). */
  isLegalAbilityTarget(
    rowSlot: FieldPlayerSlot,
    zone: FieldZone,
    identifier: number,
    casterSlot: FieldPlayerSlot,
  ): boolean {
    const entry = this.getFieldEntry(rowSlot, zone, identifier);
    if (!entry) {
      return false;
    }
    if (entry.spellImmune === true) {
      return false;
    }
    const enemy: FieldPlayerSlot = casterSlot === 'player1' ? 'player2' : 'player1';
    if (this.fieldCardController(entry, rowSlot) !== enemy) {
      return false;
    }
    return zone === 'land' || zone === 'monster';
  }

  /**
   * Resolve Tail Smash onto a chosen enemy field card.
   * Deals 80 damage (160 to Ice). Spends 3 Rock, consumes the monster's turn, one-time use.
   */
  resolveTailSmashOnTarget(
    defenderSlot: FieldPlayerSlot,
    defenderZone: FieldZone,
    defenderIndex: number,
  ): boolean {
    const mode = this.abilityTargetMode();
    if (!mode || mode.abilityId !== 'tail-smash' || !this.gameStarted()) {
      return false;
    }
    if (!this.isLegalAbilityTarget(defenderSlot, defenderZone, defenderIndex, mode.casterSlot)) {
      return false;
    }

    const casterSlot = mode.casterSlot;
    const casterMonsterSlot = mode.casterMonsterSlot;
    const casterEntry = this.getMonsterBySlot(casterSlot, casterMonsterSlot);
    const defenderEntry = this.getFieldEntry(defenderSlot, defenderZone, defenderIndex);
    if (!casterEntry || !defenderEntry) {
      return false;
    }
    if (casterEntry.cardId !== CardIds.rockterrior) {
      return false;
    }
    if ((casterEntry.usedAbilities ?? []).includes('tail-smash')) {
      return false;
    }
    if (!this.canMonsterAct(casterSlot, casterEntry)) {
      return false;
    }

    const tailSmashCost: ManaCostMap = { Rock: 3 };
    if (!this.trySpendMana(casterSlot, tailSmashCost)) {
      return false;
    }

    const defenderDef = getCardDefinition(defenderEntry.cardId);
    if (!defenderDef) {
      return false;
    }

    const amount = defenderDef.cardElement === 'Ice' ? 160 : 80;
    const { entry: defenderResult, blocked } = this.applyIncomingFieldDamage(
      defenderEntry,
      amount,
      defenderDef,
    );
    if (amount > 0) {
      this.emitDamage({
        playerSlot: defenderSlot,
        zone: defenderZone,
        identifier: defenderIndex,
        amount,
        blocked,
      });
    }

    const used = [...(casterEntry.usedAbilities ?? []), 'tail-smash'];
    const casterResult: FieldCardEntry = {
      ...casterEntry,
      hasActedThisTurn: true,
      usedAbilities: used,
    };

    this.abilityTargetMode.set(null);
    this.attackMode.set(null);
    this.applyFieldEntry(casterSlot, 'monster', casterMonsterSlot, casterResult);
    this.applyFieldEntry(defenderSlot, defenderZone, defenderIndex, defenderResult);
    return true;
  }

  /** Praise state for Elder Gopher Statue at `landIndex` on `rowSlot`. */
  getLandPraiseState(rowSlot: FieldPlayerSlot, landIndex: number): LandPraiseState {
    const inactive: LandPraiseState = {
      isElderGopher: false,
      landActive: false,
      isControllerTurn: false,
      hasMightyGopher: false,
      mightyGopherCanAct: false,
      canActivate: false,
      mightyGopherSlot: null,
    };

    const landEntry = this.getFieldEntry(rowSlot, 'land', landIndex);
    if (!landEntry) {
      return inactive;
    }

    const def = getCardDefinition(landEntry.cardId);
    if (!isElderGopherStatue(def)) {
      return inactive;
    }

    const controller = landEntry.controllerSlot ?? rowSlot;
    const ownerTurn = this.ownerTurnCounter(controller);
    const landActive = !isLandStillBuilding(
      def,
      landEntry.placedAtOwnerTurnCounter,
      ownerTurn,
    );

    const turn = this.currentTurn();
    const controllerId: PlayerId = controller === 'player1' ? 1 : 2;
    const isControllerTurn = turn === controllerId;

    let hasMightyGopher = false;
    let mightyGopherCanAct = false;
    let mightyGopherSlot: number | null = null;

    for (const space of landEntry.influencedSpaces ?? []) {
      const monster = this.getMonsterBySlot(rowSlot, space);
      if (!monster) {
        continue;
      }
      if (monster.cardId === CardIds.mightyGopher) {
        const monsterOwner = monster.controllerSlot ?? rowSlot;
        hasMightyGopher = true;
        mightyGopherSlot = space;
        mightyGopherCanAct = this.canMonsterAct(monsterOwner, monster);
      } else {
        hasMightyGopher = false;
        mightyGopherCanAct = false;
        mightyGopherSlot = null;
      }
      break;
    }

    const canActivate =
      landActive && isControllerTurn && hasMightyGopher && mightyGopherCanAct;

    return {
      isElderGopher: true,
      landActive,
      isControllerTurn,
      hasMightyGopher,
      mightyGopherCanAct,
      canActivate,
      mightyGopherSlot,
    };
  }

  /**
   * Elder Gopher Statue: Praise.
   * Requires a ready Mighty Gopher on an influenced monster space; consumes its turn
   * and permanently increases this land's Rock mana generation by 1.
   */
  tryUsePraise(rowSlot: FieldPlayerSlot, landIndex: number): boolean {
    const state = this.getLandPraiseState(rowSlot, landIndex);
    if (!state.canActivate || state.mightyGopherSlot === null) {
      return false;
    }

    const landEntry = this.getFieldEntry(rowSlot, 'land', landIndex);
    const mightyEntry = this.getMonsterBySlot(rowSlot, state.mightyGopherSlot);
    if (!landEntry || !mightyEntry) {
      return false;
    }

    const updatedLand: FieldCardEntry = {
      ...landEntry,
      praiseBonusRock: (landEntry.praiseBonusRock ?? 0) + 1,
    };
    const updatedMighty: FieldCardEntry = {
      ...mightyEntry,
      hasActedThisTurn: true,
    };

    if (this.attackMode()) {
      this.attackMode.set(null);
    }

    this.applyFieldEntry(rowSlot, 'land', landIndex, updatedLand);
    this.applyFieldEntry(rowSlot, 'monster', state.mightyGopherSlot, updatedMighty);

    this.emitActionFeedback({
      playerSlot: rowSlot,
      zone: 'monster',
      identifier: state.mightyGopherSlot,
      kind: 'praising',
    });
    this.emitActionFeedback({
      playerSlot: rowSlot,
      zone: 'land',
      identifier: landIndex,
      kind: 'praise-bonus-rock',
      text: '+1 Rock Mana per Turn',
    });

    return true;
  }

  /**
   * Cast a spell from hand onto a tethered enemy field card (after drag release with snap line).
   * Supports catalog `damage` on spells; e.g. Flying doubles damage for Boulder Toss rules.
   */
  tryCastSpellFromHand(params: {
    casterSlot: FieldPlayerSlot;
    handIndex: number;
    spellCardId: string;
    tether: SpellTetherTarget;
  }): boolean {
    const { casterSlot, handIndex, spellCardId, tether } = params;
    if (!this.gameStarted()) {
      return false;
    }
    const turn = this.currentTurn();
    if (turn === null) {
      return false;
    }
    const casterId: 1 | 2 = casterSlot === 'player1' ? 1 : 2;
    if (turn !== casterId) {
      return false;
    }

    const hand = casterSlot === 'player1' ? this.player1Hand() : this.player2Hand();
    if (handIndex < 0 || handIndex >= hand.length || hand[handIndex] !== spellCardId) {
      return false;
    }

    const spellDef = getCardDefinition(spellCardId);
    if (!spellDef || spellDef.cardType !== 'Spell') {
      return false;
    }
    if (!spellAllowsTargetZone(spellDef, tether.zone)) {
      return false;
    }

    const defenderEntry = this.getFieldEntry(tether.slot, tether.zone, tether.index);
    if (!defenderEntry) {
      return false;
    }
    if (this.fieldCardController(defenderEntry, tether.slot) === casterSlot) {
      return false;
    }
    if (defenderEntry.spellImmune === true) {
      return false;
    }

    const defenderDef = getCardDefinition(defenderEntry.cardId);
    if (!defenderDef) {
      return false;
    }

    const destroys = spellDef.destroysTarget === true;
    let amount = 0;
    if (!destroys) {
      const baseDamage = spellDef.damage;
      if (baseDamage === undefined || baseDamage <= 0) {
        return false;
      }
      amount = baseDamage;
      if (defenderDef.attributes?.includes('Flying')) {
        amount *= 2;
      }
      const zoneMultiplier = spellDef.damageMultiplierAgainstZone?.[tether.zone];
      if (zoneMultiplier !== undefined) {
        amount *= zoneMultiplier;
      }
      if (spellDef.scaleDamageByTargetLandSpace && tether.zone === 'land') {
        const spaces = Math.max(1, effectiveLandSpace(defenderDef));
        amount *= spaces;
      }
    }

    if (!this.trySpendMana(casterSlot, spellDef.manaCost)) {
      return false;
    }

    const removeAtIndex = (arr: string[]): string[] => {
      const next = [...arr];
      next.splice(handIndex, 1);
      return next;
    };
    if (casterSlot === 'player1') {
      this.player1Hand.update(removeAtIndex);
    } else {
      this.player2Hand.update(removeAtIndex);
    }

    if (destroys) {
      this.applyFieldEntry(tether.slot, tether.zone, tether.index, {
        ...defenderEntry,
        currentHealth: 0,
      });
      this.attackMode.set(null);
      return true;
    }

    const { entry: defenderResult, blocked: defBlocked } = this.applyIncomingFieldDamage(
      defenderEntry,
      amount,
      defenderDef,
    );
    if (amount > 0) {
      this.emitDamage({
        playerSlot: tether.slot,
        zone: tether.zone,
        identifier: tether.index,
        amount,
        blocked: defBlocked,
      });
    }

    this.applyFieldEntry(tether.slot, tether.zone, tether.index, defenderResult);
    this.attackMode.set(null);
    return true;
  }

  /**
   * Cast a spell from hand at the opponent's life points (e.g. drag released on their hand).
   * Uses catalog `damage` as flat LP loss. Flying / field-only modifiers do not apply to LP.
   */
  tryCastSpellFromHandAgainstPlayerLife(params: {
    casterSlot: FieldPlayerSlot;
    handIndex: number;
    spellCardId: string;
    targetPlayerSlot: FieldPlayerSlot;
  }): boolean {
    const { casterSlot, handIndex, spellCardId, targetPlayerSlot } = params;
    if (!this.gameStarted()) {
      return false;
    }
    const turn = this.currentTurn();
    if (turn === null) {
      return false;
    }
    const casterId: 1 | 2 = casterSlot === 'player1' ? 1 : 2;
    if (turn !== casterId) {
      return false;
    }

    const hand = casterSlot === 'player1' ? this.player1Hand() : this.player2Hand();
    if (handIndex < 0 || handIndex >= hand.length || hand[handIndex] !== spellCardId) {
      return false;
    }

    const spellDef = getCardDefinition(spellCardId);
    if (!spellDef || spellDef.cardType !== 'Spell') {
      return false;
    }
    if (!spellAllowsPlayerLifeTarget(spellDef)) {
      return false;
    }

    if (!this.trySpendMana(casterSlot, spellDef.manaCost)) {
      return false;
    }

    if (targetPlayerSlot === casterSlot) {
      return false;
    }

    const amount = spellDef.damage;
    if (amount === undefined || amount <= 0) {
      return false;
    }

    const removeAtIndex = (arr: string[]): string[] => {
      const next = [...arr];
      next.splice(handIndex, 1);
      return next;
    };
    if (casterSlot === 'player1') {
      this.player1Hand.update(removeAtIndex);
    } else {
      this.player2Hand.update(removeAtIndex);
    }

    const applyLp = (current: number) => Math.max(0, current - amount);
    if (targetPlayerSlot === 'player1') {
      this.player1LifePoints.update(applyLp);
    } else {
      this.player2LifePoints.update(applyLp);
    }
    this.emitDamage({ playerSlot: targetPlayerSlot, amount });

    this.attackMode.set(null);
    return true;
  }

  /**
   * Resolves combat: attacker and defender deal damage simultaneously.
   * Monsters with `multiAttack` stay in attack targeting until their attacks for the turn are used.
   * Cards at 0 or less HP are removed from the field.
   */
  resolveAttackOnTarget(
    defenderSlot: FieldPlayerSlot,
    defenderZone: FieldZone,
    defenderIndex: number,
  ): void {
    const mode = this.attackMode();
    if (!mode || !this.gameStarted()) {
      return;
    }
    if (!this.isLegalAttackTargetForAttackMode(defenderSlot, defenderZone, defenderIndex, mode.attackerSlot)) {
      return;
    }

    const attackerSlot = mode.attackerSlot;
    const attackerMonsterSlot = mode.attackerMonsterSlot;

    const attackerEntry = this.getMonsterBySlot(attackerSlot, attackerMonsterSlot);
    const defenderEntry = this.getFieldEntry(defenderSlot, defenderZone, defenderIndex);
    if (!attackerEntry || !defenderEntry) {
      return;
    }
    if (!this.canMonsterAttack(attackerSlot, attackerEntry)) {
      return;
    }

    const atkDef = getCardDefinition(attackerEntry.cardId);
    const defDef = getCardDefinition(defenderEntry.cardId);
    if (!atkDef || !defDef) {
      return;
    }

    const atkPower = atkDef.attack ?? 0;
    const counterPower = defDef.attack ?? 0;

    const { entry: attackerAfterDamage, blocked: atkBlocked } = this.applyIncomingFieldDamage(attackerEntry, counterPower, atkDef);
    const { entry: defenderAfterDamage, blocked: defBlocked } = this.applyIncomingFieldDamage(defenderEntry, atkPower, defDef);

    if (counterPower > 0) {
      this.emitDamage({ playerSlot: attackerSlot, zone: 'monster', identifier: attackerMonsterSlot, amount: counterPower, blocked: atkBlocked });
    }
    if (atkPower > 0) {
      this.emitDamage({ playerSlot: defenderSlot, zone: defenderZone, identifier: defenderIndex, amount: atkPower, blocked: defBlocked });
    }

    const attacksThisTurn = (attackerEntry.attacksThisTurn ?? 0) + 1;
    const multi = Math.max(1, atkDef.multiAttack ?? 1);
    const attacksExhausted = attacksThisTurn >= multi;

    const attackerResult: FieldCardEntry = {
      ...attackerAfterDamage,
      attacksThisTurn,
      hasActedThisTurn: attacksExhausted ? true : attackerAfterDamage.hasActedThisTurn,
    };
    const defenderResult: FieldCardEntry = {
      ...defenderAfterDamage,
      hasActedThisTurn: true,
    };

    this.applyFieldEntry(attackerSlot, 'monster', attackerMonsterSlot, attackerResult);
    this.applyFieldEntry(defenderSlot, defenderZone, defenderIndex, defenderResult);

    const surviving = this.getMonsterBySlot(attackerSlot, attackerMonsterSlot);
    if (surviving && this.canMonsterAttack(attackerSlot, surviving)) {
      this.attackMode.set({ attackerSlot, attackerMonsterSlot });
    } else {
      this.attackMode.set(null);
    }
  }

  /**
   * Attack the opponent’s life points with the monster currently in attack mode (enemy has no
   * monsters on the field). Deals the attacker’s catalog `attack` as damage; no counter-damage.
   */
  resolveAttackOnEnemyLife(defenderPlayerSlot: FieldPlayerSlot): void {
    const mode = this.attackMode();
    if (!mode || !this.gameStarted()) {
      return;
    }
    const attackerSlot = mode.attackerSlot;
    const enemy: FieldPlayerSlot = attackerSlot === 'player1' ? 'player2' : 'player1';
    if (defenderPlayerSlot !== enemy) {
      return;
    }
    const enemyMonsterArr =
      enemy === 'player1' ? this.player1FieldMonster() : this.player2FieldMonster();
    const hasDefendingEnemy = enemyMonsterArr.some((e) => e.defending === true);
    if (hasDefendingEnemy) {
      return;
    }

    const attackerMonsterSlot = mode.attackerMonsterSlot;
    const attackerEntry = this.getMonsterBySlot(attackerSlot, attackerMonsterSlot);
    if (!attackerEntry) {
      return;
    }
    if (!this.canMonsterAttack(attackerSlot, attackerEntry)) {
      return;
    }

    const atkDef = getCardDefinition(attackerEntry.cardId);
    if (!atkDef) {
      return;
    }
    const atkPower = atkDef.attack ?? 0;
    if (atkPower <= 0) {
      return;
    }

    const applyLp = (current: number) => Math.max(0, current - atkPower);
    if (enemy === 'player1') {
      this.player1LifePoints.update(applyLp);
    } else {
      this.player2LifePoints.update(applyLp);
    }
    this.emitDamage({ playerSlot: enemy, amount: atkPower });

    const attacksThisTurn = (attackerEntry.attacksThisTurn ?? 0) + 1;
    const multi = Math.max(1, atkDef.multiAttack ?? 1);
    const attacksExhausted = attacksThisTurn >= multi;

    const attackerResult: FieldCardEntry = {
      ...attackerEntry,
      attacksThisTurn,
      hasActedThisTurn: attacksExhausted ? true : attackerEntry.hasActedThisTurn,
    };

    this.applyFieldEntry(attackerSlot, 'monster', attackerMonsterSlot, attackerResult);

    const surviving = this.getMonsterBySlot(attackerSlot, attackerMonsterSlot);
    if (surviving && this.canMonsterAttack(attackerSlot, surviving)) {
      this.attackMode.set({ attackerSlot, attackerMonsterSlot });
    } else {
      this.attackMode.set(null);
    }
  }

  /**
   * Attack-mode targeting: enemy monsters that are **defending** must be attacked before any
   * non-defending enemy monsters; then lands when no monsters remain; player hand uses separate checks.
   */
  /** Who controls a field card for targeting (Temple on your row still belongs to the opponent who played it). */
  fieldCardController(entry: FieldCardEntry, rowSlot: FieldPlayerSlot): FieldPlayerSlot {
    return entry.controllerSlot ?? rowSlot;
  }

  isLegalAttackTargetForAttackMode(
    rowSlot: FieldPlayerSlot,
    defenderZone: FieldZone,
    defenderIdentifier: number,
    attackerSlot: FieldPlayerSlot,
  ): boolean {
    const defenderEntry = this.getFieldEntry(rowSlot, defenderZone, defenderIdentifier);
    if (!defenderEntry) {
      return false;
    }
    const enemy: FieldPlayerSlot = attackerSlot === 'player1' ? 'player2' : 'player1';
    if (this.fieldCardController(defenderEntry, rowSlot) !== enemy) {
      return false;
    }
    const enemyMonsterArr =
      enemy === 'player1' ? this.player1FieldMonster() : this.player2FieldMonster();
    const hasDefendingEnemy = enemyMonsterArr.some((e) => e.defending === true);

    if (hasDefendingEnemy) {
      if (defenderZone !== 'monster') {
        return false;
      }
      const targetEntry = this.getMonsterBySlot(rowSlot, defenderIdentifier);
      return targetEntry?.defending === true;
    }

    if (defenderZone === 'monster') {
      return rowSlot === enemy && this.getMonsterBySlot(rowSlot, defenderIdentifier) !== undefined;
    }
    return defenderZone === 'land';
  }

  /**
   * Applies damage from an attack or spell. Monsters with `blocks > 0` consume one block
   * and take no HP damage for that hit.
   * Returns the updated entry and whether a block was consumed.
   */
  private applyIncomingFieldDamage(
    entry: FieldCardEntry,
    damage: number,
    def: ReturnType<typeof getCardDefinition>,
  ): { entry: FieldCardEntry; blocked: boolean } {
    if (damage <= 0) {
      return { entry, blocked: false };
    }
    const blocks = entry.blocks ?? 0;
    if (blocks > 0 && def?.cardType === 'Monster') {
      return { entry: { ...entry, blocks: blocks - 1 }, blocked: true };
    }
    const maxHp = entry.maxHealthOverride ?? def?.maxHealth ?? 0;
    const hp = entry.currentHealth ?? maxHp;
    return { entry: { ...entry, currentHealth: Math.max(0, hp - damage) }, blocked: false };
  }

  private getFieldArray(slot: FieldPlayerSlot, zone: FieldZone): FieldCardEntry[] {
    if (zone === 'land') {
      return slot === 'player1' ? this.player1FieldLand() : this.player2FieldLand();
    }
    return slot === 'player1' ? this.player1FieldMonster() : this.player2FieldMonster();
  }

  /**
   * Updates or removes a field entry.
   * For monsters, `identifier` is the fieldSlot (1–9).
   * For lands, `identifier` is the array index.
   * When a monster dies at 0 HP, Excavation Site may return a Dinosaur to the bottom of the deck (one-time).
   */
  private applyFieldEntry(
    slot: FieldPlayerSlot,
    zone: FieldZone,
    identifier: number,
    entry: FieldCardEntry,
  ): void {
    const def = getCardDefinition(entry.cardId);
    const maxHp = entry.maxHealthOverride ?? def?.maxHealth ?? 0;
    const hp = entry.currentHealth ?? maxHp;

    const excavationRevive =
      hp <= 0 && zone === 'monster'
        ? this.findExcavationSiteRevive(slot, entry)
        : null;

    const apply = (arr: FieldCardEntry[]): FieldCardEntry[] => {
      const next = [...arr];
      let arrIndex: number;
      if (zone === 'monster') {
        arrIndex = next.findIndex((e) => e.fieldSlot === identifier);
      } else {
        arrIndex = identifier;
      }
      if (arrIndex < 0 || arrIndex >= next.length) {
        return arr;
      }
      if (hp <= 0) {
        next.splice(arrIndex, 1);
      } else {
        next[arrIndex] = entry;
      }
      return next;
    };

    if (slot === 'player1' && zone === 'land') {
      this.player1FieldLand.update(apply);
    } else if (slot === 'player1' && zone === 'monster') {
      this.player1FieldMonster.update(apply);
    } else if (slot === 'player2' && zone === 'land') {
      this.player2FieldLand.update(apply);
    } else {
      this.player2FieldMonster.update(apply);
    }

    if (hp <= 0 && zone === 'land') {
      this.clampManaPoolForController(entry.controllerSlot ?? slot);
    }

    if (excavationRevive) {
      this.putCardAtBottomOfDeck(excavationRevive.deckOwner, excavationRevive.cardId);
      this.markExcavationSiteUsed(slot, excavationRevive.landIndex);
      this.emitActionFeedback({
        playerSlot: slot,
        zone: 'land',
        identifier: excavationRevive.landIndex,
        kind: 'excavated',
        text: 'Excavated — returned to deck',
      });
    }
  }

  /**
   * If an unused, active Excavation Site influences this dead Dinosaur's space, return its land index.
   */
  private findExcavationSiteRevive(
    rowSlot: FieldPlayerSlot,
    deadMonster: FieldCardEntry,
  ): { landIndex: number; cardId: string; deckOwner: FieldPlayerSlot } | null {
    const monsterDef = getCardDefinition(deadMonster.cardId);
    if (!monsterDef || monsterDef.monsterClass !== 'Dinosaur') {
      return null;
    }
    const fieldSlot = deadMonster.fieldSlot;
    if (fieldSlot === undefined) {
      return null;
    }

    const lands = rowSlot === 'player1' ? this.player1FieldLand() : this.player2FieldLand();
    for (let i = 0; i < lands.length; i++) {
      const land = lands[i]!;
      if (!isExcavationSite(getCardDefinition(land.cardId))) {
        continue;
      }
      if ((land.usedAbilities ?? []).includes('excavate')) {
        continue;
      }
      if (!(land.influencedSpaces ?? []).includes(fieldSlot)) {
        continue;
      }
      const landController = land.controllerSlot ?? rowSlot;
      if (
        isLandStillBuilding(
          getCardDefinition(land.cardId),
          land.placedAtOwnerTurnCounter,
          this.ownerTurnCounter(landController),
        )
      ) {
        continue;
      }
      return {
        landIndex: i,
        cardId: deadMonster.cardId,
        deckOwner: deadMonster.controllerSlot ?? rowSlot,
      };
    }
    return null;
  }

  private putCardAtBottomOfDeck(slot: FieldPlayerSlot, cardId: string): void {
    if (slot === 'player1') {
      this.player1Deck.update((deck) => [...deck, cardId]);
    } else {
      this.player2Deck.update((deck) => [...deck, cardId]);
    }
  }

  private markExcavationSiteUsed(rowSlot: FieldPlayerSlot, landIndex: number): void {
    const lands = rowSlot === 'player1' ? this.player1FieldLand() : this.player2FieldLand();
    const land = lands[landIndex];
    if (!land) {
      return;
    }
    const used = [...(land.usedAbilities ?? [])];
    if (!used.includes('excavate')) {
      used.push('excavate');
    }
    const updated: FieldCardEntry = { ...land, usedAbilities: used };
    if (rowSlot === 'player1') {
      this.player1FieldLand.update((arr) => {
        const next = [...arr];
        if (landIndex >= 0 && landIndex < next.length) {
          next[landIndex] = updated;
        }
        return next;
      });
    } else {
      this.player2FieldLand.update((arr) => {
        const next = [...arr];
        if (landIndex >= 0 && landIndex < next.length) {
          next[landIndex] = updated;
        }
        return next;
      });
    }
  }

  /** True when a 1000 Mile Wall has finished its buildTime and can grant blocks. */
  private isThousandMileWallActive(rowSlot: FieldPlayerSlot, land: FieldCardEntry): boolean {
    const def = getCardDefinition(land.cardId);
    if (!isThousandMileWall(def)) {
      return false;
    }
    const landController = land.controllerSlot ?? rowSlot;
    return !isLandStillBuilding(
      def,
      land.placedAtOwnerTurnCounter,
      this.ownerTurnCounter(landController),
    );
  }

  /** Find a finished 1000 Mile Wall on this row that covers the given monster space. */
  private findThousandMileWallCovering(
    rowSlot: FieldPlayerSlot,
    fieldSlot: number,
  ): FieldCardEntry | null {
    const lands = rowSlot === 'player1' ? this.player1FieldLand() : this.player2FieldLand();
    for (const land of lands) {
      if (!this.isThousandMileWallActive(rowSlot, land)) {
        continue;
      }
      if ((land.influencedSpaces ?? []).includes(fieldSlot)) {
        return land;
      }
    }
    return null;
  }

  private monstersOnInfluencedSpaces(
    rowSlot: FieldPlayerSlot,
    spaces: number[],
  ): FieldCardEntry[] {
    const spaceSet = new Set(spaces);
    const monsters =
      rowSlot === 'player1' ? this.player1FieldMonster() : this.player2FieldMonster();
    return monsters.filter(
      (m) => m.fieldSlot !== undefined && spaceSet.has(m.fieldSlot),
    );
  }

  /**
   * When a monster is played onto a space covered by 1000 Mile Wall:
   * - each other monster already on the wall gains +1 block
   * - the newly placed monster gains +N blocks (N = monsters on the wall, including itself)
   */
  private applyThousandMileWallOnMonsterPlaced(
    rowSlot: FieldPlayerSlot,
    newMonsterSlot: number,
  ): void {
    const wall = this.findThousandMileWallCovering(rowSlot, newMonsterSlot);
    if (!wall) {
      return;
    }
    const spaces = wall.influencedSpaces ?? [];
    const occupants = this.monstersOnInfluencedSpaces(rowSlot, spaces);
    const count = occupants.length;
    if (count === 0) {
      return;
    }
    const spaceSet = new Set(spaces);
    const fieldSig =
      rowSlot === 'player1' ? this.player1FieldMonster : this.player2FieldMonster;
    fieldSig.update((arr) =>
      arr.map((m) => {
        if (m.fieldSlot === undefined || !spaceSet.has(m.fieldSlot)) {
          return m;
        }
        const gain = m.fieldSlot === newMonsterSlot ? count : 1;
        return { ...m, blocks: (m.blocks ?? 0) + gain };
      }),
    );

    for (const m of occupants) {
      if (m.fieldSlot === undefined) {
        continue;
      }
      const gain = m.fieldSlot === newMonsterSlot ? count : 1;
      this.emitWallShieldingFeedback(rowSlot, m.fieldSlot, gain);
    }
  }

  /**
   * When a finished 1000 Mile Wall is placed over spaces that already have monsters,
   * each of those monsters gains +N blocks (N = monsters on the wall).
   * No-op while the wall is still building.
   */
  private applyThousandMileWallOnLandPlaced(
    rowSlot: FieldPlayerSlot,
    influencedSpaces: number[],
  ): void {
    const lands = rowSlot === 'player1' ? this.player1FieldLand() : this.player2FieldLand();
    const wall = lands[lands.length - 1];
    if (!wall || !this.isThousandMileWallActive(rowSlot, wall)) {
      return;
    }
    this.grantThousandMileWallBlocksToOccupants(rowSlot, influencedSpaces);
  }

  /**
   * On the owner's turn when a 1000 Mile Wall first finishes buildTime,
   * grant +N blocks to each monster already on it (N = occupant count).
   */
  private applyThousandMileWallOnConstructionComplete(controller: FieldPlayerSlot): void {
    const ownerTurn = this.ownerTurnCounter(controller);
    const checkRow = (rowSlot: FieldPlayerSlot) => {
      const lands = rowSlot === 'player1' ? this.player1FieldLand() : this.player2FieldLand();
      for (const land of lands) {
        if ((land.controllerSlot ?? rowSlot) !== controller) {
          continue;
        }
        const def = getCardDefinition(land.cardId);
        if (!isThousandMileWall(def)) {
          continue;
        }
        const buildTime = effectiveLandBuildTime(def);
        if (buildTime <= 0) {
          continue;
        }
        // Activates at the start of the owner's turn when counter reaches placedAt + buildTime.
        if (land.placedAtOwnerTurnCounter + buildTime !== ownerTurn) {
          continue;
        }
        this.grantThousandMileWallBlocksToOccupants(rowSlot, land.influencedSpaces ?? []);
      }
    };
    checkRow('player1');
    checkRow('player2');
  }

  private grantThousandMileWallBlocksToOccupants(
    rowSlot: FieldPlayerSlot,
    influencedSpaces: number[],
  ): void {
    const occupants = this.monstersOnInfluencedSpaces(rowSlot, influencedSpaces);
    const count = occupants.length;
    if (count === 0) {
      return;
    }
    const spaceSet = new Set(influencedSpaces);
    const fieldSig =
      rowSlot === 'player1' ? this.player1FieldMonster : this.player2FieldMonster;
    fieldSig.update((arr) =>
      arr.map((m) => {
        if (m.fieldSlot === undefined || !spaceSet.has(m.fieldSlot)) {
          return m;
        }
        return { ...m, blocks: (m.blocks ?? 0) + count };
      }),
    );

    for (const m of occupants) {
      if (m.fieldSlot === undefined) {
        continue;
      }
      this.emitWallShieldingFeedback(rowSlot, m.fieldSlot, count);
    }
  }

  /**
   * King Colossus: set HP to catalog max + 10 × Rock mana the player had before paying its cost.
   * Must run after `trySpendMana` so we reconstruct pre-spend Rock from pool + cost.
   */
  private applyKingColossusOnPlaced(
    controllerSlot: FieldPlayerSlot,
    entry: FieldCardEntry,
  ): void {
    const def = getCardDefinition(entry.cardId);
    if (!isKingColossus(def)) {
      return;
    }
    const pool =
      controllerSlot === 'player1' ? this.player1ManaPool() : this.player2ManaPool();
    const rockAfterSpend = pool['Rock'] ?? 0;
    const rockCost = def?.manaCost?.['Rock'] ?? 0;
    const rockBeforeSpend = rockAfterSpend + rockCost;
    const baseHp = def?.maxHealth ?? 300;
    const hp = baseHp + rockBeforeSpend * 10;
    entry.currentHealth = hp;
    entry.maxHealthOverride = hp;
  }

  private emitWallShieldingFeedback(
    rowSlot: FieldPlayerSlot,
    monsterFieldSlot: number,
    gain: number,
  ): void {
    if (gain <= 0) {
      return;
    }
    // Defer so a newly placed monster card mounts before observing the event.
    setTimeout(() => {
      this.emitActionFeedback({
        playerSlot: rowSlot,
        zone: 'monster',
        identifier: monsterFieldSlot,
        kind: 'wall-shielding',
        text: `+${gain} shielding`,
      });
    }, 0);
  }

  private emitDamage(event: Omit<DamageEvent, 'timestamp'>): void {
    const ts = Date.now();
    this.damageEvents.update((prev) => [...prev, { ...event, timestamp: ts }]);
    setTimeout(() => {
      this.damageEvents.update((arr) => arr.filter((e) => e.timestamp !== ts));
    }, 2000);
  }

  private emitActionFeedback(event: Omit<ActionFeedbackEvent, 'timestamp'>): void {
    const ts = Date.now();
    this.actionFeedbackEvents.update((prev) => [...prev, { ...event, timestamp: ts }]);
    setTimeout(() => {
      this.actionFeedbackEvents.update((arr) => arr.filter((e) => e.timestamp !== ts));
    }, 2000);
  }

  private clearFieldActedFlags(): void {
    const clear = (a: FieldCardEntry[]): FieldCardEntry[] =>
      a.map((e) => ({ ...e, hasActedThisTurn: false, attacksThisTurn: undefined }));
    this.player1FieldLand.update(clear);
    this.player1FieldMonster.update(clear);
    this.player2FieldLand.update(clear);
    this.player2FieldMonster.update(clear);
  }

  /** Upright monsters when this player’s turn begins (defense position resets). */
  private clearDefendingForPlayerStartingTurn(playerId: PlayerId): void {
    const clearMonster = (a: FieldCardEntry[]): FieldCardEntry[] =>
      a.map((e) => ({ ...e, defending: false, spellImmune: false }));
    if (playerId === 1) {
      this.player1FieldMonster.update(clearMonster);
    } else {
      this.player2FieldMonster.update(clearMonster);
    }
  }

  /**
   * Call when a Land or Monster is played from hand onto this player's field row during their turn.
   */
  notifyPlacedFieldCardFromHand(handData: string[]): void {
    if (!this.gameStarted()) {
      return;
    }
    const turn = this.currentTurn();
    if (turn === null) {
      return;
    }
    const owner: PlayerId | null =
      handData === this.player1Hand() ? 1 : handData === this.player2Hand() ? 2 : null;
    if (owner === null || owner !== turn) {
      return;
    }
    this.placedFreeFieldCardThisTurn.set(true);
  }

  /** Advance to the other player after they end their turn (Next Turn). */
  nextTurn(): void {
    if (!this.mayAdvanceTurn()) {
      return;
    }
    const t = this.currentTurn();
    if (t === null) {
      return;
    }
    const next: PlayerId = t === 1 ? 2 : 1;
    // Full round = P1 Next Turn + P2 Next Turn; advancing P2 → P1 completes that round.
    if (t === 2 && next === 1) {
      this.turnCounter.update((n) => n + 1);
    }
    this.currentTurn.set(next);
    this.activePlayer.set(next);
    if (next === 1) {
      this.player1TurnCounter.update((n) => n + 1);
    } else {
      this.player2TurnCounter.update((n) => n + 1);
    }
    this.placedFreeFieldCardThisTurn.set(false);
    this.attackMode.set(null);
    this.abilityTargetMode.set(null);
    this.cancelPendingPlacement();
    this.clearFieldActedFlags();
    this.clearDefendingForPlayerStartingTurn(next);
    this.refreshManaPool(next === 1 ? 'player1' : 'player2');
    this.applyThousandMileWallOnConstructionComplete(next === 1 ? 'player1' : 'player2');
    // Both players already received their opening hand at startGame; skip the draw on the first
    // handoff (P1 → P2) while still on round 1. Every later turn-start still draws one.
    const isFirstHandoffToPlayer2 =
      t === 1 && next === 2 && this.turnCounter() === 1;
    if (!isFirstHandoffToPlayer2) {
      this.drawOneCardFromDeckForPlayer(next);
    }
  }

  /** Top of deck (index 0) → append to hand. No-op if deck is empty. */
  private drawOneCardFromDeckForPlayer(playerId: PlayerId): void {
    if (playerId === 1) {
      const deck = this.player1Deck();
      if (deck.length === 0) {
        return;
      }
      const [card, ...rest] = deck;
      this.player1Deck.set(rest);
      this.player1Hand.update((h) => [...h, card!]);
    } else {
      const deck = this.player2Deck();
      if (deck.length === 0) {
        return;
      }
      const [card, ...rest] = deck;
      this.player2Deck.set(rest);
      this.player2Hand.update((h) => [...h, card!]);
    }
  }

  /**
   * CDK mutates list arrays in place; call after `moveItemInArray` / `transferArrayItem`
   * so Angular signals notify dependents.
   */
  touchDropContainers(event: CdkDragDrop<any>): void {
    const prev = event.previousContainer.data as string[] | FieldCardEntry[];
    const next = event.container.data as string[] | FieldCardEntry[];
    if (prev !== next) {
      this.touchArrayByRef(prev);
    }
    this.touchArrayByRef(next);
  }

  private touchArrayByRef(data: string[] | FieldCardEntry[]): void {
    if (data === this.player1Hand()) {
      this.player1Hand.update((a) => [...a]);
    } else if (data === this.player2Hand()) {
      this.player2Hand.update((a) => [...a]);
    } else if (data === this.player1FieldLand()) {
      this.player1FieldLand.update((a) => [...a]);
    } else if (data === this.player1FieldMonster()) {
      this.player1FieldMonster.update((a) => [...a]);
    } else if (data === this.player2FieldLand()) {
      this.player2FieldLand.update((a) => [...a]);
    } else if (data === this.player2FieldMonster()) {
      this.player2FieldMonster.update((a) => [...a]);
    }
  }

  /** Start or restart a local match to a known baseline (pre-game). */
  resetMatch(): void {
    this.gameStarted.set(false);
    this.player1LifePoints.set(STARTING_LIFE_POINTS);
    this.player2LifePoints.set(STARTING_LIFE_POINTS);
    this.turnCounter.set(0);
    this.player1TurnCounter.set(0);
    this.player2TurnCounter.set(0);
    this.currentTurn.set(null);
    this.activePlayer.set(1);
    this.nextFieldInstanceId = 1;
    this.player1Hand.set([]);
    this.player2Hand.set([]);
    this.player1FieldLand.set([]);
    this.player1FieldMonster.set([]);
    this.player2FieldLand.set([]);
    this.player2FieldMonster.set([]);
    this.player1Deck.set([]);
    this.player2Deck.set([]);
    this.placedFreeFieldCardThisTurn.set(false);
    this.attackMode.set(null);
    this.abilityTargetMode.set(null);
    this.pendingPlacement.set(null);
    this.player1ManaPool.set({});
    this.player2ManaPool.set({});
    this.damageEvents.set([]);
    this.actionFeedbackEvents.set([]);
  }

  /** Stub — advance turn / pass priority when you add phases. */
  endTurn(): void {
    const next: PlayerId = this.activePlayer() === 1 ? 2 : 1;
    this.activePlayer.set(next);
    if (this.gameStarted()) {
      this.currentTurn.set(next);
    }
    this.attackMode.set(null);
  }

  /** True when Next Turn is allowed. */
  private mayAdvanceTurn(): boolean {
    return this.gameStarted() && this.currentTurn() !== null;
  }

  /** True when the active player has no hand cards left to play and no monsters that can act. */
  private computeNoMovesRemaining(): boolean {
    if (!this.gameStarted()) { return false; }
    const turn = this.currentTurn();
    if (turn === null) { return false; }

    const slot: FieldPlayerSlot = turn === 1 ? 'player1' : 'player2';
    const hand = slot === 'player1' ? this.player1Hand() : this.player2Hand();
    const pool = slot === 'player1' ? this.player1ManaPool() : this.player2ManaPool();
    const placedFreeThisTurn = this.placedFreeFieldCardThisTurn();

    const canPlayAnyHandCard = hand.some((cardId) => {
      const def = getCardDefinition(cardId);
      if (!def) { return false; }
      const isFree = !hasManaCost(def.manaCost);
      if (isFree && (def.cardType === 'Land' || def.cardType === 'Monster') && placedFreeThisTurn) { return false; }
      if (!canAffordManaCost(pool, def.manaCost)) { return false; }
      if (def.cardType === 'Monster' && !this.canPlaceMonster(slot)) { return false; }
      if (def.cardType === 'Land' && !this.canPlayLand(slot, cardId)) { return false; }
      if (def.cardType === 'Land') {
        const targetRow = mustPlaceLandOnOpponentRow(def)
          ? (slot === 'player1' ? 'player2' : 'player1') as FieldPlayerSlot
          : slot;
        if (!this.canPlaceLandOnField(targetRow, def.space ?? 1)) { return false; }
      }
      return true;
    });
    if (canPlayAnyHandCard) { return false; }

    const monsters = slot === 'player1' ? this.player1FieldMonster() : this.player2FieldMonster();
    const hasActableMonster = monsters.some(
      (entry) => this.canMonsterAct(slot, entry) || this.canMonsterAttack(slot, entry),
    );
    if (hasActableMonster) { return false; }

    const lands = slot === 'player1' ? this.player1FieldLand() : this.player2FieldLand();
    const hasPraiseMove = lands.some((_, i) => this.getLandPraiseState(slot, i).canActivate);
    if (hasPraiseMove) { return false; }

    return true;
  }

  // ── Slot helpers ──────────────────────────────────────────────────────

  /** Look up a monster entry by its fieldSlot (1–9) for the given player. */
  getMonsterBySlot(player: FieldPlayerSlot, fieldSlot: number): FieldCardEntry | undefined {
    const arr = player === 'player1' ? this.player1FieldMonster() : this.player2FieldMonster();
    return arr.find((e) => e.fieldSlot === fieldSlot);
  }

  /**
   * Look up a field entry generically.
   * For monsters `identifier` is the fieldSlot (1–9); for lands it is the array index.
   */
  getFieldEntry(
    slot: FieldPlayerSlot,
    zone: FieldZone,
    identifier: number,
  ): FieldCardEntry | undefined {
    if (zone === 'monster') {
      return this.getMonsterBySlot(slot, identifier);
    }
    const arr = this.getFieldArray(slot, zone);
    return arr[identifier];
  }

  /** Slot numbers (1–9) that already have a monster for the given player. */
  occupiedMonsterSlots(player: FieldPlayerSlot): number[] {
    const arr = player === 'player1' ? this.player1FieldMonster() : this.player2FieldMonster();
    return arr.map((e) => e.fieldSlot!).filter((s) => s !== undefined);
  }

  /** Slot numbers (1–9) that are currently empty on the monster row. */
  availableMonsterSlots(player: FieldPlayerSlot): number[] {
    const occupied = new Set(this.occupiedMonsterSlots(player));
    const slots: number[] = [];
    for (let i = 1; i <= MONSTER_FIELD_SLOTS; i++) {
      if (!occupied.has(i)) {
        slots.push(i);
      }
    }
    return slots;
  }

  /** True when the player's monster row still has room for at least one more monster. */
  canPlaceMonster(player: FieldPlayerSlot): boolean {
    return this.availableMonsterSlots(player).length > 0;
  }

  /** Monster-row spaces (1–9) already claimed by a land card's influence for the given player. */
  influencedSpacesByLands(player: FieldPlayerSlot): number[] {
    const landArr = player === 'player1' ? this.player1FieldLand() : this.player2FieldLand();
    const set = new Set<number>();
    for (const entry of landArr) {
      for (const s of entry.influencedSpaces ?? []) {
        set.add(s);
      }
    }
    return [...set];
  }

  /** True when at least one valid contiguous placement exists for a land with `spaceCount` spaces. */
  canPlaceLandOnField(targetRowSlot: FieldPlayerSlot, spaceCount: number): boolean {
    const claimed = new Set(this.influencedSpacesByLands(targetRowSlot));
    for (let dropSlot = 1; dropSlot <= MONSTER_FIELD_SLOTS; dropSlot++) {
      if (this.computeLandInfluencedSpaces(dropSlot, spaceCount, targetRowSlot) !== null) {
        return true;
      }
    }
    return false;
  }

  // ── Land placement helpers ─────────────────────────────────────────

  /**
   * Compute contiguous influenced spaces centered on `dropSlot` for a land
   * with `spaceCount` spaces. Returns null when any resulting space overlaps
   * with an existing land's influence.
   */
  computeLandInfluencedSpaces(
    dropSlot: number,
    spaceCount: number,
    controllerSlot: FieldPlayerSlot,
  ): number[] | null {
    const offset = Math.floor((spaceCount - 1) / 2);
    let start = dropSlot - offset;
    let end = start + spaceCount - 1;
    if (end > MONSTER_FIELD_SLOTS) {
      end = MONSTER_FIELD_SLOTS;
      start = end - spaceCount + 1;
    }
    if (start < 1) {
      start = 1;
      end = start + spaceCount - 1;
    }
    if (end > MONSTER_FIELD_SLOTS) {
      return null;
    }
    const spaces: number[] = [];
    for (let i = start; i <= end; i++) {
      spaces.push(i);
    }
    const claimed = new Set(this.influencedSpacesByLands(controllerSlot));
    for (const s of spaces) {
      if (claimed.has(s)) {
        return null;
      }
    }
    return spaces;
  }

  /**
   * One-step land placement: validate, spend mana, remove from hand, and add
   * to the land field row with the given influenced spaces.  Returns false
   * without mutating state when any check fails.
   */
  placeLandFromHand(params: {
    controllerSlot: FieldPlayerSlot;
    handIndex: number;
    cardId: string;
    targetRowSlot: FieldPlayerSlot;
    influencedSpaces: number[];
  }): boolean {
    const { controllerSlot, handIndex, cardId, targetRowSlot, influencedSpaces } = params;
    if (!this.gameStarted()) { return false; }
    const turn = this.currentTurn();
    if (turn === null) { return false; }
    const ownerId: 1 | 2 = controllerSlot === 'player1' ? 1 : 2;
    if (turn !== ownerId) { return false; }

    const def = getCardDefinition(cardId);
    if (!def || def.cardType !== 'Land') { return false; }

    const isFree = !hasManaCost(def.manaCost);
    if (isFree && this.placedFreeFieldCardThisTurn()) { return false; }

    if (!this.canPlayLand(controllerSlot, cardId)) { return false; }

    const claimed = new Set(this.influencedSpacesByLands(targetRowSlot));
    for (const s of influencedSpaces) {
      if (claimed.has(s)) { return false; }
    }

    if (!this.trySpendMana(controllerSlot, def.manaCost)) { return false; }

    const hand = controllerSlot === 'player1' ? this.player1Hand : this.player2Hand;
    hand.update((h) => {
      const next = [...h];
      next.splice(handIndex, 1);
      return next;
    });

    const entry = this.createFieldCardEntry(cardId, controllerSlot);
    entry.influencedSpaces = [...influencedSpaces];
    const fieldSig = targetRowSlot === 'player1' ? this.player1FieldLand : this.player2FieldLand;
    fieldSig.update((arr) => [...arr, entry]);

    this.grantImmediateManaFromPlacedLand(controllerSlot, cardId);
    if (isThousandMileWall(def)) {
      this.applyThousandMileWallOnLandPlaced(targetRowSlot, influencedSpaces);
    }
    if (isFree) { this.placedFreeFieldCardThisTurn.set(true); }
    return true;
  }

  /**
   * One-step monster placement: validate, spend mana, remove from hand,
   * and add to the monster field row at the given slot.
   */
  placeMonsterFromHand(params: {
    controllerSlot: FieldPlayerSlot;
    handIndex: number;
    cardId: string;
    fieldSlot: number;
  }): boolean {
    const { controllerSlot, handIndex, cardId, fieldSlot } = params;
    if (!this.gameStarted()) { return false; }
    const turn = this.currentTurn();
    if (turn === null) { return false; }
    const ownerId: 1 | 2 = controllerSlot === 'player1' ? 1 : 2;
    if (turn !== ownerId) { return false; }

    const def = getCardDefinition(cardId);
    if (!def || def.cardType !== 'Monster') { return false; }

    const isFree = !hasManaCost(def.manaCost);
    if (isFree && this.placedFreeFieldCardThisTurn()) { return false; }

    if (fieldSlot < 1 || fieldSlot > MONSTER_FIELD_SLOTS) { return false; }
    if (this.getMonsterBySlot(controllerSlot, fieldSlot)) { return false; }

    if (!this.trySpendMana(controllerSlot, def.manaCost)) { return false; }

    const hand = controllerSlot === 'player1' ? this.player1Hand : this.player2Hand;
    hand.update((h) => {
      const next = [...h];
      next.splice(handIndex, 1);
      return next;
    });

    const entry = this.createFieldCardEntry(cardId, controllerSlot);
    entry.fieldSlot = fieldSlot;
    this.applyKingColossusOnPlaced(controllerSlot, entry);
    const fieldSig =
      controllerSlot === 'player1' ? this.player1FieldMonster : this.player2FieldMonster;
    fieldSig.update((arr) => [...arr, entry]);

    this.applyThousandMileWallOnMonsterPlaced(controllerSlot, fieldSlot);

    if (isFree) { this.placedFreeFieldCardThisTurn.set(true); }
    return true;
  }

  // ── Pending placement (kept for future multi-step flows) ──────────────

  /**
   * Begin space-selection mode after a card was removed from hand.
   * Call from FieldRow.onDropped instead of immediately inserting into the field array.
   */
  beginPendingPlacement(
    cardId: string,
    controllerSlot: FieldPlayerSlot,
    targetZone: FieldZone,
    targetRowSlot: FieldPlayerSlot,
  ): void {
    this.attackMode.set(null);
    const def = getCardDefinition(cardId);
    const spacesNeeded = targetZone === 'monster' ? 1 : (def?.space ?? 1);
    this.pendingPlacement.set({
      cardId,
      controllerSlot,
      targetZone,
      targetRowSlot,
      spacesNeeded,
      selectedSpaces: [],
    });
  }

  /**
   * Player clicked a numbered slot during space-selection mode.
   * Validates and either appends the slot or ignores invalid choices.
   * Automatically finalizes when enough spaces are selected.
   */
  selectPendingSlot(slot: number): void {
    const pending = this.pendingPlacement();
    if (!pending) {
      return;
    }
    if (slot < 1 || slot > MONSTER_FIELD_SLOTS) {
      return;
    }
    if (pending.selectedSpaces.includes(slot)) {
      return;
    }
    if (pending.targetZone === 'monster') {
      const occupied = this.occupiedMonsterSlots(pending.controllerSlot);
      if (occupied.includes(slot)) {
        return;
      }
    }
    if (pending.targetZone === 'land') {
      const claimed = this.influencedSpacesByLands(pending.controllerSlot);
      if (claimed.includes(slot)) {
        return;
      }
    }
    if (pending.selectedSpaces.length > 0) {
      const adjacent = pending.selectedSpaces.some((s) => Math.abs(s - slot) === 1);
      if (!adjacent) {
        return;
      }
    }
    const next: PendingPlacement = {
      ...pending,
      selectedSpaces: [...pending.selectedSpaces, slot].sort((a, b) => a - b),
    };
    if (next.selectedSpaces.length >= next.spacesNeeded) {
      this.finalizePendingPlacement(next);
    } else {
      this.pendingPlacement.set(next);
    }
  }

  /** Cancel pending placement: refund mana and return the card to hand. */
  cancelPendingPlacement(): void {
    const pending = this.pendingPlacement();
    if (!pending) {
      return;
    }
    const def = getCardDefinition(pending.cardId);
    if (def?.manaCost) {
      const pool =
        pending.controllerSlot === 'player1' ? this.player1ManaPool() : this.player2ManaPool();
      const refunded = addManaToPool(pool, def.manaCost);
      if (pending.controllerSlot === 'player1') {
        this.player1ManaPool.set(refunded);
      } else {
        this.player2ManaPool.set(refunded);
      }
    }
    const returnToHand = (h: string[]) => [...h, pending.cardId];
    if (pending.controllerSlot === 'player1') {
      this.player1Hand.update(returnToHand);
    } else {
      this.player2Hand.update(returnToHand);
    }
    this.pendingPlacement.set(null);
  }

  /** Commit a pending card to the field with its selected space(s). */
  private finalizePendingPlacement(pending: PendingPlacement): void {
    const entry = this.createFieldCardEntry(pending.cardId, pending.controllerSlot);
    const def = getCardDefinition(pending.cardId);

    if (pending.targetZone === 'monster') {
      entry.fieldSlot = pending.selectedSpaces[0];
      this.applyKingColossusOnPlaced(pending.controllerSlot, entry);
      const fieldSig =
        pending.controllerSlot === 'player1' ? this.player1FieldMonster : this.player2FieldMonster;
      fieldSig.update((arr) => [...arr, entry]);
      if (entry.fieldSlot !== undefined) {
        this.applyThousandMileWallOnMonsterPlaced(pending.controllerSlot, entry.fieldSlot);
      }
    } else {
      entry.influencedSpaces = [...pending.selectedSpaces];
      const fieldSig =
        pending.targetRowSlot === 'player1' ? this.player1FieldLand : this.player2FieldLand;
      fieldSig.update((arr) => [...arr, entry]);
      this.grantImmediateManaFromPlacedLand(pending.controllerSlot, pending.cardId);
      if (isThousandMileWall(def)) {
        this.applyThousandMileWallOnLandPlaced(pending.targetRowSlot, pending.selectedSpaces);
      }
    }

    if (!hasManaCost(def?.manaCost)) {
      this.placedFreeFieldCardThisTurn.set(true);
    }
    this.pendingPlacement.set(null);
  }
}
