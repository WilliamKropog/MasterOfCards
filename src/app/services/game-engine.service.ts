import { computed, Injectable, signal } from '@angular/core';
import type { CdkDragDrop } from '@angular/cdk/drag-drop';
import {
  aggregateManaFromLandCardIds,
  buildShuffledDeck,
  getCardDefinition,
  OPENING_HAND_SIZE,
  type ManaGenerationMap,
} from '../game/card-catalog';

/** Which seat is acting in the match (extend as your rules need). */
export type PlayerId = 1 | 2;

/** Starting life total per player (win condition: reduce opponent to 0). */
export const STARTING_LIFE_POINTS = 2000;

/** Field row entry: catalog id + turn counter when played (for summoning / tap rules). */
export interface FieldCardEntry {
  cardId: string;
  placedAtTurnCounter: number;
  /** Battle damage; defaults to catalog `maxHealth` when missing. */
  currentHealth?: number;
  /** Monster/land has attacked or been in combat this turn; cleared on Next Turn. */
  hasActedThisTurn?: boolean;
  /** Monster is in defense position (horizontal); cleared when that player’s turn begins. */
  defending?: boolean;
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
  attackerMonsterIndex: number;
}

/**
 * Central place for match state and rule-driven updates.
 * Inject in components with `inject(GameEngineService)` or constructor DI.
 */
@Injectable({
  providedIn: 'root',
})
export class GameEngineService {
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

  /** Mana from lands on the field (catalog `generateMana`, summed per element). */
  readonly player1Mana = computed<ManaGenerationMap>(() =>
    aggregateManaFromLandCardIds(this.player1FieldLand().map((e) => e.cardId)),
  );
  readonly player2Mana = computed<ManaGenerationMap>(() =>
    aggregateManaFromLandCardIds(this.player2FieldLand().map((e) => e.cardId)),
  );

  /** Kept in sync with `currentTurn` when a game is active. */
  readonly activePlayer = signal<PlayerId>(1);

  /**
   * While set, enemy field cards that are legal attack targets shimmer red — among monsters,
   * defending enemies first, then others; lands only when no enemy monsters remain; hand when empty field.
   */
  readonly attackMode = signal<AttackModeState | null>(null);

  /**
   * True after the active player has placed a Land or Monster on the field this turn
   * (required before "Next Turn" is enabled). Spells do not set this.
   */
  readonly placedFieldCardThisTurn = signal(false);

  /**
   * Next Turn after a field placement this turn, or immediately if the active hand has no
   * Land or Monster cards (nothing playable on the field from hand).
   */
  readonly canAdvanceTurn = computed(() => this.mayAdvanceTurn());

  /**
   * Round counter. `0` before the game starts; becomes `1` when `startGame()` runs;
   * then increases by 1 each time both players have pressed Next Turn (full round completes).
   */
  readonly turnCounter = signal(0);

  /** Player life points (game loss at 0). */
  readonly player1LifePoints = signal(STARTING_LIFE_POINTS);
  readonly player2LifePoints = signal(STARTING_LIFE_POINTS);

  /** Begin the match: turn counter → 1, current turn → Player 1. */
  startGame(): void {
    this.player1LifePoints.set(STARTING_LIFE_POINTS);
    this.player2LifePoints.set(STARTING_LIFE_POINTS);
    this.gameStarted.set(true);
    this.turnCounter.set(1);
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
    this.placedFieldCardThisTurn.set(false);
    this.attackMode.set(null);
  }

  /**
   * Begin choosing an attack target for a monster on the field. If the same monster is already
   * selected, toggles attack mode off. Does nothing when the enemy has no cards to attack.
   */
  beginAttackFromMonster(attackerSlot: FieldPlayerSlot, attackerMonsterIndex: number): void {
    if (!this.gameStarted()) {
      return;
    }
    const current = this.attackMode();
    if (
      current &&
      current.attackerSlot === attackerSlot &&
      current.attackerMonsterIndex === attackerMonsterIndex
    ) {
      this.attackMode.set(null);
      return;
    }
    const enemy: FieldPlayerSlot = attackerSlot === 'player1' ? 'player2' : 'player1';
    const enemyMonsters =
      enemy === 'player1' ? this.player1FieldMonster().length : this.player2FieldMonster().length;
    this.attackMode.set({ attackerSlot, attackerMonsterIndex });
  }

  cancelAttackMode(): void {
    this.attackMode.set(null);
  }

