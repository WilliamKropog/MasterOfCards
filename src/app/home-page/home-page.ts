import { Component, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { Router } from '@angular/router';
import { NavBar } from '../nav-bar/nav-bar';
import { SideNav } from '../side-nav/side-nav';

@Component({
  selector: 'app-home-page',
  imports: [NavBar, SideNav, MatButton],
  templateUrl: './home-page.html',
  styleUrl: './home-page.css',
})
export class HomePage {
  private readonly router = inject(Router);

  protected onStartGame(): void {
    void this.router.navigate(['/game']);
  }
}
