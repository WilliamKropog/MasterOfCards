import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButton } from '@angular/material/button';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { MatchmakingService } from '../services/matchmaking.service';
import { PackService } from '../services/pack.service';

@Component({
  selector: 'app-nav-bar',
  imports: [RouterLink, RouterLinkActive, MatButton],
  templateUrl: './nav-bar.html',
  styleUrl: './nav-bar.css',
})
export class NavBar {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  protected readonly matchmaking = inject(MatchmakingService);
  protected readonly pack = inject(PackService);

  protected readonly user = toSignal(this.auth.user$, { initialValue: null });

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

  protected onGrantRockBoosterClick(): void {
    void this.pack.grantRockBoosterPack();
  }
}
