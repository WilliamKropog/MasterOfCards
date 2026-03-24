import { Component, computed, input } from '@angular/core';
import { Card } from '../card/card';

export type PlayerSlot = 'player1' | 'player2';

@Component({
  selector: 'app-player-hand',
  imports: [Card],
  templateUrl: './player-hand.html',
  styleUrl: './player-hand.css',
})
export class PlayerHand {
  /** Which player this hand belongs to. */
  readonly playerSlot = input.required<PlayerSlot>();

  /** Catalog ids to show in hand order (e.g. `CardIds.rockMonster`). */
  readonly cardIds = input<string[]>([]);

  protected readonly displayLabel = computed(() =>
    this.playerSlot() === 'player1' ? 'Player 1' : 'Player 2',
  );
}
