import { Component } from '@angular/core';
import { NavBar } from '../nav-bar/nav-bar';
import { SideNav } from '../side-nav/side-nav';

@Component({
  selector: 'app-deck-builder-page',
  imports: [NavBar, SideNav],
  templateUrl: './deck-builder-page.html',
  styleUrl: './deck-builder-page.css',
})
export class DeckBuilderPage {}
