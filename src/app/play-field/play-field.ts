import { Component } from '@angular/core';
import { FieldRow } from '../field-row/field-row';

@Component({
  selector: 'app-play-field',
  imports: [FieldRow],
  templateUrl: './play-field.html',
  styleUrl: './play-field.css',
})
export class PlayField {}
