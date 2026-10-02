import { CdkDropListGroup } from '@angular/cdk/drag-drop';
import { Component, HostListener, OnDestroy, OnInit, computed, effect, inject, signal } from '@angular/core';
import { Auth, authState } from '@angular/fire/auth';
import { MatButton } from '@angular/material/button';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription, firstValueFrom, take } from 'rxjs';
import { SpellDragLineOverlay } from '../spell-drag-line-overlay/spell-drag-line-overlay';
import { PlayField } from '../play-field/play-field';
import { PlayerDeck } from '../player-deck/player-deck';
import { PlayerHand } from '../player-hand/player-hand';
import { CardDragService } from '../services/card-drag.service';
import { GameEngineService, type FieldPlayerSlot } from '../services/game-engine.service';
import { LiveMatchSyncService } from '../services/live-match-sync.service';
import { MatchmakingService } from '../services/matchmaking.service';

@Component({
  selector: 'app-game-page',
  imports: [MatButton, PlayerDeck, PlayerHand, PlayField, SpellDragLineOverlay, CdkDropListGroup],
  templateUrl: './game-page.html',
  styleUrl: './game-page.css',
})
export class GamePage implements OnInit, OnDestroy {
  protected readonly engine = inject(GameEngineService);
  private readonly auth = inject(Auth);
  private readonly cardDrag = inject(CardDragService);
  private readonly matchmaking = inject(MatchmakingService);
  private readonly liveSync = inject(LiveMatchSyncService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly title = signal('masterofcards');
  protected readonly liveMatchError = signal('');
  /** True from the moment a live match route starts until hands are applied or setup fails. */
  private readonly joiningLiveMatch = signal(false);
  /** Centered loader while the live match is building each player's opening hand. */
  protected readonly matchLoading = computed(
    () => this.joiningLiveMatch() && !this.liveSync.handsReady(),
  );
  /** Centered loader text, or null when the table is ready to play. */
  protected readonly loadingLabel = computed(() => {
    if (this.matchLoading()) {
      return 'Loading match';
    }
    if (this.liveSync.moveLoading()) {
      return 'Loading move';
    }
    return null;
  });

  /** True after the Victory / Defeat title has finished rising. Reveals Return Home. */
  protected readonly resultActionReady = signal(false);

  private fragmentSub: Subscription | null = null;

  constructor() {
    effect(() => {
      const result = this.engine.localMatchResult();
      if (!result) {
        this.resultActionReady.set(false);
        return;
      }
      this.cardDrag.endDrag();
      this.engine.cancelAllTargetModes();
    });
  }

  ngOnInit(): void {
    this.fragmentSub = this.route.fragment.subscribe((fragment) => {
      void this.bootstrapFromFragment(fragment);
    });
  }

  ngOnDestroy(): void {
    this.fragmentSub?.unsubscribe();
    this.liveSync.detach();
  }

  private async bootstrapFromFragment(fragment: string | null): Promise<void> {
    this.liveMatchError.set('');
    this.liveSync.detach();

    if (fragment) {
      this.joiningLiveMatch.set(true);
      const match = await this.matchmaking.loadMatch(fragment);
      if (!match) {
        this.liveMatchError.set('Live match not found.');
        this.engine.resetMatch();
        this.engine.startGame();
        this.joiningLiveMatch.set(false);
        return;
      }

      let user = this.auth.currentUser;
      if (!user) {
        try {
          user = await firstValueFrom(authState(this.auth).pipe(take(1)));
        } catch {
          user = null;
        }
      }
      const myUid = user?.uid;
      const localSlot: FieldPlayerSlot | null =
        myUid === match.player1.uid
          ? 'player1'
          : myUid === match.player2.uid
            ? 'player2'
            : null;

      this.engine.resetMatch();
      this.engine.setLivePlayerNames(
        match.player1.username,
        match.player2.username,
        match.id,
        localSlot,
      );

      try {
        await this.liveSync.attach(match.id);
      } catch (error) {
        const message =
          typeof error === 'object' &&
          error !== null &&
          'message' in error &&
          typeof (error as { message: unknown }).message === 'string'
            ? (error as { message: string }).message
            : 'Could not initialize live match.';
        this.liveMatchError.set(message);
        this.engine.startGame();
        this.joiningLiveMatch.set(false);
      }
      return;
    }

    this.joiningLiveMatch.set(false);
    if (!this.engine.gameStarted()) {
      this.engine.setLivePlayerNames(null, null, null, null);
      this.engine.startGame();
    }
  }

  protected onResultTitleAnimationEnd(event: AnimationEvent): void {
    if (event.target !== event.currentTarget) {
      return;
    }
    this.resultActionReady.set(true);
  }

  protected onEndGameClick(): void {
    this.cardDrag.endDrag();
    this.liveSync.detach();
    this.engine.resetMatch();
    void this.router.navigate(['/']);
  }

  protected async onNextTurnClick(): Promise<void> {
    if (!this.engine.canAdvanceTurn()) {
      return;
    }
    const matchId = this.engine.liveMatchId();
    if (matchId) {
      try {
        this.liveMatchError.set('');
        await this.liveSync.submitEndTurn(matchId);
      } catch (error) {
        const message =
          typeof error === 'object' &&
          error !== null &&
          'message' in error &&
          typeof (error as { message: unknown }).message === 'string'
            ? (error as { message: string }).message
            : 'Could not end turn.';
        this.liveMatchError.set(message);
      }
      return;
    }

    this.engine.nextTurn();
  }

  @HostListener('document:keydown', ['$event'])
  protected onDocumentKeydown(event: KeyboardEvent): void {
    if (this.engine.matchConcluded()) {
      return;
    }
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
    if (this.engine.matchConcluded()) {
      return;
    }
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
