/** Owned sealed pack instance under users/{uid}/packInventory/{ownedPackId}. */

import type { PackId } from './pack-catalog';

export type PackStatus = 'sealed';

export interface OwnedPack {
  ownedPackId: string;
  packId: PackId;
  status: PackStatus;
  source: string;
}
