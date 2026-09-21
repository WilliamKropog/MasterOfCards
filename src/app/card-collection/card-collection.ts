import { Component, computed, inject, signal } from '@angular/core';
import { CARD_CATALOG, type CardDefinition } from '../game/card-catalog';
import {
  attachDeckCardDragGhost,
  hasDeckCardDragType,
  readDeckCardDragData,
  writeDeckCardDragData,
} from '../game/deck-card-drag';
import type { DeckBuilderDragPayload } from '../game/user-deck';
import { CardCollectionService } from '../services/card-collection.service';
import { CardInfoService } from '../services/card-info.service';
import { DeckBuilderService } from '../services/deck-builder.service';

export interface CollectionSlotView {
  catalogCardId: string;
  name: string;
  rarity: string;
  availableCount: number;
  ownedCount: number;
  discovered: boolean;
}

@Component({
  selector: 'app-card-collection',
  imports: [],
  templateUrl: './card-collection.html',
  styleUrl: './card-collection.css',
})
export class CardCollection {
  private readonly collection = inject(CardCollectionService);
  private readonly deckBuilder = inject(DeckBuilderService);
  private readonly cardInfo = inject(CardInfoService);

  protected readonly loading = this.collection.loading;
  protected readonly error = this.collection.error;

  protected readonly isDropTarget = signal(false);
  private dropDepth = 0;
  private dragGhost: HTMLElement | null = null;

  private readonly allSlots = computed((): CollectionSlotView[] => {
    const totals = this.collection.ownedCounts();
    const available = this.deckBuilder.availableCounts();
    return Object.values(CARD_CATALOG).map((def: CardDefinition) => {
      const ownedCount = totals[def.id] ?? 0;
      return {
        catalogCardId: def.id,
        name: def.name,
        rarity: def.rarity,
        ownedCount,
        availableCount: available[def.id] ?? 0,
        discovered: ownedCount > 0,
      };
    });
  });

  protected readonly discoveredSlots = computed((): CollectionSlotView[] => {
    return this.allSlots()
      .filter((slot) => slot.discovered)
      .sort((a, b) => {
        if (a.availableCount !== b.availableCount) {
          return b.availableCount - a.availableCount;
        }
        if (a.ownedCount !== b.ownedCount) {
          return b.ownedCount - a.ownedCount;
        }
        return a.name.localeCompare(b.name);
      });
  });

  protected readonly undiscoveredSlots = computed((): CollectionSlotView[] => {
    return this.allSlots()
      .filter((slot) => !slot.discovered)
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  protected readonly discoveredCount = computed(() => this.discoveredSlots().length);
  protected readonly totalOwned = computed(() => this.collection.ownedCards().length);
  protected readonly catalogTotal = computed(() => Object.keys(CARD_CATALOG).length);

  protected onCardHover(catalogCardId: string): void {
    this.cardInfo.setHoveredCard(catalogCardId);
  }

  protected onCollectionDragStart(event: DragEvent, slot: CollectionSlotView): void {
    const payload = this.payloadFor(slot);
    if (!payload) {
      event.preventDefault();
      return;
    }
    writeDeckCardDragData(event, payload);
    this.deckBuilder.activeDragPayload.set(payload);
    this.dragGhost = attachDeckCardDragGhost(event, slot.rarity);
  }

  protected onCollectionDragEnd(): void {
    this.clearGhost();
    this.deckBuilder.activeDragPayload.set(null);
  }

  protected onPanelDragEnter(event: DragEvent): void {
    if (!this.canAcceptDeckDrag(event)) {
      return;
    }
    event.preventDefault();
    this.dropDepth += 1;
    this.isDropTarget.set(true);
  }

  protected onPanelDragOver(event: DragEvent): void {
    if (!this.canAcceptDeckDrag(event)) {
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  protected onPanelDragLeave(event: DragEvent): void {
    if (!this.canAcceptDeckDrag(event)) {
      return;
    }
    this.dropDepth = Math.max(0, this.dropDepth - 1);
    if (this.dropDepth === 0) {
      this.isDropTarget.set(false);
    }
  }

  protected onPanelDrop(event: DragEvent): void {
    event.preventDefault();
    this.dropDepth = 0;
    this.isDropTarget.set(false);

    const payload =
      readDeckCardDragData(event) ?? this.deckBuilder.activeDragPayload();
    this.deckBuilder.activeDragPayload.set(null);
    if (!payload || payload.source !== 'deck') {
      return;
    }
    this.deckBuilder.returnCardToCollection(payload);
  }

  private payloadFor(slot: CollectionSlotView): DeckBuilderDragPayload | null {
    if (slot.availableCount <= 0) {
      return null;
    }
    const card = this.deckBuilder.peekAvailableCard(slot.catalogCardId);
    return card ? this.deckBuilder.payloadFromOwned(card) : null;
  }

  private canAcceptDeckDrag(event: DragEvent): boolean {
    const active = this.deckBuilder.activeDragPayload();
    if (active) {
      return active.source === 'deck';
    }
    return hasDeckCardDragType(event);
  }

  private clearGhost(): void {
    if (this.dragGhost?.isConnected) {
      this.dragGhost.remove();
    }
    this.dragGhost = null;
  }
}
