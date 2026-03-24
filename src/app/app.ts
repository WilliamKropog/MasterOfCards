import { Component, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { CardIds } from './game/card-catalog';
import { PlayField } from './play-field/play-field';
import { PlayerHand } from './player-hand/player-hand';
import { GameEngineService } from './services/game-engine.service';

@Component({
  selector: 'app-root',
  imports: [MatButton, PlayerHand, PlayField],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly engine = inject(GameEngineService);

  protected readonly title = signal('masterofcards');

  /** One of each catalog card per player (same composition for both hands for now). */
  protected readonly starterHand: string[] = [
    CardIds.rockMonster,
    CardIds.boulderToss,
    CardIds.mudHut,
  ];
}
