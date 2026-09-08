import { CdkDropListGroup } from '@angular/cdk/drag-drop';
import { Component, HostListener, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { SpellDragLineOverlay } from '../spell-drag-line-overlay/spell-drag-line-overlay';
import { PlayField } from '../play-field/play-field';
import { PlayerDeck } from '../player-deck/player-deck';
import { PlayerHand } from '../player-hand/player-hand';
import { CardDragService } from '../services/card-drag.service';
import { GameEngineService } from '../services/game-engine.service';
import { MatchmakingService } from '../services/matchmaking.service';

@Component({
  selector: 'app-game-page',
  imports: [MatButton, PlayerDeck, PlayerHand, PlayField, SpellDragLineOverlay, CdkDropListGroup],
  templateUrl: './game-page.html',
  styleUrl: './game-page.css',
})
export class GamePage implements OnInit, OnDestroy {
  protected readonly engine = inject(GameEngineService);
  private readonly cardDrag = inject(CardDragService);
  private readonly matchmaking = inject(MatchmakingService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly title = signal('masterofcards');
  protected readonly liveMatchError = signal('');

  private fragmentSub: Subscription | null = null;

  ngOnInit(): void {
    this.fragmentSub = this.route.fragment.subscribe((fragment) => {
      void this.bootstrapFromFragment(fragment);
    });
  }

  ngOnDestroy(): void {
    this.fragmentSub?.unsubscribe();
  }

  private async bootstrapFromFragment(fragment: string | null): Promise<void> {
    this.liveMatchError.set('');

    if (fragment) {
      const match = await this.matchmaking.loadMatch(fragment);
      if (!match) {
        this.liveMatchError.set('Live match not found.');
        this.engine.resetMatch();
        this.engine.startGame();
        return;
      }

      this.engine.resetMatch();
      this.engine.setLivePlayerNames(
        match.player1.username,
        match.player2.username,
        match.id,
      );
      this.engine.startGame();
      return;
    }

    if (!this.engine.gameStarted()) {
      this.engine.setLivePlayerNames(null, null, null);
      this.engine.startGame();
    }
  }

  protected onEndGameClick(): void {
    this.cardDrag.endDrag();
    this.engine.resetMatch();
    void this.router.navigate(['/']);
  }

  protected onNextTurnClick(): void {
    this.engine.nextTurn();
  }

  @HostListener('document:keydown', ['$event'])
  protected onDocumentKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.engine.cancelAllTargetModes();
    }
  }

  /**
   * Clicking outside the attacking / ability-casting card dismisses targeting mode.
   * Clicks on the source or on a valid target stay inside the flow.
   */
  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    if (!this.engine.attackMode() && !this.engine.abilityTargetMode()) {
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
      if (n.classList.contains('player-hand--attack-target')) {
        insideAttackTarget = true;
      }
    }
    if (insideAttackSource || insideAttackTarget) {
      return;
    }
    this.engine.cancelAllTargetModes();
  }
}
