import { Component, computed, inject, signal } from '@angular/core';
import { getCardDefinition } from '../game/card-catalog';
import type { OwnedCard } from '../game/owned-card';
import { NavBar } from '../nav-bar/nav-bar';
import { SideNav } from '../side-nav/side-nav';
import {
  PackInventoryService,
  type PackStackView,
} from '../services/pack-inventory.service';
import { PackService } from '../services/pack.service';

type PackModalPhase = 'confirm' | 'ripping' | 'reveal' | 'error';

interface RevealedCardView {
  ownedCardId: string;
  catalogCardId: string;
  name: string;
  rarity: string;
}

@Component({
  selector: 'app-collection-page',
  imports: [NavBar, SideNav],
  templateUrl: './collection-page.html',
  styleUrl: './collection-page.css',
})
export class CollectionPage {
  private readonly inventory = inject(PackInventoryService);
  private readonly pack = inject(PackService);

  protected readonly loading = this.inventory.loading;
  protected readonly error = this.inventory.error;
  protected readonly packStacks = this.inventory.packStacks;
  protected readonly opening = this.pack.opening;

  protected readonly modalOpen = signal(false);
  protected readonly modalPhase = signal<PackModalPhase>('confirm');
  protected readonly modalPack = signal<PackStackView | null>(null);
  protected readonly revealedCards = signal<RevealedCardView[]>([]);
  protected readonly modalError = signal<string | null>(null);

  /** Backdrop dismiss allowed except while the pack is ripping / request in flight. */
  protected readonly canDismissBackdrop = computed(() => {
    const phase = this.modalPhase();
    return phase === 'confirm' || phase === 'reveal' || phase === 'error';
  });

  protected onPackClick(stack: PackStackView): void {
    if (this.opening() || this.modalOpen() || stack.count <= 0) {
      return;
    }
    this.modalPack.set(stack);
    this.modalPhase.set('confirm');
    this.revealedCards.set([]);
    this.modalError.set(null);
    this.modalOpen.set(true);
  }

  protected onBackdropClick(): void {
    if (!this.canDismissBackdrop()) {
      return;
    }
    this.closeModal();
  }

  protected onCancelOpen(): void {
    if (this.modalPhase() !== 'confirm') {
      return;
    }
    this.closeModal();
  }

  protected onConfirmOpen(): void {
    const stack = this.modalPack();
    if (!stack || this.modalPhase() !== 'confirm' || this.opening()) {
      return;
    }

    this.modalPhase.set('ripping');
    this.modalError.set(null);

    const ripMs = 900;
    const ripDone = new Promise<void>((resolve) => {
      window.setTimeout(resolve, ripMs);
    });

    void (async () => {
      try {
        const [, cards] = await Promise.all([
          ripDone,
          this.pack.openOwnedPack(stack.ownedPackId),
        ]);
        this.revealedCards.set(cards.map((card) => this.toRevealView(card)));
        this.modalPhase.set('reveal');
      } catch (error) {
        const message =
          typeof error === 'object' &&
          error !== null &&
          'message' in error &&
          typeof (error as { message: unknown }).message === 'string'
            ? (error as { message: string }).message
            : 'Could not open pack.';
        this.modalError.set(message);
        this.modalPhase.set('error');
      }
    })();
  }

  protected onFinishReveal(): void {
    if (this.modalPhase() !== 'reveal' && this.modalPhase() !== 'error') {
      return;
    }
    this.closeModal();
  }

  private closeModal(): void {
    this.modalOpen.set(false);
    this.modalPhase.set('confirm');
    this.modalPack.set(null);
    this.revealedCards.set([]);
    this.modalError.set(null);
    this.pack.clearProgress();
  }

  private toRevealView(card: OwnedCard): RevealedCardView {
    const def = getCardDefinition(card.catalogCardId);
    return {
      ownedCardId: card.ownedCardId,
      catalogCardId: card.catalogCardId,
      name: def?.name ?? card.catalogCardId,
      rarity: def?.rarity ?? 'Common',
    };
  }
}
