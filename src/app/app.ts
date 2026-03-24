import { Component, signal } from '@angular/core';
import { CardIds } from './game/card-catalog';
import { PlayerHand } from './player-hand/player-hand';

@Component({
  selector: 'app-root',
  imports: [PlayerHand],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('masterofcards');

  /** One of each catalog card per player (same composition for both hands for now). */
  protected readonly starterHand: string[] = [
    CardIds.rockMonster,
    CardIds.boulderToss,
    CardIds.mudHut,
  ];
}
