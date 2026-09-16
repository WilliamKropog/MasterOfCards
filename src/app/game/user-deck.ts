/** User-built deck stored under users/{uid}/decks/{deckId}. */

export type DeckKey = 'deck-1' | 'deck-2' | 'deck-3';

/** cdkDropList ids shared by Deck Builder ↔ Card Collection. */
export const DECK_BUILDER_DROP_LIST_ID = 'deck-builder-drop-list';
export const CARD_COLLECTION_DROP_LIST_ID = 'card-collection-drop-list';

export const DECK_TABS: ReadonlyArray<{ key: DeckKey; label: string; enabled: boolean }> = [
  { key: 'deck-1', label: 'Deck 1', enabled: true },
  { key: 'deck-2', label: 'Deck 2', enabled: false },
  { key: 'deck-3', label: 'Deck 3', enabled: false },
];

/**
 * One visual deck slot. Same catalog cards stack here (`ownedCardIds.length` = count).
 */
export interface DeckSlotCard {
  catalogCardId: string;
  name: string;
  rarity: string;
  ownedCardIds: string[];
}

export interface UserDeckDoc {
  deckKey: DeckKey;
  name: string;
  /** Flat owned-card ids (stacks are expanded in slot / catalog order). */
  ownedCardIds: string[];
  isActiveDeck: boolean;
}

/** Shared drag payload between Card Collection ↔ Deck Builder. */
export type DeckBuilderDragPayload = {
  ownedCardId: string;
  catalogCardId: string;
  name: string;
  rarity: string;
  /** Where the drag started. */
  source: 'collection' | 'deck';
};
