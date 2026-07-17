import { Injectable, signal } from '@angular/core';
import type { PlayerSlot } from '../player-hand/player-hand';

/** While the user is dragging a card from a hand (for field highlights / future drop rules). */
export interface ActiveCardDrag {
  cardId: string;
  cardType: string;
  ownerPlayerSlot: PlayerSlot;
}

@Injectable({
  providedIn: 'root',
})
export class CardDragService {
  readonly activeDrag = signal<ActiveCardDrag | null>(null);

  /** Monster-row spaces (1–9) that will be influenced if the land card is released here. */
  readonly landPreviewSpaces = signal<number[]>([]);

  /** Monster-row slot (1–9) where a monster will be placed if released here, or null. */
  readonly monsterPreviewSlot = signal<number | null>(null);

  beginDrag(payload: ActiveCardDrag): void {
    this.activeDrag.set(payload);
  }

  endDrag(): void {
    this.activeDrag.set(null);
    this.landPreviewSpaces.set([]);
    this.monsterPreviewSlot.set(null);
  }

  updateLandPreview(spaces: number[]): void {
    this.landPreviewSpaces.set(spaces);
  }

  clearLandPreview(): void {
    this.landPreviewSpaces.set([]);
  }

  updateMonsterPreview(slot: number | null): void {
    this.monsterPreviewSlot.set(slot);
  }
}
