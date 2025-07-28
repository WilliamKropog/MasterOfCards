import { ManaCost } from "./mana";

export type Rarity = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary';
export type Element = 'Fire' | 'Water' | 'Rock' | 'Air' | 'Dark' | 'Steel' | 'Lightning' | 'Grass' | 'Ice' | 'Sand' | 'Nuetral';

export interface CardBase {
    id: String;
    name: string;
    element: Element;
    cost: ManaCost;
    rarity: Rarity;
    class: string;
    perks: string;
    imageUrl: string;
    description: string;
}

export interface CreatureCard extends CardBase {
    cardType: 'Creature';
    stats: {
        attack: number;
        health: number;
    };
    abilityIds?: string[];
    passiveIds?: string[];
}

export interface SpellCard extends CardBase {
    cardType: 'Spell';
    effectIds: string[];
}

export interface LandCard extends CardBase {
    cardType: 'Land';
    stats: {
        health: number;
    };
    effectIds?: string[];
    passiveIds?: string[];
    generation: ManaCost;
}

export type Card = CreatureCard | SpellCard | LandCard;