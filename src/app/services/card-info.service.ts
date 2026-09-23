import { Injectable, computed, signal } from '@angular/core';
import { getCardDefinition, type CardDefinition } from '../game/card-catalog';

/**
 * Shared hover/preview state for the Deck Builder page Card Info panel.
 * Collection and Deck Builder set the catalog id on card hover.
 */
@Injectable({ providedIn: 'root' })
export class CardInfoService {
  private readonly hoveredCatalogCardId = signal<string | null>(null);

  readonly card = computed((): CardDefinition | null => {
    const id = this.hoveredCatalogCardId();
    if (!id) {
      return null;
    }
    return getCardDefinition(id) ?? null;
  });

  setHoveredCard(catalogCardId: string): void {
    this.hoveredCatalogCardId.set(catalogCardId);
  }
}
