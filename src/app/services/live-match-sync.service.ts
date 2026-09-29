import { Injectable, inject, signal } from '@angular/core';
import {
  Firestore,
  doc,
  onSnapshot,
  type Unsubscribe,
} from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import type { LiveGameState } from '../game/live-game-state';
import type { PlayerSlot } from '../player-hand/player-hand';
import { GameEngineService } from './game-engine.service';

export type PlayCardRequest =
  | {
      cardId: string;
      handIndex: number;
      fieldSlot: number;
    }
  | {
      cardId: string;
      handIndex: number;
      targetRowSlot: PlayerSlot;
      influencedSpaces: number[];
    };

export type AttackRequest =
  | {
      attackerFieldSlot: number;
      defenderRowSlot: PlayerSlot;
      defenderZone: 'monster' | 'land';
      defenderIdentifier: number;
    }
  | {
      attackerFieldSlot: number;
      defenderPlayerSlot: PlayerSlot;
    };

export type CastSpellRequest =
  | {
      cardId: string;
      handIndex: number;
      defenderRowSlot: PlayerSlot;
      defenderZone: 'monster' | 'land';
      defenderIdentifier: number;
    }
  | {
      cardId: string;
      handIndex: number;
      defenderPlayerSlot: PlayerSlot;
    };

export type UseAbilityRequest =
  | {
      abilityId: 'burrow';
      casterMonsterSlot: number;
    }
  | {
      abilityId: 'tail-smash';
      casterMonsterSlot: number;
      defenderRowSlot: PlayerSlot;
      defenderZone: 'monster' | 'land';
      defenderIdentifier: number;
    }
  | {
      abilityId: 'tail-smash';
      casterMonsterSlot: number;
      defenderPlayerSlot: PlayerSlot;
    }
  | {
      abilityId: 'praise';
      landRowSlot: PlayerSlot;
      landIndex: number;
    };

@Injectable({ providedIn: 'root' })
export class LiveMatchSyncService {
  private readonly firestore = inject(Firestore);
  private readonly functions = inject(Functions);
  private readonly engine = inject(GameEngineService);

  private matchUnsub: Unsubscribe | null = null;
  private activeMatchId: string | null = null;
  private lastAppliedVersion = -1;
  private submitting = false;
  private moveLoadingTimer: ReturnType<typeof setTimeout> | null = null;

  /** True after the first authoritative game state (hands included) is applied. */
  readonly handsReady = signal(false);
  /** True while a live card play has been waiting on the server for at least 1s. */
  readonly moveLoading = signal(false);

  /**
   * Ensure shared gameState exists (server-side, idempotent), then listen for updates.
   */
  async attach(matchId: string): Promise<void> {
    if (this.activeMatchId === matchId && this.matchUnsub) {
      return;
    }

    this.detach();
    this.handsReady.set(false);
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
      this.handsReady.set(true);
    });
  }

  detach(): void {
    if (this.matchUnsub) {
      this.matchUnsub();
      this.matchUnsub = null;
    }
    this.activeMatchId = null;
    this.lastAppliedVersion = -1;
    this.handsReady.set(false);
  }

  async submitEndTurn(matchId: string): Promise<void> {
    await this.submitAction({ matchId, type: 'endTurn' });
  }

  async submitPlayCard(matchId: string, play: PlayCardRequest): Promise<void> {
    await this.submitAction({ matchId, type: 'playCard', ...play }, { loadingMove: true });
  }

  async submitDefend(matchId: string, monsterFieldSlot: number): Promise<void> {
    await this.submitAction({ matchId, type: 'defend', monsterFieldSlot });
  }

  async submitAttack(matchId: string, attack: AttackRequest): Promise<void> {
    await this.submitAction({ matchId, type: 'attack', ...attack });
  }

  async submitCastSpell(matchId: string, spell: CastSpellRequest): Promise<void> {
    await this.submitAction({ matchId, type: 'castSpell', ...spell }, { loadingMove: true });
  }

  async submitUseAbility(matchId: string, ability: UseAbilityRequest): Promise<void> {
    await this.submitAction({ matchId, type: 'useAbility', ...ability });
  }

  private async submitAction(
    payload: Record<string, unknown>,
    options?: { loadingMove?: boolean },
  ): Promise<void> {
    if (this.submitting) {
      return;
    }
    this.submitting = true;
    if (options?.loadingMove) {
      this.clearMoveLoadingTimer();
      this.moveLoadingTimer = setTimeout(() => {
        this.moveLoadingTimer = null;
        this.moveLoading.set(true);
      }, 1000);
    }
    try {
      const callable = httpsCallable(this.functions, 'submitMatchAction');
      await callable(payload);
    } finally {
      this.submitting = false;
      if (options?.loadingMove) {
        this.clearMoveLoadingTimer();
        this.moveLoading.set(false);
      }
    }
  }

  private clearMoveLoadingTimer(): void {
    if (this.moveLoadingTimer !== null) {
      clearTimeout(this.moveLoadingTimer);
      this.moveLoadingTimer = null;
    }
  }
}
