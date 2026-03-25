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

  beginDrag(payload: ActiveCardDrag): void {
    this.activeDrag.set(payload);
  }

  endDrag(): void {
    this.activeDrag.set(null);
  }
}