  /**
   * Put a monster into defense position for the rest of the opponent’s turn (uses the monster’s
   * action for this turn). Cleared when this player’s next turn starts.
   */
  setMonsterDefending(ownerSlot: FieldPlayerSlot, monsterIndex: number): boolean {
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

    const arr =
      ownerSlot === 'player1' ? this.player1FieldMonster() : this.player2FieldMonster();
    const entry = arr[monsterIndex];
    if (!entry) {
      return false;
    }

    const def = getCardDefinition(entry.cardId);
    if (!def || def.cardType !== 'Monster') {
      return false;
    }

    if (this.turnCounter() <= entry.placedAtTurnCounter) {
      return false;
    }
    if (entry.hasActedThisTurn) {
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
    this.applyFieldEntry(ownerSlot, 'monster', monsterIndex, updated);
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

    const cost = spellDef.manaCost ?? 0;
    if (cost > 0) {
      const pool = casterSlot === 'player1' ? this.player1Mana() : this.player2Mana();
      const available = pool[spellDef.cardElement] ?? 0;
      if (available < cost) {
        return false;
      }
    }

    if (tether.slot === casterSlot) {
      return false;
    }

    const defenderArr = this.getFieldArray(tether.slot, tether.zone);
    const defenderEntry = defenderArr[tether.index];
    if (!defenderEntry) {
      return false;
    }

    const baseDamage = spellDef.damage;
    if (baseDamage === undefined || baseDamage <= 0) {
      return false;
    }

    const defenderDef = getCardDefinition(defenderEntry.cardId);
    if (!defenderDef) {
      return false;
    }

    let amount = baseDamage;
    if (defenderDef.attributes?.includes('Flying')) {
      amount *= 2;
    }

    const defenderHp = defenderEntry.currentHealth ?? defenderDef.maxHealth ?? 0;
    const newHp = Math.max(0, defenderHp - amount);
    const defenderResult: FieldCardEntry = {
      ...defenderEntry,
      currentHealth: newHp,
    };

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

    const cost = spellDef.manaCost ?? 0;
    if (cost > 0) {
      const pool = casterSlot === 'player1' ? this.player1Mana() : this.player2Mana();
      const available = pool[spellDef.cardElement] ?? 0;
      if (available < cost) {
        return false;
      }
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

    this.attackMode.set(null);
    return true;
  }

  /**
   * Resolves combat: attacker and defender deal damage simultaneously, then both are marked
   * as having acted this turn. Cards at 0 or less HP are removed from the field.
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
    const attackerIdx = mode.attackerMonsterIndex;

    const attackerArr =
      attackerSlot === 'player1' ? this.player1FieldMonster() : this.player2FieldMonster();
    const defenderArr = this.getFieldArray(defenderSlot, defenderZone);

    const attackerEntry = attackerArr[attackerIdx];
    const defenderEntry = defenderArr[defenderIndex];
    if (!attackerEntry || !defenderEntry) {
      return;
    }

    const atkDef = getCardDefinition(attackerEntry.cardId);
    const defDef = getCardDefinition(defenderEntry.cardId);
    if (!atkDef || !defDef) {
      return;
    }

    const atkPower = atkDef.attack ?? 0;
    const defPower =
      defenderZone === 'monster' && defenderEntry.defending === true
        ? (defDef.defense ?? defDef.attack ?? 0)
        : (defDef.attack ?? 0);

    const attackerHp = attackerEntry.currentHealth ?? atkDef.maxHealth ?? 0;
    const defenderHp = defenderEntry.currentHealth ?? defDef.maxHealth ?? 0;

    const newDefenderHp = defenderHp - atkPower;
    const newAttackerHp = attackerHp - defPower;

    const attackerResult: FieldCardEntry = {
      ...attackerEntry,
      currentHealth: Math.max(0, newAttackerHp),
      hasActedThisTurn: true,
    };
    const defenderResult: FieldCardEntry = {
      ...defenderEntry,
      currentHealth: Math.max(0, newDefenderHp),
      hasActedThisTurn: true,
    };

    this.attackMode.set(null);

    this.applyFieldEntry(attackerSlot, 'monster', attackerIdx, attackerResult);
    this.applyFieldEntry(defenderSlot, defenderZone, defenderIndex, defenderResult);
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
    const enemyMonsters =
      enemy === 'player1' ? this.player1FieldMonster().length : this.player2FieldMonster().length;
    if (enemyMonsters > 0) {
      return;
    }

    const attackerIdx = mode.attackerMonsterIndex;
    const attackerArr =
      attackerSlot === 'player1' ? this.player1FieldMonster() : this.player2FieldMonster();
    const attackerEntry = attackerArr[attackerIdx];
    if (!attackerEntry) {
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

    const attackerResult: FieldCardEntry = {
      ...attackerEntry,
      hasActedThisTurn: true,
    };

    this.attackMode.set(null);
    this.applyFieldEntry(attackerSlot, 'monster', attackerIdx, attackerResult);
  }

  /**
   * Attack-mode targeting: enemy monsters that are **defending** must be attacked before any
   * non-defending enemy monsters; then lands when no monsters remain; player hand uses separate checks.
   */
  isLegalAttackTargetForAttackMode(
    defenderSlot: FieldPlayerSlot,
    defenderZone: FieldZone,
    defenderIndex: number,
    attackerSlot: FieldPlayerSlot,
  ): boolean {
    const enemy: FieldPlayerSlot = attackerSlot === 'player1' ? 'player2' : 'player1';
    if (defenderSlot !== enemy) {
      return false;
    }
    const enemyMonsterArr =
      enemy === 'player1' ? this.player1FieldMonster() : this.player2FieldMonster();
    const enemyMonsters = enemyMonsterArr.length;
    const enemyLands =
      enemy === 'player1' ? this.player1FieldLand().length : this.player2FieldLand().length;

    if (enemyMonsters > 0) {
      if (defenderZone !== 'monster') {
        return false;
      }
      const targetEntry = enemyMonsterArr[defenderIndex];
      if (!targetEntry) {
        return false;
      }
      const hasDefendingEnemy = enemyMonsterArr.some((e) => e.defending === true);
      if (hasDefendingEnemy) {
        return targetEntry.defending === true;
      }
      return true;
    }
    if (enemyLands > 0) {
      return defenderZone === 'land';
    }
    return false;
  }

  private getFieldArray(slot: FieldPlayerSlot, zone: FieldZone): FieldCardEntry[] {
    if (zone === 'land') {
      return slot === 'player1' ? this.player1FieldLand() : this.player2FieldLand();
    }
    return slot === 'player1' ? this.player1FieldMonster() : this.player2FieldMonster();
  }

  private applyFieldEntry(
    slot: FieldPlayerSlot,
    zone: FieldZone,
    index: number,
    entry: FieldCardEntry,
  ): void {
    const def = getCardDefinition(entry.cardId);
    const maxHp = def?.maxHealth ?? 0;
    const hp = entry.currentHealth ?? maxHp;

    const apply = (arr: FieldCardEntry[]): FieldCardEntry[] => {
      const next = [...arr];
      if (index < 0 || index >= next.length) {
        return arr;
      }
      if (hp <= 0) {
        next.splice(index, 1);
      } else {
        next[index] = entry;
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
  }

  private clearFieldActedFlags(): void {
    const clear = (a: FieldCardEntry[]): FieldCardEntry[] =>
      a.map((e) => ({ ...e, hasActedThisTurn: false }));
    this.player1FieldLand.update(clear);
    this.player1FieldMonster.update(clear);
    this.player2FieldLand.update(clear);
    this.player2FieldMonster.update(clear);
  }

  /** Upright monsters when this player’s turn begins (defense position resets). */
  private clearDefendingForPlayerStartingTurn(playerId: PlayerId): void {
    const clearMonster = (a: FieldCardEntry[]): FieldCardEntry[] =>
      a.map((e) => ({ ...e, defending: false }));
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
    this.placedFieldCardThisTurn.set(true);
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
    this.placedFieldCardThisTurn.set(false);
    this.attackMode.set(null);
    this.clearFieldActedFlags();
    this.clearDefendingForPlayerStartingTurn(next);
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
    this.currentTurn.set(null);
    this.activePlayer.set(1);
    this.player1Hand.set([]);
    this.player2Hand.set([]);
    this.player1FieldLand.set([]);
    this.player1FieldMonster.set([]);
    this.player2FieldLand.set([]);
    this.player2FieldMonster.set([]);
    this.player1Deck.set([]);
    this.player2Deck.set([]);
    this.placedFieldCardThisTurn.set(false);
    this.attackMode.set(null);
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

  /** True when Next Turn is allowed: field card played this turn, or no Land/Monster left in hand. */
  private mayAdvanceTurn(): boolean {
    if (!this.gameStarted()) {
      return false;
    }
    const turn = this.currentTurn();
    if (turn === null) {
      return false;
    }
    const hand = turn === 1 ? this.player1Hand() : this.player2Hand();
    if (!this.handHasLandOrMonster(hand)) {
      return true;
    }
    return this.placedFieldCardThisTurn();
  }

  private handHasLandOrMonster(hand: string[]): boolean {
    for (const id of hand) {
      const def = getCardDefinition(id);
      if (def?.cardType === 'Land' || def?.cardType === 'Monster') {
        return true;
      }
    }
    return false;
  }
}
