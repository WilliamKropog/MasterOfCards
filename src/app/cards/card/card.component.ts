import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import {CreatureCard, LandCard, SpellCard } from '../../models/card';

@Component({
    selector: 'app-card',
    imports: [
        CommonModule,
    ],
    templateUrl: './card.component.html',
    styleUrl: './card.component.css'
})
export class CardComponent {
  @Input() card!: CreatureCard | SpellCard | LandCard;

  get isFree(): boolean {
    return Object.keys(this.card.cost).length === 0;
  }

  get costEntries() {
    return Object.entries(this.card.cost).map(([key, value]) => ({key, value}));
  }

  get generationEntries() {
    if (this.card.cardType !== 'Land') return [];
    const land = this.card as LandCard;
    return Object.entries(land.generation).map(([key, value]) => ({ key, value}));
  }

}
