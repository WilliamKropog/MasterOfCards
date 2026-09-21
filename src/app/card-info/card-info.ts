import { Component, computed, inject } from '@angular/core';
import type {
  ActivatedAbilityDefinition,
  ManaGenerationMap,
} from '../game/card-catalog';
import { CardInfoService } from '../services/card-info.service';

export interface ManaChipView {
  element: string;
  amount: number;
}

@Component({
  selector: 'app-card-info',
  imports: [],
  templateUrl: './card-info.html',
  styleUrl: './card-info.css',
})
export class CardInfo {
  private readonly cardInfo = inject(CardInfoService);

  protected readonly card = this.cardInfo.card;

  protected readonly isLand = computed(() => this.card()?.cardType === 'Land');

  /** Play cost chips for the card header (empty when free). */
  protected readonly playCostChips = computed((): ManaChipView[] => {
    return manaMapToChips(this.card()?.manaCost);
  });

  /** Land generate-mana chips for the card footer. */
  protected readonly generateManaChips = computed((): ManaChipView[] => {
    return manaMapToChips(this.card()?.generateMana);
  });

  protected readonly classAttrLine = computed((): string => {
    const card = this.card();
    if (!card) {
      return '';
    }
    const parts: string[] = [];
    if (card.monsterClass) {
      parts.push(card.monsterClass);
    }
    if (card.attributes?.length) {
      parts.push(...card.attributes);
    }
    return parts.join('  ·  ');
  });

  protected readonly abilities = computed((): ActivatedAbilityDefinition[] => {
    const card = this.card();
    if (!card) {
      return [];
    }
    const list: ActivatedAbilityDefinition[] = [];
    if (card.abilities?.length) {
      list.push(...card.abilities);
    }
    if (card.landAbilities?.length) {
      list.push(...card.landAbilities);
    }
    return list;
  });

  protected readonly showHealth = computed(() => {
    const card = this.card();
    return !!card && card.cardType !== 'Land' && card.maxHealth != null;
  });

  protected readonly showAttack = computed(() => {
    const card = this.card();
    return !!card && card.cardType !== 'Land' && card.attack != null;
  });

  protected readonly showLandManaFooter = computed(() => {
    return this.isLand() && this.generateManaChips().length > 0;
  });
}

function manaMapToChips(map: ManaGenerationMap | undefined): ManaChipView[] {
  if (!map) {
    return [];
  }
  return Object.entries(map)
    .filter(([, amount]) => amount > 0)
    .map(([element, amount]) => ({ element, amount }));
}
