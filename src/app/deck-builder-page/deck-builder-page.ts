import { Component } from '@angular/core';
import { CardCollection } from '../card-collection/card-collection';
import { CardInfo } from '../card-info/card-info';
import { DeckBuilder } from '../deck-builder/deck-builder';
import { NavBar } from '../nav-bar/nav-bar';
import { SideNav } from '../side-nav/side-nav';

@Component({
  selector: 'app-deck-builder-page',
  imports: [NavBar, SideNav, DeckBuilder, CardCollection, CardInfo],
  templateUrl: './deck-builder-page.html',
  styleUrl: './deck-builder-page.css',
})
export class DeckBuilderPage {}
