/** Owned card instance stored under users/{uid}/cardCollection/{ownedCardId}. */

export type CardSpecialty =
  | 'Default'
  | 'Hollow'
  | 'Reverse Hollow'
  | 'IR'
  | 'SIR';

export interface OwnedCard {
  ownedCardId: string;
  catalogCardId: string;
  cardQuality: number;
  specialty: CardSpecialty;
  skin: string;
  source: string;
}
