import { CdkDropListGroup } from '@angular/cdk/drag-drop';
import { Component, HostListener, inject, signal } from '@angular/core';
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

  @HostListener('document:keydown', ['$event'])
  protected onDocumentKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.engine.cancelAttackMode();
    }
  }

  /**
   * Clicking outside the attacking card dismisses attack mode (red targets). Clicks on the
   * attacker or on a valid target stay inside the flow (composedPath covers shadow DOM buttons).
   */
  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    if (!this.engine.attackMode()) {
      return;
    }
    let insideAttackSource = false;
    let insideAttackTarget = false;
    for (const n of event.composedPath()) {
      if (!(n instanceof Element)) {
        continue;
      }
      if (n.hasAttribute('data-attack-source')) {
        insideAttackSource = true;
      }
      if (n.classList.contains('card--attack-target')) {
        insideAttackTarget = true;
      }
    }
    if (insideAttackSource || insideAttackTarget) {
      return;
    }
    this.engine.cancelAttackMode();
  }
}
