import { CdkDrag, CdkDragEnd, type CdkDragMove } from '@angular/cdk/drag-drop';
import { Component, computed, inject, input } from '@angular/core';
import { MatButton } from '@angular/material/button';
import {
  canAffordManaCost,
  effectiveLandBuildTime,
  effectiveLandSpace,
  formatManaCostForDisplay,
  formatManaGenerationMap,
  getCardDefinition,
  hasManaCost,
  isLandStillBuilding,
  remainingLandBuildTurns,
} from '../game/card-catalog';
import type { CardDragPayload } from '../services/card-drag-payload';
import { CardDragService } from '../services/card-drag.service';
import { SpellDragLineService } from '../services/spell-drag-line.service';
import { GameEngineService, type FieldZone } from '../services/game-engine.service';
import type { PlayerSlot } from '../player-hand/player-hand';

@Component({
  selector: 'app-card',
  imports: [CdkDrag, MatButton],
  templateUrl: './card.html',
  styleUrl: './card.css',
})
export class Card {
  private readonly engine = inject(GameEngineService);
  private readonly cardDrag = inject(CardDragService);
  private readonly spellDragLine = inject(SpellDragLineService);

  /** Lookup key in `CARD_CATALOG` — pass only this from parents when possible. */
  readonly cardId = input.required<string>();

  /** Hand / controller — who owns the card (mana, build timer, hand drag). */
  readonly ownerPlayerSlot = input<PlayerSlot | null>(null);

  /** Which player's field row this card sits in (may differ from owner for Temple of Being). */
  readonly fieldRowSlot = input<PlayerSlot | null>(null);

  /**
   * Battle/runtime override. When unset, creatures/lands use catalog `maxHealth`.
   * Spells typically omit this.
   */
  readonly currentHealth = input<number | undefined>(undefined);

  /** Minimal face: name + current health only (inactive player hand). */
  readonly compact = input(false);

  /** True when rendered in a player hand (enables tighter margins for overlapping layout). */
  readonly inPlayerHand = input(false);

  /** Cards on the field are not draggable back to hand (for now). */
  readonly onField = input(false);

  /**
   * Turn counter when this card was placed on the field (land/monster). Used for
   * "can't act until your next turn" and the monster field-ready highlight.
   */
  readonly placedAtTurnCounter = input<number | null>(null);

  /** Land vs monster row; set when `onField` is true. */
  readonly fieldZone = input<FieldZone | null>(null);

  /** Index in that row’s field list (for attack mode source identity). */
  readonly fieldCardIndex = input<number | null>(null);

  /** Index in the parent hand list; set for hand cards so spell cast can remove the correct copy. */
  readonly handIndex = input<number | undefined>(undefined);

  private readonly def = computed(() => getCardDefinition(this.cardId()));

  /** Live field row entry (HP / acted flags); null when not on the field. */
  private readonly fieldEntry = computed(() => {
    if (!this.onField()) {
      return null;
    }
    const idx = this.fieldCardIndex();
    const rowSlot = this.fieldRowSlot() ?? this.ownerPlayerSlot();
    const zone = this.fieldZone();
    if (idx === null || rowSlot === null || zone === null) {
      return null;
    }
    const arr =
      zone === 'land'
        ? rowSlot === 'player1'
          ? this.engine.player1FieldLand()
          : this.engine.player2FieldLand()
        : rowSlot === 'player1'
          ? this.engine.player1FieldMonster()
          : this.engine.player2FieldMonster();
    return arr[idx] ?? null;
  });

  /**
   * One land or monster per turn: after placing on the field, other lands/monsters in this
   * player's hand cannot be dragged until next turn (spells may still be played).
   */
  private readonly fieldLandOrMonsterLocked = computed(() => {
    if (this.onField() || this.compact()) {
      return false;
    }
    const slot = this.ownerPlayerSlot();
    if (slot === null || !this.engine.gameStarted() || !this.engine.placedFieldCardThisTurn()) {
      return false;
    }
    const turn = this.engine.currentTurn();
    if (turn === null) {
      return false;
    }
    const slotId: 1 | 2 = slot === 'player1' ? 1 : 2;
    if (slotId !== turn) {
      return false;
    }
    const type = this.def()?.cardType;
    return type === 'Land' || type === 'Monster';
  });

  /**
   * Cards with `manaCost` require each listed element from lands on the field (mana is not spent
   * when playing; pool is always “available” while lands stay in play).
   */
  private readonly cannotAffordManaCostInHand = computed(() => {
    if (!this.inPlayerHand()) {
      return false;
    }
    const def = this.def();
    if (!def || !hasManaCost(def.manaCost)) {
      return false;
    }
    const slot = this.ownerPlayerSlot();
    if (slot === null) {
      return true;
    }
    const pool = slot === 'player1' ? this.engine.player1Mana() : this.engine.player2Mana();
    return !canAffordManaCost(pool, def.manaCost);
  });

