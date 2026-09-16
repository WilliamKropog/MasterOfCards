import { Injectable, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { Auth, authState } from '@angular/fire/auth';
import {
  Firestore,
  doc,
  onSnapshot,
  type Unsubscribe,
} from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Subscription } from 'rxjs';
import { DECK_SIZE, getCardDefinition } from '../game/card-catalog';
import type { OwnedCard } from '../game/owned-card';
import {
  DECK_TABS,
  type DeckBuilderDragPayload,
  type DeckKey,
  type DeckSlotCard,
  type UserDeckDoc,
} from '../game/user-deck';
import { CardCollectionService } from './card-collection.service';

type SaveUserDeckRequest = {
  deckKey: DeckKey;
  ownedCardIds: string[];
  isActiveDeck: boolean;
};

type SaveUserDeckResponse = {
  ok: boolean;
  deckKey: DeckKey;
  ownedCardIds: string[];
  isActiveDeck: boolean;
};

@Injectable({ providedIn: 'root' })
export class DeckBuilderService implements OnDestroy {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(Auth);
  private readonly functions = inject(Functions);
  private readonly collection = inject(CardCollectionService);

  readonly tabs = DECK_TABS;
  readonly slotCount = DECK_SIZE;

  /** Only Deck 1 is selectable for now. */
  readonly activeDeckKey = signal<DeckKey>('deck-1');

  /** Filled stacks only (same catalog cards share one entry). */
  readonly draftStacks = signal<DeckSlotCard[]>([]);

  /** Last saved / loaded snapshot for dirty checks + cancel. */
  private readonly savedStacks = signal<DeckSlotCard[]>([]);

