import {
  CdkDrag,
  CdkDragDrop,
  CdkDragPlaceholder,
  CdkDragPreview,
  CdkDragStart,
  CdkDropList,
} from '@angular/cdk/drag-drop';
import { Component, inject } from '@angular/core';
import type { DeckBuilderDragPayload, DeckSlotCard } from '../game/user-deck';
import {
  CARD_COLLECTION_DROP_LIST_ID,
  DECK_BUILDER_DROP_LIST_ID,
} from '../game/user-deck';
import { DeckBuilderService } from '../services/deck-builder.service';

@Component({
  selector: 'app-deck-builder',
  imports: [CdkDropList, CdkDrag, CdkDragPreview, CdkDragPlaceholder],
  templateUrl: './deck-builder.html',
  styleUrl: './deck-builder.css',
})
export class DeckBuilder {
  protected readonly deck = inject(DeckBuilderService);

  protected readonly slotCount = this.deck.slotCount;
  protected readonly tabs = this.deck.tabs;
  protected readonly activeDeckKey = this.deck.activeDeckKey;
  protected readonly visibleSlots = this.deck.visibleSlots;
  protected readonly filledCount = this.deck.filledCount;
  protected readonly isDirty = this.deck.isDirty;
  protected readonly saving = this.deck.saving;
  protected readonly saveError = this.deck.saveError;

  protected readonly dropListId = DECK_BUILDER_DROP_LIST_ID;
  protected readonly connectedTo = [CARD_COLLECTION_DROP_LIST_ID];

  /** Accept any collection card while the deck still has capacity. */
  protected readonly deckEnterPredicate = (drag: CdkDrag): boolean => {
    const payload = drag.data as DeckBuilderDragPayload | null;
    if (!payload || payload.source !== 'collection') {
      return false;
    }
    return this.filledCount() < this.slotCount;
  };

  protected onDeckDropped(event: CdkDragDrop<string>): void {
    // Ignore reshuffles within the deck list.
    if (event.previousContainer === event.container) {
      return;
    }
    const payload = event.item.data as DeckBuilderDragPayload | null;
    if (!payload || payload.source !== 'collection') {
      return;
    }
    this.deck.placeCardFromCollection(payload, 0);
  }

  protected onDeckCardDragStart(event: CdkDragStart, slot: DeckSlotCard): void {
    event.source.data = this.deck.payloadFromDeckSlot(slot);
  }

  protected dragDataFor(slot: DeckSlotCard): DeckBuilderDragPayload | null {
    return this.deck.payloadFromDeckSlot(slot);
  }

  protected rarityClass(card: DeckSlotCard): string {
    return 'deck-builder-box--' + (card.rarity || 'Common').toLowerCase();
  }

  protected confirmSave(): void {
    void this.deck.saveChanges();
  }

  protected cancelEdits(): void {
    this.deck.discardChanges();
  }
}
