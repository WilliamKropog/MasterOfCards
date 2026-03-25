import { computed, Injectable, signal } from '@angular/core';
import type { CdkDragDrop } from '@angular/cdk/drag-drop';
import { STARTER_HAND } from '../game/card-catalog';

/** Which seat is acting in the match (extend as your rules need). */
export type PlayerId = 1 | 2;

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

  /** Cards played onto each field row (catalog ids). */
  readonly player1FieldLand = signal<string[]>([]);
  readonly player1FieldMonster = signal<string[]>([]);
  readonly player2FieldLand = signal<string[]>([]);
  readonly player2FieldMonster = signal<string[]>([]);

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
   * Round counter. `0` before the game starts; becomes `1` when `startGame()` runs;
   * then increases when both players complete a move in a round.
   */
  readonly turnCounter = signal(0);

  private player1MovedThisRound = false;
  private player2MovedThisRound = false;

  /** Begin the match: turn counter → 1, current turn → Player 1. */
  startGame(): void {
    this.gameStarted.set(true);
    this.turnCounter.set(1);
    this.currentTurn.set(1);
    this.activePlayer.set(1);
    this.player1MovedThisRound = false;
    this.player2MovedThisRound = false;
    this.player1Hand.set([...STARTER_HAND]);
    this.player2Hand.set([...STARTER_HAND]);
    this.player1FieldLand.set([]);
    this.player1FieldMonster.set([]);
    this.player2FieldLand.set([]);
    this.player2FieldMonster.set([]);
  }

  /**
   * CDK mutates list arrays in place; call after `moveItemInArray` / `transferArrayItem`
   * so Angular signals notify dependents.
   */
  touchDropContainers(event: CdkDragDrop<string[]>): void {
    const prev = event.previousContainer.data;
    const next = event.container.data;
    if (prev !== next) {
      this.touchArrayByRef(prev);
    }
    this.touchArrayByRef(next);
  }

  private touchArrayByRef(data: string[]): void {
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

  /**
   * Call when a player successfully finishes a move. After both players have
   * moved this round, `turnCounter` increases by 1 and round flags reset.
   */
  recordMoveComplete(player: PlayerId): void {
    if (!this.gameStarted()) {
      return;
    }
    if (player === 1) {
      this.player1MovedThisRound = true;
    } else {
      this.player2MovedThisRound = true;
    }
    if (this.player1MovedThisRound && this.player2MovedThisRound) {
      this.turnCounter.update((n) => n + 1);
      this.player1MovedThisRound = false;
      this.player2MovedThisRound = false;
    }
  }

  /** Start or restart a local match to a known baseline (pre-game). */
  resetMatch(): void {
    this.gameStarted.set(false);
    this.turnCounter.set(0);
    this.currentTurn.set(null);
    this.activePlayer.set(1);
    this.player1MovedThisRound = false;
    this.player2MovedThisRound = false;
    this.player1Hand.set([...STARTER_HAND]);
    this.player2Hand.set([...STARTER_HAND]);
    this.player1FieldLand.set([]);
    this.player1FieldMonster.set([]);
    this.player2FieldLand.set([]);
    this.player2FieldMonster.set([]);
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
