import { CreatureCard, SpellCard, LandCard } from "../models/card";

export const ROCK_MONSTER: CreatureCard = {
    id: 'rock-monster',
    cardType: 'Creature',
    name: 'Rock Monster',
    element: 'Rock',
    cost: {},
    rarity: 'Common',
    class: 'Elemental',
    perks: 'Melee',
    imageUrl: '../assets/images/creatures/RockMonster.png',
    description: '',
    stats: {
        attack: 10,
        health: 80,
    },
    abilityIds: [],
    passiveIds: []
};

export const BOULDER_TOSS: SpellCard = {
    id: 'boulder-toss',
    cardType: 'Spell',
    name: 'Boulder Toss',
    element: 'Rock',
    cost: {Rock: 2},
    rarity: 'Common',
    class: 'Spell',
    perks: 'Cast',
    imageUrl: '../assets/images/spells/BoulderToss.png',
    description: 'Toss a large boulder at a target and deal 60 damage (x2 damage if target is a flying creature).',
    effectIds: []
};

export const MOUNTAIN_RANGE: LandCard = {
    id: 'mountain-range',
    cardType: 'Land',
    name: 'Mountain Range',
    element: 'Rock',
    cost: {},
    rarity: 'Uncommon',
    class: 'Land',
    perks: 'Vacant',
    imageUrl: '../assets/images/lands/MountainRange.png',
    description: 'A large mountain range that requires 3 available adjacent tiles to be placed. Immune to Lightning damage.',
    effectIds: [],
    passiveIds: [],
    stats: {
        health: 250
    },
    generation: {Rock: 3, Ice: 2, Air: 2}
};

export const GRAND_GOPHER: CreatureCard = {
    id: 'grand-gopher',
    cardType: 'Creature',
    name: 'Grand Gopher',
    element: 'Rock',
    cost: {},
    rarity: 'Common',
    class: 'Critter',
    perks: 'Melee',
    imageUrl: '../assets/images/creatures/GrandGopher.png',
    description: '[1 Rock Mana] Burrow: Go into defense mode. Restores all health.',
    stats: {
        attack: 10,
        health: 50,
    },
    abilityIds: [],
    passiveIds: []
};

export const TEMPLE_OF_BEING: LandCard = {
    id: 'temple-of-being',
    cardType: 'Land',
    name: 'Temple of Being',
    element: 'Rock',
    cost: {},
    rarity: 'Uncommon',
    class: 'Land',
    perks: 'Locked',
    imageUrl: '../assets/images/lands/TempleOfBeing.png',
    description: 'Can only be placed on an empty, non-occupied enemy tile.',
    effectIds: [],
    passiveIds: [],
    stats: {
        health: 100
    },
    generation: {Rock: 2}
};

export const MUD_HUT: LandCard = {
    id: 'mud-hut',
    cardType: 'Land',
    name: 'Mud Hut',
    element: 'Rock',
    cost: {},
    rarity: 'Common',
    class: 'Land',
    perks: 'Vacant',
    imageUrl: '../assets/images/lands/MudHut.png',
    description: '',
    effectIds: [],
    passiveIds: [],
    stats: {
        health: 80
    },
    generation: {Rock: 2}
};

export const ARMOREDILLO: CreatureCard = {
    id: 'armoredillo',
    cardType: 'Creature',
    name: 'Armoredillo',
    element: 'Rock',
    cost: {},
    rarity: 'Common',
    class: 'Critter',
    perks: 'Melee',
    imageUrl: '../assets/images/creatures/Armoredillo.png',
    description: 'Starts with a +20 Shield when placed.',
    stats: {
        attack: 20,
        health: 20,
    },
    abilityIds: [],
    passiveIds: []
};

export const RUPTAR: CreatureCard = {
    id: 'ruptar',
    cardType: 'Creature',
    name: 'Ruptar',
    element: 'Rock',
    cost: {Rock: 2},
    rarity: 'Uncommon',
    class: 'Dinosaur',
    perks: 'Melee / Reach / Haste',
    imageUrl: '../assets/images/creatures/Ruptar.png',
    description: 'Deal an additional +30 damage when attacking Lightning or Flying targets.',
    stats: {
        attack: 30,
        health: 100,
    },
    abilityIds: [],
    passiveIds: []
};

