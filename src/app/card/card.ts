import { CdkDrag, CdkDragEnd } from '@angular/cdk/drag-drop';
import { Component, computed, inject, input } from '@angular/core';
import { formatManaGenerationMap, getCardDefinition } from '../game/card-catalog';
import type { CardDragPayload } from '../services/card-drag-payload';
import { CardDragService } from '../services/card-drag.service';
import { GameEngineService } from '../services/game-engine.service';
import type { PlayerSlot } from '../player-hand/player-hand';

@Component({
  selector: 'app-card',
  imports: [CdkDrag],
  templateUrl: './card.html',
  styleUrl: './card.css',
})
export class Card {
  private readonly engine = inject(GameEngineService);
  private readonly cardDrag = inject(CardDragService);

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

  /** Cards on the field are not draggable back to hand (for now). */
  readonly onField = input(false);

  /** No drag before Start, when collapsed, or when placed on the field. */
  protected readonly dragDisabled = computed(
    () => this.compact() || !this.engine.gameStarted() || this.onField(),
  );

  protected readonly dragPayload = computed((): CardDragPayload | null => {
    const slot = this.ownerPlayerSlot();
    if (slot === null) {
      return null;
    }
    return { cardId: this.cardId(), ownerPlayerSlot: slot };
  });

  private readonly def = computed(() => getCardDefinition(this.cardId()));

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

  /** Land-only; null when this card does not generate mana from the catalog. */
  protected readonly displayGenerateMana = computed(() => {
    const map = this.def()?.generateMana;
    if (!map || Object.keys(map).length === 0) {
      return null;
    }
    return formatManaGenerationMap(map);
  });

  /** Effective HP shown: override, else catalog maxHealth, else null (e.g. spells). */
  protected readonly displayHealth = computed(() => {
    const override = this.currentHealth();
    if (override !== undefined) {
      return override;
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
  }

  protected onDragEnded(_event: CdkDragEnd): void {
    this.cardDrag.endDrag();
  }
}
