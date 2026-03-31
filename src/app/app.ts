import { CdkDropListGroup } from '@angular/cdk/drag-drop';
import { Component, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { PlayField } from './play-field/play-field';
import { PlayerHand } from './player-hand/player-hand';
import { CardDragService } from './services/card-drag.service';
import { GameEngineService } from './services/game-engine.service';

@Component({
  selector: 'app-root',
  imports: [MatButton, PlayerHand, PlayField, CdkDropListGroup],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly engine = inject(GameEngineService);
  private readonly cardDrag = inject(CardDragService);

  protected readonly title = signal('masterofcards');

  protected onStartOrEndClick(): void {
    if (this.engine.gameStarted()) {
      this.cardDrag.endDrag();
      this.engine.resetMatch();
    } else {
      this.engine.startGame();
    }
  }

  protected onNextTurnClick(): void {
    this.engine.nextTurn();
  }
}
