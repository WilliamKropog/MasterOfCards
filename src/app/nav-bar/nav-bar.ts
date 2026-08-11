import { Component, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-nav-bar',
  imports: [RouterLink, RouterLinkActive, MatButton],
  templateUrl: './nav-bar.html',
  styleUrl: './nav-bar.css',
})
export class NavBar {
  private readonly router = inject(Router);

  protected onStartGame(): void {
    void this.router.navigate(['/game']);
  }
}
