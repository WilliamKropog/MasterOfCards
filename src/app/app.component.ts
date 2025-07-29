import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CardComponent } from './cards/card/card.component';
import { CreatureCard, SpellCard, LandCard } from './models/card';
import { ROCK_MONSTER, BOULDER_TOSS, MOUNTAIN_RANGE, GRAND_GOPHER, TEMPLE_OF_BEING, MUD_HUT, ARMOREDILLO, RUPTAR, ELDER_GOPHER_STATUE, ROCK_SLIDE, ROCKTERRIOR, EXCAVATION_SITE, EARTH_SHATTER, THOUSAND_MILE_WALL, KING_COLOSSUS } from './data/mock-cards';
import { CommonModule } from '@angular/common';
import { NavbarComponent } from './navbar/navbar.component';
import { AuthenticationComponent } from './pages/authentication/authentication.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet, 
    CardComponent,
    CommonModule,
    NavbarComponent,
    AuthenticationComponent
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'master-of-cards';

  //Example cards. Use <app-card [card]="rockMonster"> to instantiate.
  rockMonster: CreatureCard = ROCK_MONSTER;
  boulderToss: SpellCard = BOULDER_TOSS;
  mountainRange: LandCard = MOUNTAIN_RANGE;
  grandGopher: CreatureCard = GRAND_GOPHER;
  templeOfBeing: LandCard = TEMPLE_OF_BEING;
  mudHut: LandCard = MUD_HUT;
  armoredillo: CreatureCard = ARMOREDILLO;
  ruptar: CreatureCard = RUPTAR;
  elderGopherStatue: LandCard = ELDER_GOPHER_STATUE;
  rockSlide: SpellCard = ROCK_SLIDE;
  rockterrior: CreatureCard = ROCKTERRIOR;
  excavationSite: LandCard = EXCAVATION_SITE;
  earthShatter: SpellCard = EARTH_SHATTER;
  thousandMileWall: LandCard = THOUSAND_MILE_WALL;
  kingColossus: CreatureCard = KING_COLOSSUS;
}
