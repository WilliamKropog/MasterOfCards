import { Component } from '@angular/core';
import { NavBar } from '../nav-bar/nav-bar';
import { SideNav } from '../side-nav/side-nav';

@Component({
  selector: 'app-collection-page',
  imports: [NavBar, SideNav],
  templateUrl: './collection-page.html',
  styleUrl: './collection-page.css',
})
export class CollectionPage {}
