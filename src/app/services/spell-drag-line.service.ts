import { Injectable, inject, signal } from '@angular/core';
import type { CdkDragMove } from '@angular/cdk/drag-drop';
import type { FieldZone, FieldPlayerSlot, SpellTetherTarget } from './game-engine.service';
import type { PlayerSlot } from '../player-hand/player-hand';
import { CardDragService } from './card-drag.service';

type SpellSnapCandidate =
  | { kind: 'card'; el: HTMLElement; cx: number; cy: number; d: number }
  | { kind: 'hand'; cx: number; cy: number; d: number; slot: PlayerSlot };

/** Re-export for consumers that only import this service. */
export type { SpellTetherTarget } from './game-engine.service';

/** Viewport segment in client (pixel) coordinates. */
export interface SpellDragLineSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Distance from spell (drag preview) center to target center for snap + line. */
export const SPELL_DRAG_SNAP_RADIUS_PX = 200;

@Injectable({
  providedIn: 'root',
})
export class SpellDragLineService {
  private readonly cardDrag = inject(CardDragService);

  readonly line = signal<SpellDragLineSegment | null>(null);
  readonly tetherTarget = signal<SpellTetherTarget | null>(null);
  /** Opponent `player-hand` section under the pointer while dragging a spell (for LP / hand targeting). */
  readonly spellDragOverEnemyHand = signal<PlayerSlot | null>(null);
  /**
   * Enemy hand is the nearest snap target (within radius) — drives tether styling on that hand,
   * same as field `card--spell-tether-active`.
   */
  readonly spellSnapHandTarget = signal<PlayerSlot | null>(null);

  /**
   * Call while a spell card is moving from hand. Uses `.cdk-drag-preview` center when present,
   * else pointer position, as the “spell card” anchor; draws to the nearest eligible target:
   * `.card.card--spell-target` or `.player-hand.player-hand--spell-drag-eligible`, within
   * {@link SPELL_DRAG_SNAP_RADIUS_PX}.
   */
  updateFromDragMove(event: CdkDragMove): void {
    this.updateEnemyHandHover(event.pointerPosition);

    const from = this.getDragPreviewCenter() ?? event.pointerPosition;
    let best: SpellSnapCandidate | null = null;

    for (const el of document.querySelectorAll<HTMLElement>('.card.card--spell-target')) {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) {
        continue;
      }
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const d = Math.hypot(from.x - cx, from.y - cy);
      if (d <= SPELL_DRAG_SNAP_RADIUS_PX && (!best || d < best.d)) {
        best = { kind: 'card', el, cx, cy, d };
      }
    }

    for (const el of document.querySelectorAll<HTMLElement>(
      '.player-hand.player-hand--spell-drag-eligible',
    )) {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) {
        continue;
      }
      const slotAttr = el.getAttribute('data-player-slot');
      if (slotAttr !== 'player1' && slotAttr !== 'player2') {
        continue;
      }
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const d = Math.hypot(from.x - cx, from.y - cy);
      if (d <= SPELL_DRAG_SNAP_RADIUS_PX && (!best || d < best.d)) {
        best = { kind: 'hand', cx, cy, d, slot: slotAttr as PlayerSlot };
      }
    }

    if (!best) {
      this.line.set(null);
      this.tetherTarget.set(null);
      this.spellSnapHandTarget.set(null);
      this.syncSpellDragPreviewCompact(false);
      return;
    }
    this.line.set({
      x1: from.x,
      y1: from.y,
      x2: best.cx,
      y2: best.cy,
    });
    if (best.kind === 'card') {
      this.tetherTarget.set(this.readTetherFromElement(best.el));
      this.spellSnapHandTarget.set(null);
    } else {
      this.tetherTarget.set(null);
      this.spellSnapHandTarget.set(best.slot);
    }
    this.syncSpellDragPreviewCompact(true);
  }

  clear(): void {
    this.line.set(null);
    this.tetherTarget.set(null);
    this.spellDragOverEnemyHand.set(null);
    this.spellSnapHandTarget.set(null);
    this.syncSpellDragPreviewCompact(false);
  }

  /** Call when starting a non-spell drag so hand highlight does not linger. */
  clearEnemyHandHover(): void {
    this.spellDragOverEnemyHand.set(null);
  }

  private updateEnemyHandHover(point: { x: number; y: number }): void {
    const drag = this.cardDrag.activeDrag();
    if (!drag || drag.cardType !== 'Spell') {
      this.spellDragOverEnemyHand.set(null);
      return;
    }
    const own = drag.ownerPlayerSlot;
    const stack = document.elementsFromPoint(point.x, point.y);
    let slotAttr: string | null = null;
    for (const node of stack) {
      if (!(node instanceof Element)) {
        continue;
      }
      if (node.closest('.cdk-drag-preview')) {
        continue;
      }
      const hand = node.closest('.player-hand[data-player-slot]');
      if (hand) {
        slotAttr = hand.getAttribute('data-player-slot');
        break;
      }
    }
    if (slotAttr !== 'player1' && slotAttr !== 'player2') {
      this.spellDragOverEnemyHand.set(null);
      return;
    }
    if (slotAttr === own) {
      this.spellDragOverEnemyHand.set(null);
      return;
    }
    this.spellDragOverEnemyHand.set(slotAttr as PlayerSlot);
  }

  private readTetherFromElement(el: HTMLElement): SpellTetherTarget | null {
    const slot = el.getAttribute('data-field-slot');
    const zone = el.getAttribute('data-field-zone');
    const indexRaw = el.getAttribute('data-field-index');
    if (slot !== 'player1' && slot !== 'player2') {
      return null;
    }
    if (zone !== 'land' && zone !== 'monster') {
      return null;
    }
    if (indexRaw === null || indexRaw === '') {
      return null;
    }
    const index = Number(indexRaw);
    if (!Number.isInteger(index) || index < 0) {
      return null;
    }
    return { slot: slot as FieldPlayerSlot, zone: zone as FieldZone, index };
  }

  /**
   * Collapses the floating spell preview visually (matches inactive-hand compact styling) while a
   * snap line is active — the preview is a static CDK clone, so this toggles a CSS hook on it.
   */
  private syncSpellDragPreviewCompact(active: boolean): void {
    const preview = document.querySelector('.cdk-drag-preview.card') as HTMLElement | null;
    if (!preview) {
      if (active) {
        requestAnimationFrame(() => {
          document.querySelector('.cdk-drag-preview.card')?.classList.add('spell-drag-preview--compact');
        });
      }
      return;
    }
    preview.classList.toggle('spell-drag-preview--compact', active);
  }

  private getDragPreviewCenter(): { x: number; y: number } | null {
    const el = document.querySelector('.cdk-drag-preview') as HTMLElement | null;
    if (!el) {
      return null;
    }
    const r = el.getBoundingClientRect();
    if (r.width < 4 && r.height < 4) {
      return null;
    }
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
}
