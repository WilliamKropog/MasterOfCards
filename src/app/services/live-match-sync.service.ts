import { Injectable, inject } from '@angular/core';
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

  async submitEndTurn(matchId: string): Promise<void> {
    await this.submitAction({ matchId, type: 'endTurn' });
  }

  async submitPlayCard(matchId: string, play: PlayCardRequest): Promise<void> {
    await this.submitAction({ matchId, type: 'playCard', ...play });
  }

  async submitDefend(matchId: string, monsterFieldSlot: number): Promise<void> {
    await this.submitAction({ matchId, type: 'defend', monsterFieldSlot });
  }

  async submitAttack(matchId: string, attack: AttackRequest): Promise<void> {
    await this.submitAction({ matchId, type: 'attack', ...attack });
  }

  async submitCastSpell(matchId: string, spell: CastSpellRequest): Promise<void> {
    await this.submitAction({ matchId, type: 'castSpell', ...spell });
  }

  async submitUseAbility(matchId: string, ability: UseAbilityRequest): Promise<void> {
    await this.submitAction({ matchId, type: 'useAbility', ...ability });
  }

  private async submitAction(payload: Record<string, unknown>): Promise<void> {
    if (this.submitting) {
      return;
    }
    this.submitting = true;
    try {
      const callable = httpsCallable(this.functions, 'submitMatchAction');
      await callable(payload);
    } finally {
      this.submitting = false;
    }
  }
}
