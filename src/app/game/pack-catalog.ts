/** Static pack definitions for Collection UI (mirrors functions pack-catalog). */

export type PackId = 'rock-booster' | 'rock-starter-tin';

export type PackKind = 'booster' | 'tin';

export type PackShape = 'square' | 'pentagon';

export type PackContentsTone =
  | 'common'
  | 'uncommon'
  | 'rare'
  | 'epic'
  | 'legendary'
  | 'random'
  | 'pack'
  | 'foil';

/** One display line in the pack “What’s included” hover card. */
export type PackContentsLine = {
  count: number;
  label: string;
  tone: PackContentsTone;
};

export type PackDefinition = {
  id: PackId;
  name: string;
  element: string;
  kind: PackKind;
  shape: PackShape;
  /** Summary lines shown on Collection hover / confirm modal. */
  contents: ReadonlyArray<PackContentsLine>;
};

export const PACK_CATALOG: Record<PackId, PackDefinition> = {
  'rock-booster': {
    id: 'rock-booster',
    name: 'Rock Booster Pack',
    element: 'Rock',
    kind: 'booster',
    shape: 'square',
    contents: [
      { count: 3, label: 'Common', tone: 'common' },
      { count: 3, label: 'Uncommon', tone: 'uncommon' },
      { count: 2, label: 'Rare', tone: 'rare' },
      { count: 1, label: 'Random', tone: 'random' },
    ],
  },
  'rock-starter-tin': {
    id: 'rock-starter-tin',
    name: 'Rock Starter Tin',
    element: 'Rock',
    kind: 'tin',
    shape: 'pentagon',
    contents: [
      { count: 4, label: 'Rock Booster Pack', tone: 'pack' },
      { count: 1, label: 'Foil Random', tone: 'foil' },
    ],
  },
};

export function getPackDefinition(packId: string): PackDefinition | undefined {
  return PACK_CATALOG[packId as PackId];
}

export function isPackId(value: unknown): value is PackId {
  return typeof value === 'string' && value in PACK_CATALOG;
}
