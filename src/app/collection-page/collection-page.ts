import { Component, computed, inject, signal } from '@angular/core';
import { getCardDefinition } from '../game/card-catalog';
import type { OwnedCard } from '../game/owned-card';
import {
  getPackDefinition,
  type PackContentsLine,
  type PackId,
  type PackShape,
} from '../game/pack-catalog';
import { NavBar } from '../nav-bar/nav-bar';
import { SideNav } from '../side-nav/side-nav';
import {
  PackInventoryService,
  type PackStackView,
} from '../services/pack-inventory.service';
import { PackService, type GrantedPackView } from '../services/pack.service';

type PackModalPhase = 'confirm' | 'ripping' | 'reveal' | 'error';

interface RevealedCardView {
  kind: 'card';
  ownedCardId: string;
  catalogCardId: string;
  name: string;
  rarity: string;
  floatLabel: string;
  foilLabel: string;
  artLabel: string;
  skinLabel: string;
  /** Special-feature stars (float extremes, skin, foil, art). Max 5. */
  starCount: number;
}

interface RevealedPackView {
  kind: 'pack';
  ownedPackId: string;
  packId: PackId;
  name: string;
  shape: PackShape;
}

type RevealedItemView = RevealedCardView | RevealedPackView;

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
  protected readonly revealedItems = signal<RevealedItemView[]>([]);
  protected readonly modalError = signal<string | null>(null);

  /** Backdrop dismiss allowed except while the pack is ripping / request in flight. */
  protected readonly canDismissBackdrop = computed(() => {
    const phase = this.modalPhase();
    return phase === 'confirm' || phase === 'reveal' || phase === 'error';
  });

  protected contentsFor(packId: string): ReadonlyArray<PackContentsLine> {
    return getPackDefinition(packId)?.contents ?? [];
  }

  protected onPackClick(stack: PackStackView): void {
    if (this.opening() || this.modalOpen() || stack.count <= 0) {
      return;
    }
    this.modalPack.set(stack);
    this.modalPhase.set('confirm');
    this.revealedItems.set([]);
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
        const [, result] = await Promise.all([
          ripDone,
          this.pack.openOwnedPack(stack.ownedPackId),
        ]);
        const items: RevealedItemView[] = [
          ...result.grantedPacks.map((granted) => this.toRevealPackView(granted)),
          ...result.cards.map((card) => this.toRevealCardView(card)),
        ];
        this.revealedItems.set(items);
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
    this.revealedItems.set([]);
    this.modalError.set(null);
    this.pack.clearProgress();
  }

  private toRevealPackView(granted: GrantedPackView): RevealedPackView {
    const def = getPackDefinition(granted.packId);
    return {
      kind: 'pack',
      ownedPackId: granted.ownedPackId,
      packId: granted.packId,
      name: granted.name || def?.name || granted.packId,
      shape: def?.shape ?? 'square',
    };
  }

  private toRevealCardView(card: OwnedCard): RevealedCardView {
    const def = getCardDefinition(card.catalogCardId);
    return {
      kind: 'card',
      ownedCardId: card.ownedCardId,
      catalogCardId: card.catalogCardId,
      name: def?.name ?? card.catalogCardId,
      rarity: def?.rarity ?? 'Common',
      floatLabel: formatFloatLabel(card.cardQuality),
      foilLabel: formatAttrLabel(card.foil),
      artLabel: formatAttrLabel(card.art),
      skinLabel: formatAttrLabel(card.skin),
      starCount: countFeatureStars(card),
    };
  }

  /** Stable track list for rendering N star glyphs. */
  protected starMarks(count: number): number[] {
    return Array.from({ length: count }, (_, i) => i);
  }

  protected trackRevealItem(item: RevealedItemView): string {
    return item.kind === 'card' ? item.ownedCardId : item.ownedPackId;
  }
}

function countFeatureStars(card: OwnedCard): number {
  let stars = 0;
  if (Number.isFinite(card.cardQuality)) {
    if (card.cardQuality <= 0.01) {
      stars += 1;
    }
    if (card.cardQuality >= 0.99) {
      stars += 1;
    }
  }
  if (hasSpecialAttr(card.skin)) {
    stars += 1;
  }
  if (hasSpecialAttr(card.foil)) {
    stars += 1;
  }
  if (hasSpecialAttr(card.art)) {
    stars += 1;
  }
  return Math.min(5, stars);
}

function hasSpecialAttr(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.toLowerCase();
  return normalized !== 'none' && normalized !== 'default';
}

function formatFloatLabel(value: number): string {
  if (!Number.isFinite(value)) {
    return '—';
  }
  // Preserve up to 9 decimals, trim trailing zeros.
  return value.toFixed(9).replace(/\.?0+$/, '') || '0';
}

function formatAttrLabel(value: string | null | undefined): string {
  if (!hasSpecialAttr(value)) {
    return 'Default';
  }
  if (value === 'IR' || value === 'SIR' || value === 'Full Art') {
    return value;
  }
  return value!
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}
