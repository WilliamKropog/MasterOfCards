import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  doc,
  onSnapshot,
  type Unsubscribe,
} from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import type { LiveGameState } from '../game/live-game-state';
import { GameEngineService } from './game-engine.service';

@Injectable({ providedIn: 'root' })
export class LiveMatchSyncService {
  private readonly firestore = inject(Firestore);
  private readonly functions = inject(Functions);
  private readonly engine = inject(GameEngineService);

  private matchUnsub: Unsubscribe | null = null;
  private activeMatchId: string | null = null;
  private lastAppliedVersion = -1;
  private submitting = false;

  /**
   * Ensure shared gameState exists (server-side, idempotent), then listen for updates.
   */
  async attach(matchId: string): Promise<void> {
    if (this.activeMatchId === matchId && this.matchUnsub) {
      return;
    }

    this.detach();
    this.activeMatchId = matchId;
    this.lastAppliedVersion = -1;

    const init = httpsCallable(this.functions, 'initializeLiveMatch');
    await init({ matchId });

    const matchRef = doc(this.firestore, 'matches', matchId);
    this.matchUnsub = onSnapshot(matchRef, (snap) => {
      const data = snap.data();
      const gameState = data?.['gameState'] as LiveGameState | undefined;
      if (!gameState?.gameStarted) {
        return;
      }
      if (typeof gameState.version === 'number' && gameState.version === this.lastAppliedVersion) {
        return;
      }
      this.engine.applyLiveGameState(gameState);
      this.lastAppliedVersion = gameState.version ?? 0;
    });
  }

  detach(): void {
    if (this.matchUnsub) {
      this.matchUnsub();
      this.matchUnsub = null;
    }
    this.activeMatchId = null;
    this.lastAppliedVersion = -1;
  }

  /** Submit an endTurn intent; board updates arrive via gameState listener. */
  async submitEndTurn(matchId: string): Promise<void> {
    if (this.submitting) {
      return;
    }
    this.submitting = true;
    try {
      const callable = httpsCallable(this.functions, 'submitMatchAction');
      await callable({ matchId, type: 'endTurn' });
    } finally {
      this.submitting = false;
    }
  }
}
