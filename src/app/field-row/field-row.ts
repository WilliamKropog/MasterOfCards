import {
  CdkDrag,
  CdkDragDrop,
  CdkDropList,
  moveItemInArray,
  transferArrayItem,
} from '@angular/cdk/drag-drop';
import { Component, computed, inject, input } from '@angular/core';
import { getCardDefinition } from '../game/card-catalog';
import type { CardDragPayload } from '../services/card-drag-payload';
import { CardDragService } from '../services/card-drag.service';
import { GameEngineService } from '../services/game-engine.service';
import { Card } from '../card/card';
import type { PlayerSlot } from '../player-hand/player-hand';

export type FieldZone = 'land' | 'monster';

@Component({
  selector: 'app-field-row',
  imports: [Card, CdkDropList],
  templateUrl: './field-row.html',
  styleUrl: './field-row.css',
})
export class FieldRow {
  private readonly cardDrag = inject(CardDragService);
  private readonly engine = inject(GameEngineService);

  readonly playerSlot = input.required<PlayerSlot>();
  readonly zone = input.required<FieldZone>();

  /** e.g. "Player 1's land row" */
  protected readonly rowLabel = computed(() => {
    const player = this.playerSlot() === 'player1' ? 'Player 1' : 'Player 2';
    const zone = this.zone() === 'land' ? 'land' : 'monster';
    return `${player}'s ${zone} row`;
  });

  protected readonly fieldCards = computed(() => {
    const slot = this.playerSlot();
    const zone = this.zone();
    if (slot === 'player1') {
      return zone === 'land' ? this.engine.player1FieldLand() : this.engine.player1FieldMonster();
    }
    return zone === 'land' ? this.engine.player2FieldLand() : this.engine.player2FieldMonster();
  });

  /** Pulsing green when dragging a Monster or Land from this player's hand onto the matching row. */
  protected readonly showDropHighlight = computed(() => {
    const drag = this.cardDrag.activeDrag();
    if (!drag || drag.ownerPlayerSlot !== this.playerSlot()) {
      return false;
    }
    if (drag.cardType === 'Land' || drag.cardType === 'Monster') {
      const ownerId: 1 | 2 = drag.ownerPlayerSlot === 'player1' ? 1 : 2;
      const turn = this.engine.currentTurn();
      if (this.engine.placedFieldCardThisTurn() && turn === ownerId) {
        return false;
      }
    }
    const zone = this.zone();
    const type = drag.cardType;
    if (zone === 'monster' && type === 'Monster') {
      return true;
    }
    if (zone === 'land' && type === 'Land') {
      return true;
    }
    return false;
  });

  protected readonly canEnterRow = (
    drag: CdkDrag<CardDragPayload | null>,
    _drop: CdkDropList<string[]>,
  ): boolean => {
    const data = drag.data;
    if (!data?.ownerPlayerSlot || data.ownerPlayerSlot !== this.playerSlot()) {
      return false;
    }
    const def = getCardDefinition(data.cardId);
    if (!def) {
      return false;
    }
    if (this.zone() === 'land' && def.cardType !== 'Land') {
      return false;
    }
    if (this.zone() === 'monster' && def.cardType !== 'Monster') {
      return false;
    }
    if (def.cardType === 'Land' || def.cardType === 'Monster') {
      const ownerId: 1 | 2 = data.ownerPlayerSlot === 'player1' ? 1 : 2;
      const turn = this.engine.currentTurn();
      if (this.engine.placedFieldCardThisTurn() && turn === ownerId) {
        return false;
      }
    }
    return true;
  };

  protected onDropped(event: CdkDragDrop<string[]>): void {
    if (event.previousContainer === event.container) {
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
    } else {
      const prevData = event.previousContainer.data;
      const cardId = prevData[event.previousIndex];
      transferArrayItem(
        prevData,
        event.container.data,
        event.previousIndex,
        event.currentIndex,
      );
      if (this.isHandContainer(prevData) && this.isFieldContainer(event.container.data)) {
        const def = getCardDefinition(cardId);
        if (def && (def.cardType === 'Land' || def.cardType === 'Monster')) {
          this.engine.notifyPlacedFieldCardFromHand(prevData);
        }
      }
    }
    this.engine.touchDropContainers(event);
  }

  private isHandContainer(data: string[]): boolean {
    return data === this.engine.player1Hand() || data === this.engine.player2Hand();
  }

  private isFieldContainer(data: string[]): boolean {
    return (
      data === this.engine.player1FieldLand() ||
      data === this.engine.player1FieldMonster() ||
      data === this.engine.player2FieldLand() ||
      data === this.engine.player2FieldMonster()
    );
  }
}
