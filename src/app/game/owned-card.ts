/** Owned card instance stored under users/{uid}/cardCollection/{ownedCardId}. */

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
}
