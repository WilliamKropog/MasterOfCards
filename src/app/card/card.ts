import { Component, computed, input } from '@angular/core';
import { formatManaGenerationMap, getCardDefinition } from '../game/card-catalog';

@Component({
  selector: 'app-card',
  imports: [],
  templateUrl: './card.html',
  styleUrl: './card.css',
})
export class Card {
  /** Lookup key in `CARD_CATALOG` — pass only this from parents when possible. */
  readonly cardId = input.required<string>();

  /**
   * Battle/runtime override. When unset, creatures/lands use catalog `maxHealth`.
   * Spells typically omit this.
   */
  readonly currentHealth = input<number | undefined>(undefined);

  /** Minimal face: name + current health only (inactive player hand). */
  readonly compact = input(false);

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
}