export const ELDER_GOPHER_STATUE: LandCard = {
    id: 'elder-gopher-statue',
    cardType: 'Land',
    name: 'Elder Gopher Statue',
    element: 'Rock',
    cost: {},
    rarity: 'Uncommon',
    class: 'Land',
    perks: 'Vacant',
    imageUrl: '../assets/images/lands/ElderGopherStatue.png',
    description: 'For every Grand Gopher you have active in play, generate an additional +1 Rock mana.',
    effectIds: [],
    passiveIds: [],
    stats: {
        health: 80
    },
    generation: {Rock: 1}
};

export const ROCK_SLIDE: SpellCard = {
    id: 'rock-slide',
    cardType: 'Spell',
    name: 'Rock Slide',
    element: 'Rock',
    cost: {Rock: 4},
    rarity: 'Rare',
    class: 'Spell',
    perks: 'Cast',
    imageUrl: '../assets/images/spells/RockSlide.png',
    description: 'Deal 120 damage to any enemy land card (Deal 240 damage if target is a fire type land card).',
    effectIds: []
};

export const ROCKTERRIOR: CreatureCard = {
    id: 'rockterrior',
    cardType: 'Creature',
    name: 'Rockterrior',
    element: 'Rock',
    cost: {Rock: 5},
    rarity: 'Rare',
    class: 'Dinosaur',
    perks: 'Melee',
    imageUrl: '../assets/images/creatures/Rockterrior2.png',
    description: '[7 Rock Mana] Tail Smash: Choose any 1 target and deal 80 damage to it (Deal 160 damage if target is Ice type). [One Time Use Only]',
    stats: {
        attack: 30,
        health: 180,
    },
    abilityIds: [],
    passiveIds: []
};

export const EXCAVATION_SITE: LandCard = {
    id: 'excavation-site',
    cardType: 'Land',
    name: 'Excavation Site',
    element: 'Rock',
    cost: {},
    rarity: 'Rare',
    class: 'Land',
    perks: 'Vacant',
    imageUrl: '../assets/images/lands/ExcavationSite.png',
    description: 'If a Dinosaur creature dies on this card, send the Dinosaur card to the bottom of your deck instead of the Graveyard. [One Time Use Only]',
    effectIds: [],
    passiveIds: [],
    stats: {
        health: 90
    },
    generation: {Rock: 2, Sand: 2}
};

export const EARTH_SHATTER: SpellCard = {
    id: 'earth-shatter',
    cardType: 'Spell',
    name: 'Earth Shatter',
    element: 'Rock',
    cost: {Rock: 7},
    rarity: 'Epic',
    class: 'Spell',
    perks: 'Cast',
    imageUrl: '../assets/images/spells/EarthShatter.png',
    description: 'Instantly destroy any one enemy land card and send it to their Graveyard.',
    effectIds: []
};

export const THOUSAND_MILE_WALL: LandCard = {
    id: '1000-mile-wall',
    cardType: 'Land',
    name: '1000 Mile Wall',
    element: 'Rock',
    cost: {Rock: 4},
    rarity: 'Epic',
    class: 'Land',
    perks: 'Vacant',
    imageUrl: '../assets/images/lands/1000MileWall.png',
    description: 'Can only be placed on your entire front row of tiles. Every creature placed on this card gain a +30 Shield while this card is in play.',
    effectIds: [],
    passiveIds: [],
    stats: {
        health: 300
    },
    generation: {Rock: 5}
};

export const KING_COLOSSUS: CreatureCard = {
    id: 'king-colossus',
    cardType: 'Creature',
    name: 'King Colossus',
    element: 'Rock',
    cost: {Rock: 6},
    rarity: 'Legendary',
    class: 'Elemental',
    perks: 'Melee / Trample',
    imageUrl: '../assets/images/creatures/KingColossus.png',
    description: 'King Colossus gains and keeps a Shield equivalent to 10x the amount of Rock mana that is currently in play when placed.',
    stats: {
        attack: 60,
        health: 240,
    },
    abilityIds: [],
    passiveIds: []
};