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
})
export class PlayField {
  protected readonly engine = inject(GameEngineService);

  protected readonly landInfluenceOverlays = computed((): LandInfluenceOverlay[] => {
    const overlays: LandInfluenceOverlay[] = [];
    const addOverlays = (slot: FieldPlayerSlot) => {
      const lands = slot === 'player1'
        ? this.engine.player1FieldLand()
        : this.engine.player2FieldLand();
      for (const entry of lands) {
        const spaces = entry.influencedSpaces;
        if (!spaces || spaces.length === 0) { continue; }
        const colStart = Math.min(...spaces);
        const colEnd = Math.max(...spaces) + 1;
        if (slot === 'player1') {
          overlays.push({ colStart, colEnd, rowStart: 1, rowEnd: 3 });
        } else {
          overlays.push({ colStart, colEnd, rowStart: 3, rowEnd: 5 });
        }
      }
    };
    addOverlays('player1');
    addOverlays('player2');
    return overlays;
  });
}
