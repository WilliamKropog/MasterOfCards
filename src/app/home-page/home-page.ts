import { Component } from '@angular/core';
import { NavBar } from '../nav-bar/nav-bar';
import { SideNav } from '../side-nav/side-nav';

@Component({
  selector: 'app-home-page',
  imports: [NavBar, SideNav],
  templateUrl: './home-page.html',
  styleUrl: './home-page.css',
})
export class HomePage {}
