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

  /** Start or restart a local match to a known baseline. */
  resetMatch(): void {
    this.activePlayer.set(1);
  }

  /** Stub — advance turn / pass priority when you add phases. */
  endTurn(): void {
    this.activePlayer.update((p) => (p === 1 ? 2 : 1));
  }
}
