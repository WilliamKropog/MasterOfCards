import { Component } from '@angular/core';

@Component({
  selector: 'app-rock-monster',
  standalone: true,
  imports: [],
  templateUrl: './rock-monster.component.html',
  styleUrl: './rock-monster.component.css'
})
export class RockMonsterComponent {
  name: String = "Rock Monster";
  type: String = "creature";
  element: String = "Rock";
  rarity: String = "common";
  cost: String = "0";
  image: String = "../../assets/images/icons/creatures/RockMonster.png";
  class: String = "Elemental";
  perks: String = "Melee";
  description: String = "No description";
  attack: number = 10;
  health: number = 80;
}
