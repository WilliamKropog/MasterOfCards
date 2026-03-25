import type { PlayerSlot } from '../player-hand/player-hand';

/** Attached to `cdkDragData` for drop predicates and CDK transfers. */
export interface CardDragPayload {
  cardId: string;
  ownerPlayerSlot: PlayerSlot;
}
