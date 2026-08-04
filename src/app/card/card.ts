import { CdkDrag, CdkDragEnd, type CdkDragMove } from '@angular/cdk/drag-drop';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
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
  monsterSummoningSicknessCleared,
  mustPlaceLandOnOpponentRow,
  remainingLandBuildTurns,
  spellAllowsTargetZone,
} from '../game/card-catalog';
import type { CardDragPayload } from '../services/card-drag-payload';
import { CardDragService } from '../services/card-drag.service';
import { SpellDragLineService } from '../services/spell-drag-line.service';
import { GameEngineService, type ActionFeedbackKind, type FieldZone } from '../services/game-engine.service';
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
    return this.engine.getFieldEntry(rowSlot, zone, idx) ?? null;
  });

  /** Floating damage text shown on this card (slides up, then cleared). */
  protected readonly floatingDamage = signal<{ amount: number; blocked: boolean } | null>(null);
  private floatingDamageTimer: ReturnType<typeof setTimeout> | null = null;
  private lastDamageTimestamp = Date.now();

  private readonly damageWatcher = effect(() => {
    const events = this.engine.damageEvents();
    if (!this.onField() || events.length === 0) { return; }
    const rowSlot = this.fieldRowSlot() ?? this.ownerPlayerSlot();
    const zone = this.fieldZone();
    const idx = this.fieldCardIndex();
    if (rowSlot === null || zone === null || idx === null) { return; }

    for (const ev of events) {
      if (ev.timestamp <= this.lastDamageTimestamp) { continue; }
      if (ev.playerSlot === rowSlot && ev.zone === zone && ev.identifier === idx) {
        this.lastDamageTimestamp = ev.timestamp;
        this.showFloatingDamage(ev.amount, ev.blocked ?? false);
      }
    }
  });

  private showFloatingDamage(amount: number, blocked: boolean): void {
    if (this.floatingDamageTimer) { clearTimeout(this.floatingDamageTimer); }
    this.floatingDamage.set({ amount, blocked });
    this.floatingDamageTimer = setTimeout(() => {
      this.floatingDamage.set(null);
      this.floatingDamageTimer = null;
    }, 1200);
  }

  /** Floating action feedback (Praise, mana generation, etc.). */
  protected readonly floatingActionFeedback = signal<{
    kind: ActionFeedbackKind;
    text: string;
    manaParts?: { element: string; amount: number }[];
  } | null>(null);
  private floatingActionFeedbackTimer: ReturnType<typeof setTimeout> | null = null;
  private lastActionFeedbackTimestamp = Date.now();

  private readonly actionFeedbackWatcher = effect(() => {
    const events = this.engine.actionFeedbackEvents();
    if (!this.onField() || events.length === 0) { return; }
    const rowSlot = this.fieldRowSlot() ?? this.ownerPlayerSlot();
    const zone = this.fieldZone();
    const idx = this.fieldCardIndex();
    if (rowSlot === null || zone === null || idx === null) { return; }

    for (const ev of events) {
      if (ev.timestamp <= this.lastActionFeedbackTimestamp) { continue; }
      if (ev.playerSlot === rowSlot && ev.zone === zone && ev.identifier === idx) {
        this.lastActionFeedbackTimestamp = ev.timestamp;
        const text =
          ev.text ??
          (ev.kind === 'praising'
            ? 'Praising'
            : ev.kind === 'praise-bonus-rock'
              ? '+1 Rock Mana per Turn'
              : ev.kind === 'excavated'
                ? 'Excavated — returned to deck'
                : ev.kind === 'wall-shielding'
                  ? '+1 shielding'
                  : '+1 mana');
        this.showFloatingActionFeedback(ev.kind, text, ev.manaParts);
      }
    }
  });

  private showFloatingActionFeedback(
    kind: ActionFeedbackKind,
    text: string,
    manaParts?: { element: string; amount: number }[],
  ): void {
    if (this.floatingActionFeedbackTimer) { clearTimeout(this.floatingActionFeedbackTimer); }
    this.floatingActionFeedback.set({ kind, text, manaParts });
    this.floatingActionFeedbackTimer = setTimeout(() => {
      this.floatingActionFeedback.set(null);
      this.floatingActionFeedbackTimer = null;
    }, 1400);
  }

  /**
   * Free (no mana cost) land/monster locked after one free card was placed this turn.
   * Cards that cost mana are never locked by this — they're gated by mana affordability instead.
   */
  private readonly fieldLandOrMonsterLocked = computed(() => {
    if (this.onField() || this.compact()) {
      return false;
    }
    const def = this.def();
    const type = def?.cardType;
    if (type !== 'Land' && type !== 'Monster') {
      return false;
    }
    if (hasManaCost(def!.manaCost)) {
      return false;
    }
    const slot = this.ownerPlayerSlot();
    if (slot === null || !this.engine.gameStarted() || !this.engine.placedFreeFieldCardThisTurn()) {
      return false;
    }
    const turn = this.engine.currentTurn();
    if (turn === null) {
      return false;
    }
    const slotId: 1 | 2 = slot === 'player1' ? 1 : 2;
    return slotId === turn;
  });

  /** Cards with `manaCost` require each listed element from the player's current turn mana pool. */
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

  /** Land in hand has no valid contiguous placement on the target field row. */
  private readonly landHasNoFieldPlacement = computed(() => {
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
    const targetRow: PlayerSlot = mustPlaceLandOnOpponentRow(def)
      ? (slot === 'player1' ? 'player2' : 'player1')
      : slot;
    return !this.engine.canPlaceLandOnField(targetRow, def.space ?? 1);
  });

  private readonly isInactiveHandCard = computed(() => {
    if (!this.inPlayerHand() || !this.engine.gameStarted()) { return false; }
    const turn = this.engine.currentTurn();
    if (turn === null) { return false; }
    const mine = this.ownerPlayerSlot() === 'player1' ? 1 : 2;
    return turn !== mine;
  });

  /** No drag on inactive turn, on the field, when land/monster slot used this turn, or when mana cost isn’t met. */
  protected readonly dragDisabled = computed(
    () =>
      this.isInactiveHandCard() ||
      !this.engine.gameStarted() ||
      this.onField() ||
      this.fieldLandOrMonsterLocked() ||
      this.cannotAffordManaCostInHand() ||
      this.exceedsLandCapacityInHand() ||
      this.landHasNoFieldPlacement(),
  );

  /** Subtle gold hint on cards that can be dragged this turn (active hand). */
  protected readonly playableHighlight = computed(() => !this.dragDisabled());

  /**
   * Light blue glisten: monsters on field can act (attack/abilities) on the owner's turn once
   * summoning sickness clears. Haste monsters are awake the turn they were played.
   */
  protected readonly fieldReadyHighlight = computed(() => {
    if (!this.onField() || !this.engine.gameStarted()) {
      return false;
    }
    if (this.cardDrag.activeDrag()) {
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
    return monsterSummoningSicknessCleared(this.def(), placedAt, this.engine.turnCounter());
  });

  /** Elder Gopher Statue: blue glow when Praise can be activated. */
  protected readonly landPraiseReadyHighlight = computed(() => {
    if (!this.onField() || this.fieldZone() !== 'land' || !this.engine.gameStarted()) {
      return false;
    }
    if (this.cardDrag.activeDrag()) {
      return false;
    }
    const rowSlot = this.fieldRowSlot() ?? this.ownerPlayerSlot();
    const idx = this.fieldCardIndex();
    if (rowSlot === null || idx === null) {
      return false;
    }
    return this.engine.getLandPraiseState(rowSlot, idx).canActivate;
  });

  /** Show Praise overlay on hover when the land is active on the controller's turn. */
  protected readonly showLandPraiseOverlay = computed(() => {
    if (!this.onField() || this.fieldZone() !== 'land' || !this.engine.gameStarted()) {
      return false;
    }
    const rowSlot = this.fieldRowSlot() ?? this.ownerPlayerSlot();
    const idx = this.fieldCardIndex();
    if (rowSlot === null || idx === null) {
      return false;
    }
    const state = this.engine.getLandPraiseState(rowSlot, idx);
    return state.isElderGopher && state.landActive && state.isControllerTurn;
  });

  protected readonly praiseDisabled = computed(() => {
    if (!this.showLandPraiseOverlay()) {
      return true;
    }
    const rowSlot = this.fieldRowSlot() ?? this.ownerPlayerSlot();
    const idx = this.fieldCardIndex();
    if (rowSlot === null || idx === null) {
      return true;
    }
    return !this.engine.getLandPraiseState(rowSlot, idx).canActivate;
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

  /** Rockterrior: show Tail Smash while ready (stays visible but disabled after one use). */
  protected readonly showTailSmashAbility = computed(() => {
    if (!this.onField() || this.fieldZone() !== 'monster') {
      return false;
    }
    if (this.cardId() !== 'rockterrior') {
      return false;
    }
    return this.fieldReadyHighlight();
  });

  /** Tail Smash requires 3 Rock mana and is one-time use. */
  protected readonly tailSmashDisabled = computed(() => {
    if (!this.showTailSmashAbility()) {
      return true;
    }
    if ((this.fieldEntry()?.usedAbilities ?? []).includes('tail-smash')) {
      return true;
    }
    const slot = this.ownerPlayerSlot();
    const idx = this.fieldCardIndex();
    if (slot === null || idx === null) {
      return true;
    }
    return !this.engine.canBeginTailSmash(slot, idx);
  });

  /**
   * Red shimmer: this card is a legal target while the owner’s monster is in attack mode
   * or ability targeting mode (e.g. Tail Smash).
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
    const attackMode = this.engine.attackMode();
    if (attackMode) {
      return this.engine.isLegalAttackTargetForAttackMode(
        rowSlot,
        zone,
        idx,
        attackMode.attackerSlot,
      );
    }
    const abilityMode = this.engine.abilityTargetMode();
    if (abilityMode) {
      return this.engine.isLegalAbilityTarget(
        rowSlot,
        zone,
        idx,
        abilityMode.casterSlot,
      );
    }
    return false;
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
    const zone = this.fieldZone();
    if (zone !== 'land' && zone !== 'monster') {
      return false;
    }
    const spellDef = getCardDefinition(drag.cardId);
    return spellAllowsTargetZone(spellDef, zone);
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

  /** Marks the card that opened attack or ability targeting mode. */
  protected readonly isAttackSource = computed(() => {
    if (!this.onField()) {
      return false;
    }
    const slot = this.ownerPlayerSlot();
    const idx = this.fieldCardIndex();
    if (slot === null || idx === null) {
      return false;
    }
    const attackMode = this.engine.attackMode();
    if (attackMode) {
      return attackMode.attackerSlot === slot && attackMode.attackerMonsterSlot === idx;
    }
    const abilityMode = this.engine.abilityTargetMode();
    if (abilityMode) {
      return abilityMode.casterSlot === slot && abilityMode.casterMonsterSlot === idx;
    }
    return false;
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

  /** Catalog max HP, or runtime override when set (e.g. King Colossus). */
  protected readonly maxHealth = computed(() => {
    if (this.onField()) {
      const override = this.fieldEntry()?.maxHealthOverride;
      if (override !== undefined) {
        return override;
      }
    }
    return this.def()?.maxHealth ?? null;
  });

  /** Catalog attack; null when not applicable. */
  protected readonly displayAttack = computed(() => this.def()?.attack ?? null);

  // /** Retired — combat uses attack only; kept for easy restore. */
  // protected readonly displayDefense = computed(() => this.def()?.defense ?? null);

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
    const praiseRock = this.onField() ? (this.fieldEntry()?.praiseBonusRock ?? 0) : 0;
    if (praiseRock > 0) {
      const combined = { ...map, Rock: (map['Rock'] ?? 0) + praiseRock };
      return formatManaGenerationMap(combined);
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
      if (!this.inPlayerHand()) {
        return;
      }
      const type = this.def()?.cardType;

      if (type === 'Spell') {
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
      } else if (type === 'Land') {
        const preview = this.cardDrag.landPreviewSpaces();
        const slot = this.ownerPlayerSlot();
        const idx = this.handIndex();
        if (preview.length > 0 && slot !== null && idx !== undefined) {
          const def = this.def()!;
          const targetRowSlot: PlayerSlot = mustPlaceLandOnOpponentRow(def)
            ? (slot === 'player1' ? 'player2' : 'player1')
            : slot;
          this.engine.placeLandFromHand({
            controllerSlot: slot,
            handIndex: idx,
            cardId: this.cardId(),
            targetRowSlot,
            influencedSpaces: preview,
          });
        }
      } else if (type === 'Monster') {
        const previewSlot = this.cardDrag.monsterPreviewSlot();
        const slot = this.ownerPlayerSlot();
        const idx = this.handIndex();
        if (previewSlot !== null && slot !== null && idx !== undefined) {
          this.engine.placeMonsterFromHand({
            controllerSlot: slot,
            handIndex: idx,
            cardId: this.cardId(),
            fieldSlot: previewSlot,
          });
        }
      }
    } finally {
      this.spellDragLine.clear();
      this.cardDrag.endDrag();
    }
  }

  protected onDragMoved(event: CdkDragMove<CardDragPayload | null>): void {
    if (!this.inPlayerHand()) {
      return;
    }
    const type = this.def()?.cardType;
    if (type === 'Spell') {
      this.spellDragLine.updateFromDragMove(event);
    } else if (type === 'Land') {
      this.updateLandDragPreview(event.pointerPosition);
    } else if (type === 'Monster') {
      this.updateMonsterDragPreview(event.pointerPosition);
    }
  }

  private updateMonsterDragPreview(pointer: { x: number; y: number }): void {
    const slot = this.ownerPlayerSlot();
    if (!slot) {
      this.cardDrag.updateMonsterPreview(null);
      return;
    }
    const monsterSlotNum = this.findMonsterSlotAtPoint(pointer);
    if (monsterSlotNum === null || this.engine.getMonsterBySlot(slot, monsterSlotNum)) {
      this.cardDrag.updateMonsterPreview(null);
      return;
    }
    this.cardDrag.updateMonsterPreview(monsterSlotNum);
  }

  private updateLandDragPreview(pointer: { x: number; y: number }): void {
    const def = this.def();
    const slot = this.ownerPlayerSlot();
    if (!def || def.cardType !== 'Land' || !slot) {
      this.cardDrag.clearLandPreview();
      return;
    }
    const monsterSlotNum = this.findMonsterSlotAtPoint(pointer);
    if (monsterSlotNum === null) {
      this.cardDrag.clearLandPreview();
      return;
    }
    const spaceCount = def.space ?? 1;
    const targetRow: PlayerSlot = mustPlaceLandOnOpponentRow(def)
      ? (slot === 'player1' ? 'player2' : 'player1')
      : slot;
    const preview = this.engine.computeLandInfluencedSpaces(monsterSlotNum, spaceCount, targetRow);
    if (preview) {
      this.cardDrag.updateLandPreview(preview);
    } else {
      this.cardDrag.clearLandPreview();
    }
  }

  private findMonsterSlotAtPoint(point: { x: number; y: number }): number | null {
    for (const el of document.elementsFromPoint(point.x, point.y)) {
      if (el instanceof HTMLElement && el.closest('.cdk-drag-preview')) {
        continue;
      }
      const slotEl = el.closest<HTMLElement>('[data-slot-number]');
      if (slotEl) {
        const raw = slotEl.getAttribute('data-slot-number');
        if (raw) {
          const n = Number(raw);
          if (Number.isInteger(n) && n >= 1 && n <= 9) {
            return n;
          }
        }
      }
    }
    return null;
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

  protected onTailSmashClick(event: MouseEvent): void {
    event.stopPropagation();
    if (!this.showTailSmashAbility() || this.tailSmashDisabled()) {
      return;
    }
    const slot = this.ownerPlayerSlot();
    const zone = this.fieldZone();
    const idx = this.fieldCardIndex();
    if (slot === null || zone !== 'monster' || idx === null) {
      return;
    }
    this.engine.beginTailSmash(slot, idx);
  }

  protected onPraiseClick(event: MouseEvent): void {
    event.stopPropagation();
    if (this.praiseDisabled()) {
      return;
    }
    const rowSlot = this.fieldRowSlot() ?? this.ownerPlayerSlot();
    const idx = this.fieldCardIndex();
    if (rowSlot === null || idx === null) {
      return;
    }
    this.engine.tryUsePraise(rowSlot, idx);
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
    if (this.engine.abilityTargetMode()?.abilityId === 'tail-smash') {
      this.engine.resolveTailSmashOnTarget(rowSlot, zone, idx);
      return;
    }
    this.engine.resolveAttackOnTarget(rowSlot, zone, idx);
  }
}
