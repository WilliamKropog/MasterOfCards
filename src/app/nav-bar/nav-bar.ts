import { Component, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { MatchmakingService } from '../services/matchmaking.service';

@Component({
  selector: 'app-nav-bar',
  imports: [RouterLink, RouterLinkActive, MatButton],
  templateUrl: './nav-bar.html',
  styleUrl: './nav-bar.css',
})
export class NavBar {
  private readonly router = inject(Router);
  protected readonly matchmaking = inject(MatchmakingService);

  protected onStartLocalGame(): void {
    if (this.matchmaking.searching()) {
      return;
    }
    void this.router.navigate(['/game']);
  }

  protected onStartLiveGame(): void {
    void this.matchmaking.startLiveSearch();
  }

  protected onCancelLiveSearch(): void {
    void this.matchmaking.cancelLiveSearch();
  }
}
