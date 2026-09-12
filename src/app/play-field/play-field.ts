import { Component, computed, inject } from '@angular/core';
import { FieldRow } from '../field-row/field-row';
import { GameEngineService, MONSTER_FIELD_SLOTS } from '../services/game-engine.service';
import type { FieldPlayerSlot } from '../services/game-engine.service';

export interface LandInfluenceOverlay {
  colStart: number;
  colEnd: number;
  /** CSS grid row: 1-2 for player1 (land row 1, monster row 2), 3-4 for player2 (monster row 3, land row 4). */
  rowStart: number;
  rowEnd: number;
}

@Component({
  selector: 'app-play-field',
  imports: [FieldRow],
  templateUrl: './play-field.html',
  styleUrl: './play-field.css',
  host: {
    '[style.--slot-count]': 'monsterFieldSlots',
  },
})
export class PlayField {
  protected readonly engine = inject(GameEngineService);
  protected readonly monsterFieldSlots = MONSTER_FIELD_SLOTS;

  protected readonly landInfluenceOverlays = computed((): LandInfluenceOverlay[] => {
    const overlays: LandInfluenceOverlay[] = [];
    const count = this.monsterFieldSlots;
    const topSlot = this.engine.topPlayerSlot();
    const bottomSlot = this.engine.bottomPlayerSlot();

    const addOverlays = (slot: FieldPlayerSlot, isTop: boolean) => {
      const lands = slot === 'player1'
        ? this.engine.player1FieldLand()
        : this.engine.player2FieldLand();
      for (const entry of lands) {
        const spaces = entry.influencedSpaces;
        if (!spaces || spaces.length === 0) { continue; }
        if (isTop) {
          const visualCols = spaces.map((s) => count + 1 - s);
          const colStart = Math.min(...visualCols);
          const colEnd = Math.max(...visualCols) + 1;
          overlays.push({ colStart, colEnd, rowStart: 1, rowEnd: 3 });
        } else {
          const colStart = Math.min(...spaces);
          const colEnd = Math.max(...spaces) + 1;
          overlays.push({ colStart, colEnd, rowStart: 3, rowEnd: 5 });
        }
      }
    };
    addOverlays(topSlot, true);
    addOverlays(bottomSlot, false);
    return overlays;
  });
}