  /** Land in hand that would exceed this player's land capacity cannot be played. */
  private readonly exceedsLandCapacityInHand = computed(() => {
    if (!this.inPlayerHand()) {
      return false;
    }
    const def = this.def();
    if (!def || def.cardType !== 'Land') {
      return false;
    }
    const slot = this.ownerPlayerSlot();
    if (slot === null) {
      return true;
    }
    return !this.engine.canPlayLand(slot, this.cardId());
  });

  /** No drag before Start, when collapsed, on the field, when land/monster slot used this turn, or when mana cost isn’t met. */
  protected readonly dragDisabled = computed(
    () =>
      this.compact() ||
      !this.engine.gameStarted() ||
      this.onField() ||
      this.fieldLandOrMonsterLocked() ||
      this.cannotAffordManaCostInHand() ||
      this.exceedsLandCapacityInHand(),
  );

  /** Subtle gold hint on cards that can be dragged this turn (active hand). */
  protected readonly playableHighlight = computed(() => !this.dragDisabled());

  /**
   * Light blue glisten: monsters on field can act (attack/abilities) on the owner's turn once
   * `turnCounter` has advanced past the turn they were played. Lands are passive and never get this.
   */
  protected readonly fieldReadyHighlight = computed(() => {
    if (!this.onField() || !this.engine.gameStarted()) {
      return false;
    }
    const placedAt = this.placedAtTurnCounter();
    if (placedAt === null) {
      return false;
    }
    const type = this.def()?.cardType;
    if (type !== 'Monster') {
      return false;
    }
    if (this.fieldEntry()?.hasActedThisTurn) {
      return false;
    }
    const slot = this.ownerPlayerSlot();
    if (slot === null) {
      return false;
    }
    const slotId: 1 | 2 = slot === 'player1' ? 1 : 2;
    const turn = this.engine.currentTurn();
    if (turn === null || turn !== slotId) {
      return false;
    }
    return this.engine.turnCounter() > placedAt;
  });

  /** Monster on field is in defense position (horizontal). */
  protected readonly isDefending = computed(() => {
    if (!this.onField() || this.fieldZone() !== 'monster') {
      return false;
    }
    return this.fieldEntry()?.defending === true;
  });

  /** Land on field still within catalog `buildTime` (horizontal, under construction). */
  protected readonly isLandUnderConstruction = computed(() => {
    if (!this.onField() || this.fieldZone() !== 'land') {
      return false;
    }
    const slot = this.ownerPlayerSlot();
    const placedAtOwner = this.fieldEntry()?.placedAtOwnerTurnCounter;
    if (slot === null || placedAtOwner === undefined) {
      return false;
    }
    return isLandStillBuilding(
      this.def(),
      placedAtOwner,
      this.engine.ownerTurnCounter(slot),
    );
  });

  /** Mighty Gopher-only: show Burrow ability button when awake/ready. */
  protected readonly showBurrowAbility = computed(() => {
    if (!this.onField() || this.fieldZone() !== 'monster') {
      return false;
    }
    if (!this.fieldReadyHighlight()) {
      return false;
    }
    return this.cardId() === 'mighty-gopher';
  });

  /** Burrow requires 1 Rock mana; button is disabled if you can't afford it. */
  protected readonly burrowDisabled = computed(() => {
    if (!this.showBurrowAbility()) {
      return true;
    }
    const slot = this.ownerPlayerSlot();
    if (slot === null) {
      return true;
    }
    const pool = slot === 'player1' ? this.engine.player1Mana() : this.engine.player2Mana();
    return (pool['Rock'] ?? 0) < 1;
  });

  /**
   * Red shimmer: this card is a legal target while the owner’s monster is in attack mode.
   * Mirrors {@link GameEngineService.isLegalAttackTargetForAttackMode} (defending monsters first).
   */
  protected readonly attackTargetHighlight = computed(() => {
    if (!this.onField() || !this.engine.gameStarted()) {
      return false;
    }
    if (this.cardDrag.activeDrag()?.cardType === 'Spell') {
      return false;
    }
    const zone = this.fieldZone();
    const rowSlot = this.fieldRowSlot() ?? this.ownerPlayerSlot();
    const idx = this.fieldCardIndex();
    if (zone === null || rowSlot === null || idx === null) {
      return false;
    }
    const mode = this.engine.attackMode();
    if (!mode) {
      return false;
    }
    return this.engine.isLegalAttackTargetForAttackMode(rowSlot, zone, idx, mode.attackerSlot);
  });

