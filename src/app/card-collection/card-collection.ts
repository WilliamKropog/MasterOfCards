import {
  CdkDrag,
  CdkDragDrop,
  CdkDragPlaceholder,
  CdkDragPreview,
  CdkDragStart,
  CdkDropList,
} from '@angular/cdk/drag-drop';
import { Component, computed, inject } from '@angular/core';
import { CARD_CATALOG, type CardDefinition } from '../game/card-catalog';
import type { DeckBuilderDragPayload } from '../game/user-deck';
import {
  CARD_COLLECTION_DROP_LIST_ID,
  DECK_BUILDER_DROP_LIST_ID,
} from '../game/user-deck';
import { CardCollectionService } from '../services/card-collection.service';
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
  imports: [CdkDropList, CdkDrag, CdkDragPreview, CdkDragPlaceholder],
  templateUrl: './card-collection.html',
  styleUrl: './card-collection.css',
})
export class CardCollection {
  private readonly collection = inject(CardCollectionService);
  private readonly deckBuilder = inject(DeckBuilderService);

  protected readonly loading = this.collection.loading;
  protected readonly error = this.collection.error;

  protected readonly dropListId = CARD_COLLECTION_DROP_LIST_ID;
  protected readonly connectedTo = [DECK_BUILDER_DROP_LIST_ID];

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

  /** Accept returns from the deck only (not reshuffles from this list). */
  protected readonly collectionEnterPredicate = (drag: CdkDrag): boolean =>
    (drag.data as DeckBuilderDragPayload | null)?.source === 'deck';

  protected onCollectionDragStart(event: CdkDragStart, slot: CollectionSlotView): void {
    event.source.data = this.dragDataFor(slot);
  }

  protected dragDataFor(slot: CollectionSlotView): DeckBuilderDragPayload | null {
    if (slot.availableCount <= 0) {
      return null;
    }
    const card = this.deckBuilder.peekAvailableCard(slot.catalogCardId);
    return card ? this.deckBuilder.payloadFromOwned(card) : null;
  }

  protected onCollectionDropped(event: CdkDragDrop<string>): void {
    if (event.previousContainer === event.container) {
      return;
    }
    const payload = event.item.data as DeckBuilderDragPayload | null;
    if (!payload || payload.source !== 'deck') {
      return;
    }
    this.deckBuilder.returnCardToCollection(payload);
  }
}
