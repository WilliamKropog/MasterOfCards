import { Component, computed, inject } from '@angular/core';
import { CARD_CATALOG, type CardDefinition } from '../game/card-catalog';
import { CardCollectionService } from '../services/card-collection.service';

export interface CollectionSlotView {
  catalogCardId: string;
  name: string;
  rarity: string;
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

  protected readonly loading = this.collection.loading;
  protected readonly error = this.collection.error;

  /** All catalog slots with ownership counts (unsorted base list). */
  private readonly allSlots = computed((): CollectionSlotView[] => {
    const counts = this.collection.ownedCounts();
    return Object.values(CARD_CATALOG).map((def: CardDefinition) => {
      const ownedCount = counts[def.id] ?? 0;
      return {
        catalogCardId: def.id,
        name: def.name,
        rarity: def.rarity,
        ownedCount,
        discovered: ownedCount > 0,
      };
    });
  });

  /** Discovered cards: owned count desc, then alphabetical. */
  protected readonly discoveredSlots = computed((): CollectionSlotView[] => {
    return this.allSlots()
      .filter((slot) => slot.discovered)
      .sort((a, b) => {
        if (a.ownedCount !== b.ownedCount) {
          return b.ownedCount - a.ownedCount;
        }
        return a.name.localeCompare(b.name);
      });
  });

  /** Undiscovered cards: alphabetical. */
  protected readonly undiscoveredSlots = computed((): CollectionSlotView[] => {
    return this.allSlots()
      .filter((slot) => !slot.discovered)
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  /** Unique catalog cards the user owns at least one of. */
  protected readonly discoveredCount = computed(() => this.discoveredSlots().length);

  /** Total owned card instances (length of the user's cardCollection). */
  protected readonly totalOwned = computed(() =>
    Object.values(this.collection.ownedCounts()).reduce((sum, count) => sum + count, 0),
  );

  /** Total cards defined in the catalog (grows as new cards are added). */
  protected readonly catalogTotal = computed(() => Object.keys(CARD_CATALOG).length);
}