  /**
   * Soft red pulse on enemy lands/monsters while the active player drags a spell (e.g. direct damage).
   */
  protected readonly spellTargetHighlight = computed(() => {
    if (!this.onField() || !this.engine.gameStarted()) {
      return false;
    }
    const drag = this.cardDrag.activeDrag();
    if (!drag || drag.cardType !== 'Spell') {
      return false;
    }
    if (this.fieldEntry()?.spellImmune === true) {
      return false;
    }
    const turn = this.engine.currentTurn();
    if (turn === null) {
      return false;
    }
    const casterId: 1 | 2 = drag.ownerPlayerSlot === 'player1' ? 1 : 2;
    if (turn !== casterId) {
      return false;
    }
    const controller = this.ownerPlayerSlot();
    if (controller === null || controller === drag.ownerPlayerSlot) {
      return false;
    }
    const type = this.def()?.cardType;
    return type === 'Land' || type === 'Monster';
  });

  /** Full-card red tether highlight: this field card is the spell snap-line target. */
  protected readonly spellTetherHighlight = computed(() => {
    const t = this.spellDragLine.tetherTarget();
    if (t === null) {
      return false;
    }
    const rowSlot = this.fieldRowSlot() ?? this.ownerPlayerSlot();
    const zone = this.fieldZone();
    const idx = this.fieldCardIndex();
    if (rowSlot === null || zone === null || idx === null) {
      return false;
    }
    return t.slot === rowSlot && t.zone === zone && t.index === idx;
  });

  /** Marks the card that opened attack mode (for click-outside detection on the host). */
  protected readonly isAttackSource = computed(() => {
    const mode = this.engine.attackMode();
    if (!mode || !this.onField()) {
      return false;
    }
    const slot = this.ownerPlayerSlot();
    const idx = this.fieldCardIndex();
    if (slot === null || idx === null) {
      return false;
    }
    return mode.attackerSlot === slot && mode.attackerMonsterIndex === idx;
  });

  protected readonly dragPayload = computed((): CardDragPayload | null => {
    const slot = this.ownerPlayerSlot();
    if (slot === null) {
      return null;
    }
    const hi = this.handIndex();
    const base: CardDragPayload = { cardId: this.cardId(), ownerPlayerSlot: slot };
    return hi === undefined ? base : { ...base, handIndex: hi };
  });

  protected readonly displayName = computed(() => this.def()?.name ?? 'Unknown card');

  /** Field/compact face: appends `(n)` when the monster has blocks (e.g. Armoredillo (1)). */
  protected readonly displayNameWithBlocks = computed(() => {
    const blocks = this.displayBlocks();
    if (blocks === null) {
      return this.displayName();
    }
    return `${this.displayName()} (${blocks})`;
  });

  protected readonly displayType = computed(() => this.def()?.cardType ?? '—');

  protected readonly displayCardElement = computed(() => this.def()?.cardElement ?? '—');

  protected readonly displayRarity = computed(() => this.def()?.rarity ?? '—');

  /** Non-empty catalog description; `null` when blank. */
  protected readonly displayDescription = computed(() => {
    const d = this.def()?.description?.trim();
    return d ? d : null;
  });

  /** Monster-only; null for Spell, Land, etc. */
  protected readonly displayMonsterClass = computed(() => this.def()?.monsterClass ?? null);

  /** Monster-only; comma-separated, or null when none. */
  protected readonly displayAttributes = computed(() => {
    const attrs = this.def()?.attributes;
    if (!attrs?.length) {
      return null;
    }
    return attrs.join(', ');
  });

  protected readonly displayMana = computed(() => formatManaCostForDisplay(this.def()?.manaCost));

  /** Catalog max HP (for "current / max" display). */
  protected readonly maxHealth = computed(() => this.def()?.maxHealth ?? null);

  /** Catalog attack; null when not applicable. */
  protected readonly displayAttack = computed(() => this.def()?.attack ?? null);

  /** Monster-only; null when not applicable. */
  protected readonly displayDefense = computed(() => this.def()?.defense ?? null);

  /** Monster blocks on field (runtime); in hand, catalog `startingBlocks`. */
  protected readonly displayBlocks = computed(() => {
    const def = this.def();
    if (def?.cardType !== 'Monster') {
      return null;
    }
    if (this.onField()) {
      const blocks = this.fieldEntry()?.blocks;
      return blocks !== undefined && blocks > 0 ? blocks : null;
    }
    const starting = def.startingBlocks ?? 0;
    return starting > 0 ? starting : null;
  });

  /** Land-only; null when this card does not generate mana from the catalog. */
  protected readonly displayGenerateMana = computed(() => {
    const map = this.def()?.generateMana;
    if (!map || Object.keys(map).length === 0) {
      return null;
    }
    return formatManaGenerationMap(map);
  });

  /** Land-only capacity footprint; null when not a land or no space cost. */
  protected readonly displaySpace = computed(() => {
    const space = effectiveLandSpace(this.def());
    return space > 0 ? space : null;
  });

