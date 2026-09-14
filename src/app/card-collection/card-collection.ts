import { Component, computed, inject } from '@angular/core';
import { CARD_CATALOG, type CardDefinition } from '../game/card-catalog';
import { CardCollectionService } from '../services/card-collection.service';

export interface CollectionSlotView {
  catalogCardId: string;
  name: string;
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

  /** One discovery slot per catalog card (3-across grid → 5 rows for 15 cards). */
  protected readonly slots = computed((): CollectionSlotView[] => {
    const counts = this.collection.ownedCounts();
    return Object.values(CARD_CATALOG).map((def: CardDefinition) => {
      const ownedCount = counts[def.id] ?? 0;
      return {
        catalogCardId: def.id,
        name: def.name,
        ownedCount,
        discovered: ownedCount > 0,
      };
    });
  });

  /** Unique catalog cards the user owns at least one of. */
  protected readonly discoveredCount = computed(
    () => this.slots().filter((slot) => slot.discovered).length,
  );

  /** Total cards defined in the catalog (grows as new cards are added). */
  protected readonly catalogTotal = computed(() => Object.keys(CARD_CATALOG).length);
}
