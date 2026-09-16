/** Owned card instance stored under users/{uid}/cardCollection/{ownedCardId}. */

import type { DeckKey } from './user-deck';

export type CardSpecialty =
  | 'Default'
  | 'Hollow'
  | 'Reverse Hollow'
  | 'IR'
  | 'SIR';

export type CardFoil =
  | 'none'
  | 'holo'
  | 'reverse holo'
  | 'rainbow'
  | 'shattered'
  | 'galaxy';

export interface OwnedCard {
  ownedCardId: string;
  catalogCardId: string;
  /** Quality in [0, 1] with 9 decimal places (e.g. 0.574837401). */
  cardQuality: number;
  specialty: CardSpecialty;
  foil: CardFoil;
  skin: string;
  source: string;
  /**
   * When set, this instance is assigned to that user deck and is not available
   * in the free collection pile (unless removed from the deck draft).
   */
  deckId?: DeckKey | null;
}