  /**
   * Land-only build turns shown on the card. Hand: catalog value. Field: remaining owner turns
   * (counts down each time that player starts a turn); hidden when ready or no build time.
   */
  protected readonly displayLandBuildTime = computed(() => {
    const def = this.def();
    const total = effectiveLandBuildTime(def);
    if (total <= 0) {
      return null;
    }
    if (!this.onField()) {
      return total;
    }
    const slot = this.ownerPlayerSlot();
    const placedAtOwner = this.fieldEntry()?.placedAtOwnerTurnCounter;
    if (slot === null || placedAtOwner === undefined) {
      return total;
    }
    const remaining = remainingLandBuildTurns(
      def,
      placedAtOwner,
      this.engine.ownerTurnCounter(slot),
    );
    return remaining > 0 ? remaining : null;
  });

  /** Effective HP shown: field runtime HP, input override, else catalog maxHealth, else null. */
  protected readonly displayHealth = computed(() => {
    const override = this.currentHealth();
    if (override !== undefined) {
      return override;
    }
    const entryHp = this.fieldEntry()?.currentHealth;
    if (entryHp !== undefined) {
      return entryHp;
    }
    const max = this.def()?.maxHealth;
    return max !== undefined ? max : null;
  });

  protected onDragStarted(): void {
    if (this.dragDisabled()) {
      return;
    }
    const slot = this.ownerPlayerSlot();
    const def = this.def();
    if (slot === null || !def) {
      return;
    }
    this.cardDrag.beginDrag({
      cardId: this.cardId(),
      cardType: def.cardType,
      ownerPlayerSlot: slot,
    });
    if (def.cardType !== 'Spell') {
      this.spellDragLine.clearEnemyHandHover();
    }
  }

  protected onDragEnded(_event: CdkDragEnd): void {
    try {
      if (this.inPlayerHand() && this.def()?.cardType === 'Spell') {
        const tether = this.spellDragLine.tetherTarget();
        const snapHand = this.spellDragLine.spellSnapHandTarget();
        const overEnemyHand = this.spellDragLine.spellDragOverEnemyHand();
        const slot = this.ownerPlayerSlot();
        const idx = this.handIndex();
        if (slot === null || idx === undefined) {
          return;
        }
        if (tether !== null) {
          this.engine.tryCastSpellFromHand({
            casterSlot: slot,
            handIndex: idx,
            spellCardId: this.cardId(),
            tether,
          });
        } else {
          const targetSlot = snapHand ?? overEnemyHand;
          if (targetSlot !== null) {
            this.engine.tryCastSpellFromHandAgainstPlayerLife({
              casterSlot: slot,
              handIndex: idx,
              spellCardId: this.cardId(),
              targetPlayerSlot: targetSlot,
            });
          }
        }
      }
    } finally {
      this.spellDragLine.clear();
      this.cardDrag.endDrag();
    }
  }

  protected onDragMoved(event: CdkDragMove<CardDragPayload | null>): void {
    if (this.def()?.cardType !== 'Spell' || !this.inPlayerHand()) {
      return;
    }
    this.spellDragLine.updateFromDragMove(event);
  }

  protected onAttackClick(event: MouseEvent): void {
    event.stopPropagation();
    if (!this.fieldReadyHighlight()) {
      return;
    }
    const slot = this.ownerPlayerSlot();
    const idx = this.fieldCardIndex();
    if (slot === null || idx === null) {
      return;
    }
    this.engine.beginAttackFromMonster(slot, idx);
  }

  protected onDefendClick(event: MouseEvent): void {
    event.stopPropagation();
    if (!this.fieldReadyHighlight()) {
      return;
    }
    const slot = this.ownerPlayerSlot();
    const zone = this.fieldZone();
    const idx = this.fieldCardIndex();
    if (slot === null || zone !== 'monster' || idx === null) {
      return;
    }
    this.engine.setMonsterDefending(slot, idx);
  }

  protected onBurrowClick(event: MouseEvent): void {
    event.stopPropagation();
    if (!this.showBurrowAbility() || this.burrowDisabled()) {
      return;
    }
    const slot = this.ownerPlayerSlot();
    const zone = this.fieldZone();
    const idx = this.fieldCardIndex();
    if (slot === null || zone !== 'monster' || idx === null) {
      return;
    }
    this.engine.tryUseBurrow(slot, idx);
  }

  protected onFieldCardClick(event: MouseEvent): void {
    if (!this.onField()) {
      return;
    }
    if (!this.attackTargetHighlight()) {
      return;
    }
    event.stopPropagation();
    const rowSlot = this.fieldRowSlot() ?? this.ownerPlayerSlot();
    const zone = this.fieldZone();
    const idx = this.fieldCardIndex();
    if (rowSlot === null || zone === null || idx === null) {
      return;
    }
    this.engine.resolveAttackOnTarget(rowSlot, zone, idx);
  }
}
