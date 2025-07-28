export type ManaType = 'Fire' | 'Water' | 'Rock' | 'Air' | 'Dark' | 'Steel' | 'Lightning' | 'Grass' | 'Ice' | 'Sand' | 'Nuetral';

export type ManaCost = Partial<Record<ManaType, number>>;