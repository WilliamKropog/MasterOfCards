import { Component, computed, signal, inject } from '@angular/core';
import type { DeckBuilderDragPayload, DeckSlotCard } from '../game/user-deck';
import {
  attachDeckCardDragGhost,
  hasDeckCardDragType,
  readDeckCardDragData,
  writeDeckCardDragData,
} from '../game/deck-card-drag';
import { DECK_WEIGHT_MIN_PLAYABLE } from '../game/card-catalog';
import { DeckBuilderService } from '../services/deck-builder.service';
import { CardInfoService } from '../services/card-info.service';

@Component({
  selector: 'app-deck-builder',
  imports: [],
  templateUrl: './deck-builder.html',
  styleUrl: './deck-builder.css',
})
export class DeckBuilder {
  protected readonly deck = inject(DeckBuilderService);
  private readonly cardInfo = inject(CardInfoService);

  protected readonly weightCapacity = this.deck.weightCapacity;
  protected readonly tabs = this.deck.tabs;
  protected readonly activeDeckKey = this.deck.activeDeckKey;
  protected readonly visibleSlots = this.deck.visibleSlots;
  protected readonly filledWeight = this.deck.filledWeight;
  protected readonly filledCount = this.deck.filledCount;
  protected readonly isDirty = this.deck.isDirty;
  protected readonly saving = this.deck.saving;
  protected readonly saveError = this.deck.saveError;

  /** Header weight color: default / ready (≥100) / full (at capacity). */
  protected readonly weightTone = computed((): 'default' | 'ready' | 'full' => {
    const weight = this.filledWeight();
    if (weight >= this.weightCapacity) {
      return 'full';
    }
    if (weight >= DECK_WEIGHT_MIN_PLAYABLE) {
      return 'ready';
    }
    return 'default';
  });

  /** Visual highlight only — no placeholders / layout mutation. */
  protected readonly isDropTarget = signal(false);
  private dropDepth = 0;
  private dragGhost: HTMLElement | null = null;

  protected rarityClass(card: DeckSlotCard): string {
    return 'deck-builder-box--' + (card.rarity || 'Common').toLowerCase();
  }

  protected onCardHover(catalogCardId: string): void {
    this.cardInfo.setHoveredCard(catalogCardId);
  }

  protected onDeckCardDragStart(event: DragEvent, slot: DeckSlotCard): void {
    const payload = this.deck.payloadFromDeckSlot(slot);
    if (!payload) {
      event.preventDefault();
      return;
    }
    writeDeckCardDragData(event, payload);
    this.deck.activeDragPayload.set(payload);
    this.dragGhost = attachDeckCardDragGhost(event, slot.rarity);
  }

  protected onDeckCardDragEnd(): void {
    this.clearGhost();
    this.deck.activeDragPayload.set(null);
  }

  protected onPanelDragEnter(event: DragEvent): void {
    if (!this.canAcceptCollectionDrag(event)) {
      return;
    }
    event.preventDefault();
    this.dropDepth += 1;
    this.isDropTarget.set(true);
  }

  protected onPanelDragOver(event: DragEvent): void {
    if (!this.canAcceptCollectionDrag(event)) {
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  protected onPanelDragLeave(event: DragEvent): void {
    if (!this.canAcceptCollectionDrag(event)) {
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
      readDeckCardDragData(event) ?? this.deck.activeDragPayload();
    this.deck.activeDragPayload.set(null);
    if (!payload || payload.source !== 'collection') {
      return;
    }
    this.deck.placeCardFromCollection(payload, 0);
  }

  protected confirmSave(): void {
    void this.deck.saveChanges();
  }

  protected cancelEdits(): void {
    this.deck.discardChanges();
  }

  private canAcceptCollectionDrag(event: DragEvent): boolean {
    const active = this.deck.activeDragPayload();
    if (active) {
      if (active.source !== 'collection') {
        return false;
      }
      return this.deck.canFitCardWeight(active.weight);
    }
    if (!hasDeckCardDragType(event)) {
      return false;
    }
    // Without payload weight yet, allow highlight if any capacity remains.
    return this.filledWeight() < this.weightCapacity;
  }

  private clearGhost(): void {
    if (this.dragGhost?.isConnected) {
      this.dragGhost.remove();
    }
    this.dragGhost = null;
  }
}
