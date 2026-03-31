import { computed, Injectable, signal } from '@angular/core';
import type { CdkDragDrop } from '@angular/cdk/drag-drop';
import { STARTER_HAND } from '../game/card-catalog';

/** Which seat is acting in the match (extend as your rules need). */
export type PlayerId = 1 | 2;

/** Field row entry: catalog id + turn counter when played (for summoning / tap rules). */
export interface FieldCardEntry {
  cardId: string;
  placedAtTurnCounter: number;
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
  readonly player1Hand = signal<string[]>([...STARTER_HAND]);
  readonly player2Hand = signal<string[]>([...STARTER_HAND]);

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

  /** Kept in sync with `currentTurn` when a game is active. */
  readonly activePlayer = signal<PlayerId>(1);

  /**
   * True after the active player has placed a Land or Monster on the field this turn
   * (required before "Next Turn" is enabled). Spells do not set this.
   */
  readonly placedFieldCardThisTurn = signal(false);

  /** Next Turn is available only after a field placement (Land or Monster) this turn. */
  readonly canAdvanceTurn = computed(() => this.gameStarted() && this.placedFieldCardThisTurn());

  /**
   * Round counter. `0` before the game starts; becomes `1` when `startGame()` runs;
   * then increases by 1 each time both players have pressed Next Turn (full round completes).
   */
  readonly turnCounter = signal(0);

  /** Begin the match: turn counter → 1, current turn → Player 1. */
  startGame(): void {
    this.gameStarted.set(true);
    this.turnCounter.set(1);
    this.currentTurn.set(1);
    this.activePlayer.set(1);
    this.player1Hand.set([...STARTER_HAND]);
    this.player2Hand.set([...STARTER_HAND]);
    this.player1FieldLand.set([]);
    this.player1FieldMonster.set([]);
    this.player2FieldLand.set([]);
    this.player2FieldMonster.set([]);
    this.placedFieldCardThisTurn.set(false);
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
    if (!this.gameStarted() || !this.placedFieldCardThisTurn()) {
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
    this.turnCounter.set(0);
    this.currentTurn.set(null);
    this.activePlayer.set(1);
    this.player1Hand.set([...STARTER_HAND]);
    this.player2Hand.set([...STARTER_HAND]);
    this.player1FieldLand.set([]);
    this.player1FieldMonster.set([]);
    this.player2FieldLand.set([]);
    this.player2FieldMonster.set([]);
    this.placedFieldCardThisTurn.set(false);
  }

  /** Stub — advance turn / pass priority when you add phases. */
  endTurn(): void {
    const next: PlayerId = this.activePlayer() === 1 ? 2 : 1;
    this.activePlayer.set(next);
    if (this.gameStarted()) {
      this.currentTurn.set(next);
    }
  }
}
