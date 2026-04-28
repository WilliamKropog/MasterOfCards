import { CdkDrag, CdkDragEnd, type CdkDragMove } from '@angular/cdk/drag-drop';
import { Component, computed, inject, input } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { formatManaGenerationMap, getCardDefinition } from '../game/card-catalog';
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

  /** Hand / board owner — required for field highlights while dragging. */
  readonly ownerPlayerSlot = input<PlayerSlot | null>(null);

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
    const slot = this.ownerPlayerSlot();
    const zone = this.fieldZone();
    if (idx === null || slot === null || zone === null) {
      return null;
    }
    const arr =
      zone === 'land'
        ? slot === 'player1'
          ? this.engine.player1FieldLand()
          : this.engine.player2FieldLand()
        : slot === 'player1'
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
   * Spells/cards with `manaCost` > 0 require that much of `cardElement` mana from lands on the
   * field (mana is not spent when playing; pool is always “available” while lands stay in play).
   */
  private readonly cannotAffordManaCostInHand = computed(() => {
    if (!this.inPlayerHand()) {
      return false;
    }
    const def = this.def();
    if (!def) {
      return true;
    }
    const cost = def.manaCost;
    if (cost === undefined || cost <= 0) {
      return false;
    }
    const slot = this.ownerPlayerSlot();
    if (slot === null) {
      return true;
    }
    const pool = slot === 'player1' ? this.engine.player1Mana() : this.engine.player2Mana();
    const available = pool[def.cardElement] ?? 0;
    return available < cost;
  });

  /** No drag before Start, when collapsed, on the field, when land/monster slot used this turn, or when mana cost isn’t met. */
  protected readonly dragDisabled = computed(
    () =>
      this.compact() ||
      !this.engine.gameStarted() ||
      this.onField() ||
      this.fieldLandOrMonsterLocked() ||
      this.cannotAffordManaCostInHand(),
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
    const owner = this.ownerPlayerSlot();
    const idx = this.fieldCardIndex();
    if (zone === null || owner === null || idx === null) {
      return false;
    }
    const mode = this.engine.attackMode();
    if (!mode) {
      return false;
    }
    return this.engine.isLegalAttackTargetForAttackMode(owner, zone, idx, mode.attackerSlot);
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
    const turn = this.engine.currentTurn();
    if (turn === null) {
      return false;
    }
    const casterId: 1 | 2 = drag.ownerPlayerSlot === 'player1' ? 1 : 2;
    if (turn !== casterId) {
      return false;
    }
    const owner = this.ownerPlayerSlot();
    if (owner === null || owner === drag.ownerPlayerSlot) {
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
    const slot = this.ownerPlayerSlot();
    const zone = this.fieldZone();
    const idx = this.fieldCardIndex();
    if (slot === null || zone === null || idx === null) {
      return false;
    }
    return t.slot === slot && t.zone === zone && t.index === idx;
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

  protected readonly displayMana = computed(() => this.def()?.manaCost ?? null);

  /** Catalog max HP (for "current / max" display). */
  protected readonly maxHealth = computed(() => this.def()?.maxHealth ?? null);

  /** Catalog attack; null when not applicable. */
  protected readonly displayAttack = computed(() => this.def()?.attack ?? null);

  /** Monster-only; null when not applicable. */
  protected readonly displayDefense = computed(() => this.def()?.defense ?? null);

  /** Land-only; null when this card does not generate mana from the catalog. */
  protected readonly displayGenerateMana = computed(() => {
    const map = this.def()?.generateMana;
    if (!map || Object.keys(map).length === 0) {
      return null;
    }
    return formatManaGenerationMap(map);
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

  protected onFieldCardClick(event: MouseEvent): void {
    if (!this.onField()) {
      return;
    }
    if (!this.attackTargetHighlight()) {
      return;
    }
    event.stopPropagation();
    const slot = this.ownerPlayerSlot();
    const zone = this.fieldZone();
    const idx = this.fieldCardIndex();
    if (slot === null || zone === null || idx === null) {
      return;
    }
    this.engine.resolveAttackOnTarget(slot, zone, idx);
  }
}
