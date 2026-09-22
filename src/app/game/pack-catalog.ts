/** Static pack definitions for Collection UI (mirrors functions pack-catalog). */

export type PackId = 'rock-booster';

export type PackDefinition = {
  id: PackId;
  name: string;
  element: string;
};

export const PACK_CATALOG: Record<PackId, PackDefinition> = {
  'rock-booster': {
    id: 'rock-booster',
    name: 'Rock Booster Pack',
    element: 'Rock',
  },
};

export function getPackDefinition(packId: string): PackDefinition | undefined {
  return PACK_CATALOG[packId as PackId];
}

export function isPackId(value: unknown): value is PackId {
  return typeof value === 'string' && value in PACK_CATALOG;
}
