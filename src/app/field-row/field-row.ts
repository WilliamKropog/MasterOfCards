import {
  CdkDrag,
  CdkDragDrop,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { Component, computed, inject, input } from '@angular/core';
import { getCardDefinition, mustPlaceLandOnOpponentRow } from '../game/card-catalog';
import type { CardDragPayload } from '../services/card-drag-payload';
import { CardDragService } from '../services/card-drag.service';
import type { FieldCardEntry, FieldZone } from '../services/game-engine.service';
import { GameEngineService, MONSTER_FIELD_SLOTS } from '../services/game-engine.service';
import { Card } from '../card/card';
import type { PlayerSlot } from '../player-hand/player-hand';

export interface MonsterSlotView {
  slotNumber: number;
  entry: FieldCardEntry | null;
}

@Component({
  selector: 'app-field-row',
  imports: [Card, CdkDropList],
  templateUrl: './field-row.html',
  styleUrl: './field-row.css',
})
export class FieldRow {
  private readonly cardDrag = inject(CardDragService);
  private readonly engine = inject(GameEngineService);

  readonly playerSlot = input.required<PlayerSlot>();
  readonly zone = input.required<FieldZone>();

  protected readonly rowLabel = computed(() => {
    const player = this.playerSlot() === 'player1' ? 'Player 1' : 'Player 2';
    const zone = this.zone() === 'land' ? 'land' : 'monster';
    return `${player}'s ${zone} row`;
  });

  protected readonly fieldCards = computed(() => {
    const slot = this.playerSlot();
    const zone = this.zone();
    if (slot === 'player1') {
      return zone === 'land' ? this.engine.player1FieldLand() : this.engine.player1FieldMonster();
    }
    return zone === 'land' ? this.engine.player2FieldLand() : this.engine.player2FieldMonster();
  });

  /** 9-element view for monster rows: slot 1–9 mapped to entries or null. */
  protected readonly monsterSlots = computed((): MonsterSlotView[] => {
    if (this.zone() !== 'monster') {
      return [];
    }
    const entries = this.fieldCards();
    const slots: MonsterSlotView[] = [];
    for (let i = 1; i <= MONSTER_FIELD_SLOTS; i++) {
      const entry = entries.find((e) => e.fieldSlot === i) ?? null;
      slots.push({ slotNumber: i, entry });
    }
    return slots;
  });

  /** For land rows: each land entry with computed grid position based on influenced spaces. */
  protected readonly landCardsPositioned = computed(() => {
    if (this.zone() !== 'land') {
      return [];
    }
    return this.fieldCards().map((entry, arrIndex) => {
      const spaces = entry.influencedSpaces ?? [];
      const colStart = spaces.length > 0 ? Math.min(...spaces) : 1;
      const colEnd = spaces.length > 0 ? Math.max(...spaces) + 1 : 2;
      return { entry, arrIndex, colStart, colEnd };
    });
  });

  /** Unoccupied monster-row slots shown while a monster card is being dragged. */
  protected readonly monsterAvailableSlots = computed((): Set<number> => {
    if (this.zone() !== 'monster') { return new Set(); }
    const drag = this.cardDrag.activeDrag();
    if (!drag || drag.cardType !== 'Monster') { return new Set(); }
    if (drag.ownerPlayerSlot !== this.playerSlot()) { return new Set(); }
    const occupied = new Set(this.engine.occupiedMonsterSlots(drag.ownerPlayerSlot));
    const available = new Set<number>();
    for (let i = 1; i <= MONSTER_FIELD_SLOTS; i++) {
      if (!occupied.has(i)) { available.add(i); }
    }
    return available;
  });

  /** The target row player for the currently dragged land card (opponent for Temple of Being). */
  private readonly landDragTargetRow = computed((): PlayerSlot | null => {
    const drag = this.cardDrag.activeDrag();
    if (!drag || drag.cardType !== 'Land') { return null; }
    const def = getCardDefinition(drag.cardId);
    if (mustPlaceLandOnOpponentRow(def)) {
      return drag.ownerPlayerSlot === 'player1' ? 'player2' : 'player1';
    }
    return drag.ownerPlayerSlot;
  });

  /** Slots highlighted while a land card is dragged over the monster row (live preview). */
  protected readonly landDragPreviewSlots = computed((): Set<number> => {
    if (this.zone() !== 'monster') { return new Set(); }
    if (this.landDragTargetRow() !== this.playerSlot()) { return new Set(); }
    return new Set(this.cardDrag.landPreviewSpaces());
  });

  /** Uninfluenced monster-row slots shown while a land card is being dragged. */
  protected readonly landAvailableSlots = computed((): Set<number> => {
    if (this.zone() !== 'monster') { return new Set(); }
    const targetRow = this.landDragTargetRow();
    if (targetRow !== this.playerSlot()) { return new Set(); }
    const influenced = new Set(this.engine.influencedSpacesByLands(targetRow));
    const available = new Set<number>();
    for (let i = 1; i <= MONSTER_FIELD_SLOTS; i++) {
      if (!influenced.has(i)) { available.add(i); }
    }
    return available;
  });

  /** Slot highlighted while a monster card is dragged over the monster row. */
  protected readonly monsterDragPreviewSlot = computed((): number | null => {
    if (this.zone() !== 'monster') { return null; }
    const drag = this.cardDrag.activeDrag();
    if (!drag || drag.cardType !== 'Monster') { return null; }
    if (drag.ownerPlayerSlot !== this.playerSlot()) { return null; }
    return this.cardDrag.monsterPreviewSlot();
  });


  protected readonly canEnterRow = (
    _drag: CdkDrag<CardDragPayload | null>,
    _drop: CdkDropList<string[] | FieldCardEntry[]>,
  ): boolean => {
    return false;
  };

  protected onDropped(event: CdkDragDrop<any>): void {
    const prev = event.previousContainer.data;
    const next = event.container.data;

    if (prev === next) {
      if (this.isFieldContainer(prev)) {
        moveItemInArray(prev as FieldCardEntry[], event.previousIndex, event.currentIndex);
      } else {
        moveItemInArray(prev as string[], event.previousIndex, event.currentIndex);
      }
    }
    this.engine.touchDropContainers(event);
  }

  private isHandContainer(data: string[] | FieldCardEntry[]): boolean {
    return data === this.engine.player1Hand() || data === this.engine.player2Hand();
  }

  private isFieldContainer(data: string[] | FieldCardEntry[]): boolean {
    return (
      data === this.engine.player1FieldLand() ||
      data === this.engine.player1FieldMonster() ||
      data === this.engine.player2FieldLand() ||
      data === this.engine.player2FieldMonster()
    );
  }
}
