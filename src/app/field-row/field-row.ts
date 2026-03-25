import { Component, computed, inject, input } from '@angular/core';
import { CardDragService } from '../services/card-drag.service';
import type { PlayerSlot } from '../player-hand/player-hand';

export type FieldZone = 'land' | 'monster';

@Component({
  selector: 'app-field-row',
  imports: [],
  templateUrl: './field-row.html',
  styleUrl: './field-row.css',
})
export class FieldRow {
  private readonly cardDrag = inject(CardDragService);

  readonly playerSlot = input.required<PlayerSlot>();
  readonly zone = input.required<FieldZone>();

  /** e.g. "Player 1's land row" */
  protected readonly rowLabel = computed(() => {
    const player = this.playerSlot() === 'player1' ? 'Player 1' : 'Player 2';
    const zone = this.zone() === 'land' ? 'land' : 'monster';
    return `${player}'s ${zone} row`;
  });

  /** Pulsing green when dragging a Monster or Land from this player's hand onto the matching row. */
  protected readonly showDropHighlight = computed(() => {
    const drag = this.cardDrag.activeDrag();
    if (!drag || drag.ownerPlayerSlot !== this.playerSlot()) {
      return false;
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
}
