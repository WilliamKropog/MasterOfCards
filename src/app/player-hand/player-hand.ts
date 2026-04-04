import { CdkDrag, CdkDragDrop, CdkDropList, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { Component, computed, inject, input } from '@angular/core';
import { Card } from '../card/card';
import type { CardDragPayload } from '../services/card-drag-payload';
import { GameEngineService } from '../services/game-engine.service';

export type PlayerSlot = 'player1' | 'player2';

@Component({
  selector: 'app-player-hand',
  imports: [Card, CdkDropList],
  templateUrl: './player-hand.html',
  styleUrl: './player-hand.css',
})
export class PlayerHand {
  private readonly engine = inject(GameEngineService);

  /** Which player this hand belongs to. */
  readonly playerSlot = input.required<PlayerSlot>();

  /** Catalog ids to show in hand order (e.g. `CardIds.rockMonster`). */
  readonly cardIds = input<string[]>([]);

  protected readonly displayLabel = computed(() =>
    this.playerSlot() === 'player1' ? 'Player 1' : 'Player 2',
  );

  /** Inactive hand uses compact cards once the match has started. */
  protected readonly isHandCollapsed = computed(() => {
    if (!this.engine.gameStarted()) {
      return false;
    }
    const turn = this.engine.currentTurn();
    if (turn === null) {
      return false;
    }
    const mine = this.playerSlot() === 'player1' ? 1 : 2;
    return turn !== mine;
  });

  /**
   * Block drops onto the inactive (collapsed) hand and cross-hand transfers; only the owning
   * player's active hand may receive their own drags.
   */
  protected readonly canEnterHand = (
    drag: CdkDrag<CardDragPayload | null>,
    _drop: CdkDropList,
  ): boolean => {
    if (this.isHandCollapsed()) {
      return false;
    }
    const data = drag.data;
    if (!data?.ownerPlayerSlot) {
      return false;
    }
    return data.ownerPlayerSlot === this.playerSlot();
  };

  protected onHandDropped(event: CdkDragDrop<any>): void {
    if (this.isHandCollapsed()) {
      return;
    }
    if (event.previousContainer !== event.container) {
      const data = event.item.data as CardDragPayload | undefined;
      if (data && data.ownerPlayerSlot !== this.playerSlot()) {
        return;
      }
    }
    if (event.previousContainer === event.container) {
      moveItemInArray(event.container.data as string[], event.previousIndex, event.currentIndex);
    } else {
      transferArrayItem(
        event.previousContainer.data as string[],
        event.container.data as string[],
        event.previousIndex,
        event.currentIndex,
      );
    }
    this.engine.touchDropContainers(event);
  }
}
