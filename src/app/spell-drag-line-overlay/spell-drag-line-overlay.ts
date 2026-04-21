import { Component, inject } from '@angular/core';
import { SpellDragLineService } from '../services/spell-drag-line.service';

@Component({
  selector: 'app-spell-drag-line-overlay',
  templateUrl: './spell-drag-line-overlay.html',
  styleUrl: './spell-drag-line-overlay.css',
})
export class SpellDragLineOverlay {
  protected readonly spellLine = inject(SpellDragLineService);
}
