import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  onSnapshot,
  orderBy,
  query,
  type Unsubscribe,
} from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { GameEngineService } from './game-engine.service';

export type MatchActionType = 'endTurn';

interface MatchActionDoc {
  seq: number;
  type: MatchActionType;
  byUid: string;
  fromTurn?: number;
  toTurn?: number;
}

@Injectable({ providedIn: 'root' })
export class LiveMatchSyncService {
  private readonly firestore = inject(Firestore);
  private readonly functions = inject(Functions);
  private readonly engine = inject(GameEngineService);

  private actionsUnsub: Unsubscribe | null = null;
  private lastAppliedSeq = 0;
  private activeMatchId: string | null = null;
  private submitting = false;

  /** Start listening to authoritative actions for a live match. */
  attach(matchId: string): void {
    if (this.activeMatchId === matchId && this.actionsUnsub) {
      return;
    }

    this.detach();
    this.activeMatchId = matchId;
    this.lastAppliedSeq = 0;

    const actionsQuery = query(
      collection(this.firestore, 'matches', matchId, 'actions'),
      orderBy('seq', 'asc'),
    );

    this.actionsUnsub = onSnapshot(actionsQuery, (snap) => {
      for (const change of snap.docChanges()) {
        if (change.type !== 'added') {
          continue;
        }
        const data = change.doc.data() as MatchActionDoc;
        if (typeof data.seq !== 'number' || data.seq <= this.lastAppliedSeq) {
          continue;
        }
        this.applyAction(data);
        this.lastAppliedSeq = data.seq;
      }
    });
  }

  detach(): void {
    if (this.actionsUnsub) {
      this.actionsUnsub();
      this.actionsUnsub = null;
    }
    this.activeMatchId = null;
    this.lastAppliedSeq = 0;
  }

  /** Submit an endTurn intent to the Cloud Function (local emulator or production). */
  async submitEndTurn(matchId: string): Promise<void> {
    if (this.submitting) {
      return;
    }
    this.submitting = true;
    try {
      const callable = httpsCallable(this.functions, 'submitMatchAction');
      await callable({ matchId, type: 'endTurn' });
      // Local board updates via actions listener, not here.
    } finally {
      this.submitting = false;
    }
  }

  private applyAction(action: MatchActionDoc): void {
    if (action.type === 'endTurn') {
      // Keep local engine turn in sync with the authoritative log.
      if (this.engine.gameStarted()) {
        this.engine.nextTurn();
      }
    }
  }
}