  /** Raw ids from the latest deck doc (used to hydrate when ownedCards arrive). */
  private readonly loadedOwnedCardIds = signal<string[]>([]);

  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);

  /**
   * Active HTML5 drag payload (set on dragstart, cleared on dragend).
   * More reliable than dataTransfer during dragover in some browsers.
   */
  readonly activeDragPayload = signal<DeckBuilderDragPayload | null>(null);

  /** Total card instances in the draft (stacked copies count individually). */
  readonly filledCount = computed(() =>
    this.draftStacks().reduce((sum, slot) => sum + slot.ownedCardIds.length, 0),
  );

  readonly isDirty = computed(() => !stacksEqual(this.draftStacks(), this.savedStacks()));

  /**
   * UI slots: filled stacks + one trailing empty slot while under capacity.
   * Starts as a single empty slot when the deck has no cards.
   */
  readonly visibleSlots = computed((): Array<DeckSlotCard | null> => {
    const stacks = this.draftStacks();
    if (this.filledCount() >= this.slotCount) {
      return stacks;
    }
    return [...stacks, null];
  });

  /**
   * Owned cards that can still be dragged into the active deck draft.
   * Excludes cards in other decks and cards already placed in the draft.
   */
  readonly availableCards = computed((): OwnedCard[] => {
    const activeKey = this.activeDeckKey();
    const inDraft = this.draftOwnedIdSet();
    return this.collection.ownedCards().filter((card) => {
      if (inDraft.has(card.ownedCardId)) {
        return false;
      }
      if (!card.deckId) {
        return true;
      }
      return card.deckId === activeKey;
    });
  });

  readonly availableCounts = computed((): Readonly<Record<string, number>> => {
    const counts: Record<string, number> = {};
    for (const card of this.availableCards()) {
      counts[card.catalogCardId] = (counts[card.catalogCardId] ?? 0) + 1;
    }
    return counts;
  });

  private authSub: Subscription | null = null;
  private deckUnsub: Unsubscribe | null = null;

  constructor() {
    this.authSub = authState(this.auth).subscribe((user) => {
      this.detachDeck();
      if (!user) {
        this.loadedOwnedCardIds.set([]);
        this.resetLocal([]);
        return;
      }
      this.attachDeck(user.uid, this.activeDeckKey());
    });

    effect(() => {
      const owned = this.collection.ownedCards();
      const ids = this.loadedOwnedCardIds();
      if (this.isDirty()) {
        return;
      }
      this.resetLocal(this.stacksFromIds(ids, owned));
    });
  }

  availableCount(catalogCardId: string): number {
    return this.availableCounts()[catalogCardId] ?? 0;
  }

  peekAvailableCard(catalogCardId: string): OwnedCard | null {
    return this.availableCards().find((card) => card.catalogCardId === catalogCardId) ?? null;
  }

  payloadFromOwned(card: OwnedCard): DeckBuilderDragPayload {
    const def = getCardDefinition(card.catalogCardId);
    return {
      ownedCardId: card.ownedCardId,
      catalogCardId: card.catalogCardId,
      name: def?.name ?? card.catalogCardId,
      rarity: def?.rarity ?? 'Common',
      source: 'collection',
    };
  }

  payloadFromDeckSlot(slot: DeckSlotCard): DeckBuilderDragPayload | null {
    const ownedCardId = slot.ownedCardIds[slot.ownedCardIds.length - 1];
    if (!ownedCardId) {
      return null;
    }
    return {
      ownedCardId,
      catalogCardId: slot.catalogCardId,
      name: slot.name,
      rarity: slot.rarity,
      source: 'deck',
    };
  }

  /** Whether a drag from collection can land on this visible slot (highlight). */
  canReceiveCollectionCard(catalogCardId: string, slotIndex: number): boolean {
    if (this.filledCount() >= this.slotCount) {
      return false;
    }
    const visible = this.visibleSlots();
    const stacks = this.draftStacks();
    const existingIndex = stacks.findIndex((slot) => slot.catalogCardId === catalogCardId);
    if (existingIndex >= 0) {
      // Stack onto existing pile, or highlight the trailing empty (still merges on drop).
      return slotIndex === existingIndex || visible[slotIndex] === null;
    }
    return visible[slotIndex] === null;
  }

  /**
   * Place one owned instance into the deck.
   * Same catalogCardId always stacks onto the existing pile.
   * New unique cards fill the trailing empty slot (which grows the list by one).
   */
  placeCardFromCollection(payload: DeckBuilderDragPayload, _slotIndex: number): boolean {
    if (payload.source !== 'collection') {
      return false;
    }
    if (this.filledCount() >= this.slotCount) {
      return false;
    }
    if (this.draftOwnedIdSet().has(payload.ownedCardId)) {
      return false;
    }
    const stillAvailable = this.availableCards().some((c) => c.ownedCardId === payload.ownedCardId);
    if (!stillAvailable) {
      return false;
    }

    const stacks = cloneStacks(this.draftStacks());
    const existingIndex = stacks.findIndex((slot) => slot.catalogCardId === payload.catalogCardId);
    if (existingIndex >= 0) {
      stacks[existingIndex]!.ownedCardIds.push(payload.ownedCardId);
      this.draftStacks.set(stacks);
      this.saveError.set(null);
      return true;
    }

    stacks.push({
      catalogCardId: payload.catalogCardId,
      name: payload.name,
      rarity: payload.rarity,
      ownedCardIds: [payload.ownedCardId],
    });
    this.draftStacks.set(stacks);
    this.saveError.set(null);
    return true;
  }

  /** Return one owned instance from the deck draft back to the collection pile. */
  returnCardToCollection(payload: DeckBuilderDragPayload): boolean {
    if (payload.source !== 'deck') {
      return false;
    }
    const stacks = cloneStacks(this.draftStacks());
    const index = stacks.findIndex((slot) => slot.ownedCardIds.includes(payload.ownedCardId));
    if (index < 0) {
      return false;
    }
    const slot = stacks[index]!;
    slot.ownedCardIds = slot.ownedCardIds.filter((id) => id !== payload.ownedCardId);
    if (slot.ownedCardIds.length === 0) {
      stacks.splice(index, 1);
    } else {
      stacks[index] = slot;
    }
    this.draftStacks.set(stacks);
    this.saveError.set(null);
    return true;
  }

  discardChanges(): void {
    this.draftStacks.set(cloneStacks(this.savedStacks()));
    this.saveError.set(null);
  }

  async saveChanges(): Promise<void> {
    if (this.saving() || !this.isDirty()) {
      return;
    }
    if (!this.auth.currentUser?.uid) {
      this.saveError.set('Sign in to save your deck.');
      return;
    }

    const ownedCardIds = this.flattenOwnedCardIds(this.draftStacks());

    this.saving.set(true);
    this.saveError.set(null);
    try {
      const callable = httpsCallable<SaveUserDeckRequest, SaveUserDeckResponse>(
        this.functions,
        'saveUserDeck',
      );
      await callable({
        deckKey: this.activeDeckKey(),
        ownedCardIds,
        isActiveDeck: true,
      });
      this.savedStacks.set(cloneStacks(this.draftStacks()));
      this.loadedOwnedCardIds.set(ownedCardIds);
    } catch (error) {
      const message =
        typeof error === 'object' &&
        error !== null &&
        'message' in error &&
        typeof (error as { message: unknown }).message === 'string'
          ? (error as { message: string }).message
          : 'Could not save deck.';
      this.saveError.set(message);
    } finally {
      this.saving.set(false);
    }
  }

  ngOnDestroy(): void {
    this.authSub?.unsubscribe();
    this.authSub = null;
    this.detachDeck();
  }

  private draftOwnedIdSet(): Set<string> {
    const ids = new Set<string>();
    for (const slot of this.draftStacks()) {
      for (const id of slot.ownedCardIds) {
        ids.add(id);
      }
    }
    return ids;
  }

  private flattenOwnedCardIds(stacks: DeckSlotCard[]): string[] {
    const ids: string[] = [];
    for (const slot of stacks) {
      ids.push(...slot.ownedCardIds);
    }
    return ids;
  }

  private attachDeck(uid: string, deckKey: DeckKey): void {
    const deckRef = doc(this.firestore, 'users', uid, 'decks', deckKey);
    this.deckUnsub = onSnapshot(
      deckRef,
      (snap) => {
        if (!snap.exists()) {
          this.loadedOwnedCardIds.set([]);
          if (!this.isDirty()) {
            this.resetLocal([]);
          }
          return;
        }
        const data = snap.data() as Partial<UserDeckDoc>;
        const ids = Array.isArray(data.ownedCardIds)
          ? data.ownedCardIds.filter((id): id is string => typeof id === 'string')
          : [];
        this.loadedOwnedCardIds.set(ids);
        if (!this.isDirty()) {
          this.resetLocal(this.stacksFromIds(ids, this.collection.ownedCards()));
        } else {
          this.savedStacks.set(cloneStacks(this.stacksFromIds(ids, this.collection.ownedCards())));
        }
      },
      (err) => {
        this.saveError.set(err.message || 'Could not load deck.');
      },
    );
  }

  private detachDeck(): void {
    if (this.deckUnsub) {
      this.deckUnsub();
      this.deckUnsub = null;
    }
  }

  /** Group flat owned ids into stacked visual slots (first-seen catalog order). */
  private stacksFromIds(ids: string[], owned: readonly OwnedCard[]): DeckSlotCard[] {
    const stacks: DeckSlotCard[] = [];
    const stackIndexByCatalog = new Map<string, number>();

    for (const ownedCardId of ids.slice(0, DECK_SIZE)) {
      const card = owned.find((c) => c.ownedCardId === ownedCardId);
      const catalogCardId = card?.catalogCardId ?? '';
      const def = catalogCardId ? getCardDefinition(catalogCardId) : undefined;
      const name = def?.name ?? (catalogCardId || '…');
      const rarity = def?.rarity ?? 'Common';

      const existing = catalogCardId ? stackIndexByCatalog.get(catalogCardId) : undefined;
      if (existing !== undefined && stacks[existing]) {
        stacks[existing]!.ownedCardIds.push(ownedCardId);
        continue;
      }
      stacks.push({
        catalogCardId: catalogCardId || ownedCardId,
        name,
        rarity,
        ownedCardIds: [ownedCardId],
      });
      if (catalogCardId) {
        stackIndexByCatalog.set(catalogCardId, stacks.length - 1);
      }
    }
    return stacks;
  }

  private resetLocal(stacks: DeckSlotCard[]): void {
    const copy = cloneStacks(stacks);
    this.draftStacks.set(copy);
    this.savedStacks.set(cloneStacks(copy));
    this.saveError.set(null);
  }
}

function cloneStacks(stacks: DeckSlotCard[]): DeckSlotCard[] {
  return stacks.map((slot) => ({ ...slot, ownedCardIds: [...slot.ownedCardIds] }));
}

function stacksEqual(a: DeckSlotCard[], b: DeckSlotCard[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    const left = a[i]!;
    const right = b[i]!;
    if (
      left.catalogCardId !== right.catalogCardId ||
      left.ownedCardIds.length !== right.ownedCardIds.length
    ) {
      return false;
    }
    for (let j = 0; j < left.ownedCardIds.length; j++) {
      if (left.ownedCardIds[j] !== right.ownedCardIds[j]) {
        return false;
      }
    }
  }
  return true;
}
