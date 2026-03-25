import { Component, computed, input } from '@angular/core';
import type { PlayerSlot } from '../player-hand/player-hand';

export type FieldZone = 'land' | 'monster';

@Component({
  selector: 'app-field-row',
  imports: [],
  templateUrl: './field-row.html',
  styleUrl: './field-row.css',
})
export class FieldRow {
  readonly playerSlot = input.required<PlayerSlot>();
  readonly zone = input.required<FieldZone>();

  /** e.g. "Player 1's land row" */
  protected readonly rowLabel = computed(() => {
    const player = this.playerSlot() === 'player1' ? 'Player 1' : 'Player 2';
    const zone = this.zone() === 'land' ? 'land' : 'monster';
    return `${player}'s ${zone} row`;
  });
}
