import { Injectable, signal } from '@angular/core';

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
  /** Example state — replace/extend with hands, field, life totals, etc. */
  readonly activePlayer = signal<PlayerId>(1);

  /**
   * Full round index (both players have completed a move since last increment).
   * Starts at 1; increases when P1 and P2 have each recorded a completed move.
   */
  readonly turnCounter = signal(1);

  private player1MovedThisRound = false;
  private player2MovedThisRound = false;

  /**
   * Call when a player successfully finishes a move. After both players have
   * moved this round, `turnCounter` increases by 1 and round flags reset.
   */
  recordMoveComplete(player: PlayerId): void {
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

  /** Start or restart a local match to a known baseline. */
  resetMatch(): void {
    this.activePlayer.set(1);
    this.turnCounter.set(1);
    this.player1MovedThisRound = false;
    this.player2MovedThisRound = false;
  }

  /** Stub — advance turn / pass priority when you add phases. */
  endTurn(): void {
    this.activePlayer.update((p) => (p === 1 ? 2 : 1));
  }
}
