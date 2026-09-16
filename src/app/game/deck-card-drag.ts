import type { DeckBuilderDragPayload } from './user-deck';

export const DECK_CARD_DRAG_MIME = 'application/x-masterofcards-deck-card';

export function writeDeckCardDragData(
  event: DragEvent,
  payload: DeckBuilderDragPayload,
): void {
  const transfer = event.dataTransfer;
  if (!transfer) {
    return;
  }
  transfer.setData(DECK_CARD_DRAG_MIME, JSON.stringify(payload));
  transfer.setData('text/plain', payload.name);
  transfer.effectAllowed = payload.source === 'collection' ? 'copy' : 'move';
}

export function readDeckCardDragData(event: DragEvent): DeckBuilderDragPayload | null {
  const raw = event.dataTransfer?.getData(DECK_CARD_DRAG_MIME);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as DeckBuilderDragPayload;
    if (
      !parsed ||
      typeof parsed.ownedCardId !== 'string' ||
      typeof parsed.catalogCardId !== 'string' ||
      (parsed.source !== 'collection' && parsed.source !== 'deck')
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function hasDeckCardDragType(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes(DECK_CARD_DRAG_MIME);
}

/** Temporary ghost element used with setDragImage; remove on dragend. */
export function attachDeckCardDragGhost(
  event: DragEvent,
  rarity: string,
): HTMLElement | null {
  const transfer = event.dataTransfer;
  if (!transfer) {
    return null;
  }
  const ghost = document.createElement('div');
  ghost.className = `deck-card-drag-ghost deck-card-drag-ghost--${rarity.toLowerCase()}`;
  ghost.setAttribute('aria-hidden', 'true');
  document.body.appendChild(ghost);
  transfer.setDragImage(ghost, 44, 44);
  return ghost;
}
