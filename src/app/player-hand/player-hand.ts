import { CdkDrag, CdkDragDrop, CdkDropList, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { Component, computed, inject, input } from '@angular/core';
import { Card } from '../card/card';
import type { CardDragPayload } from '../services/card-drag-payload';
import { CardDragService } from '../services/card-drag.service';
import { GameEngineService } from '../services/game-engine.service';
import { SpellDragLineService } from '../services/spell-drag-line.service';

export type PlayerSlot = 'player1' | 'player2';

@Component({
  selector: 'app-player-hand',
  imports: [Card, CdkDropList],
  templateUrl: './player-hand.html',
  styleUrl: './player-hand.css',
})
export class PlayerHand {
  protected readonly engine = inject(GameEngineService);
  private readonly cardDrag = inject(CardDragService);
  private readonly spellDragLine = inject(SpellDragLineService);

  /** Which player this hand belongs to. */
  readonly playerSlot = input.required<PlayerSlot>();

  /** Catalog ids to show in hand order (e.g. `CardIds.rockMonster`). */
  readonly cardIds = input<string[]>([]);

  protected readonly displayLabel = computed(() =>
    this.playerSlot() === 'player1' ? 'Player 1' : 'Player 2',
  );

  protected readonly lifePoints = computed(() =>
    this.playerSlot() === 'player1'
      ? this.engine.player1LifePoints()
      : this.engine.player2LifePoints(),
  );

  /**
   * Red border glow: this hand is a valid direct target whenever the opponent is dragging a spell
   * from their hand.
   */
  protected readonly spellDragEligibleEnemyHand = computed(() => {
    if (!this.engine.gameStarted()) {
      return false;
    }
    const drag = this.cardDrag.activeDrag();
    if (!drag || drag.cardType !== 'Spell') {
      return false;
    }
    return drag.ownerPlayerSlot !== this.playerSlot();
  });

  /** Stronger highlight: pointer is over this enemy hand while dragging that spell. */
  protected readonly spellDragTargetingThisHand = computed(
    () => this.spellDragLine.spellDragOverEnemyHand() === this.playerSlot(),
  );

  /** Spell snap line is anchored to this hand (preview within snap radius), like `card--spell-tether-active`. */
  protected readonly spellSnapTetherThisHand = computed(
    () => this.spellDragLine.spellSnapHandTarget() === this.playerSlot(),
  );

  /**
   * Red border: this hand can be attacked by the opponent’s monster when they have no enemy
   * monsters on the field (same rule as attacking lands).
   */
  protected readonly attackModeEligibleEnemyHand = computed(() => {
    if (!this.engine.gameStarted()) {
      return false;
    }
    const mode = this.engine.attackMode();
    if (!mode) {
      return false;
    }
    const enemy: PlayerSlot = mode.attackerSlot === 'player1' ? 'player2' : 'player1';
    if (this.playerSlot() !== enemy) {
      return false;
    }
    const enemyMonsters =
      enemy === 'player1'
        ? this.engine.player1FieldMonster().length
        : this.engine.player2FieldMonster().length;
    return enemyMonsters === 0;
  });

  /** Sorted rows for template: mana type + total amount from lands on the field. */
  protected readonly manaFromLandsRows = computed(() => {
    const pool =
      this.playerSlot() === 'player1' ? this.engine.player1Mana() : this.engine.player2Mana();
    return Object.entries(pool)
      .filter(([, amount]) => amount > 0)
      .map(([element, amount]) => ({ element, amount }))
      .sort((a, b) => a.element.localeCompare(b.element));
  });

  protected readonly manaFromLandsAriaLabel = computed(() => {
    const rows = this.manaFromLandsRows();
    if (rows.length === 0) {
      return 'No mana from lands on the field';
    }
    return `Mana from lands: ${rows.map((m) => `${m.amount} ${m.element}`).join(', ')}`;
  });

  /** Inactive hand uses compact cards once the match has started. */
  protected readonly isHandCollapsed = computed(() => {
    if (!this.engine.gameStarted()) {
      return false;
    }
    const turn = this.engine.currentTurn();
    if (turn === null) {
      return false;
    }
    const mine = this.playerSlot() === 'player1' ? 1 : 2;
    return turn !== mine;
  });

  /**
   * Block drops onto the inactive (collapsed) hand and cross-hand transfers; only the owning
   * player's active hand may receive their own drags.
   */
  protected readonly canEnterHand = (
    drag: CdkDrag<CardDragPayload | null>,
    _drop: CdkDropList,
  ): boolean => {
    if (this.isHandCollapsed()) {
      return false;
    }
    const data = drag.data;
    if (!data?.ownerPlayerSlot) {
      return false;
    }
    return data.ownerPlayerSlot === this.playerSlot();
  };

  protected onHandDropped(event: CdkDragDrop<any>): void {
    if (this.isHandCollapsed()) {
      return;
    }
    if (event.previousContainer !== event.container) {
      const data = event.item.data as CardDragPayload | undefined;
      if (data && data.ownerPlayerSlot !== this.playerSlot()) {
        return;
      }
    }
    if (event.previousContainer === event.container) {
      moveItemInArray(event.container.data as string[], event.previousIndex, event.currentIndex);
    } else {
      transferArrayItem(
        event.previousContainer.data as string[],
        event.container.data as string[],
        event.previousIndex,
        event.currentIndex,
      );
    }
    this.engine.touchDropContainers(event);
  }

  protected onEnemyHandAttackClick(event: MouseEvent): void {
    if (!this.attackModeEligibleEnemyHand()) {
      return;
    }
    event.stopPropagation();
    this.engine.resolveAttackOnEnemyLife(this.playerSlot());
  }
}
