import { Component, computed, inject, input } from '@angular/core';
import { GameEngineService } from '../services/game-engine.service';
import type { PlayerSlot } from '../player-hand/player-hand';

@Component({
  selector: 'app-player-deck',
  imports: [],
  templateUrl: './player-deck.html',
  styleUrl: './player-deck.css',
})
export class PlayerDeck {
  private readonly engine = inject(GameEngineService);

  readonly playerSlot = input.required<PlayerSlot>();

  protected readonly gameStarted = computed(() => this.engine.gameStarted());

  protected readonly deckCount = computed(() => {
    return this.playerSlot() === 'player1'
      ? this.engine.player1Deck().length
      : this.engine.player2Deck().length;
  });

  protected readonly ariaLabel = computed(() => {
    const who = this.playerSlot() === 'player1' ? 'Player 1' : 'Player 2';
    const n = this.deckCount();
    return this.gameStarted() ? `${who} deck, ${n} cards` : `${who} deck`;
  });
}
