import { Injectable, OnDestroy, inject, signal } from '@angular/core';
import { Auth, authState } from '@angular/fire/auth';
import { Firestore, doc, onSnapshot, type Unsubscribe } from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Subscription } from 'rxjs';

type ClaimLocalMatchRewardResponse = {
  ok: boolean;
  awarded: number;
  blueOrbs: number;
  alreadyGranted?: boolean;
};

/**
 * Live Blue Orbs balance for the signed-in user (server-written only).
 */
@Injectable({ providedIn: 'root' })
export class BlueOrbsService implements OnDestroy {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(Auth);
  private readonly functions = inject(Functions);

  /** Current balance; 0 when signed out or the field is unset. */
  readonly blueOrbs = signal(0);
  readonly loading = signal(false);

  private authSub: Subscription | null = null;
  private profileUnsub: Unsubscribe | null = null;

  constructor() {
    this.authSub = authState(this.auth).subscribe((user) => {
      this.detachProfile();
      if (!user) {
        this.blueOrbs.set(0);
        this.loading.set(false);
        return;
      }
      this.loading.set(true);
      const userRef = doc(this.firestore, 'users', user.uid);
      this.profileUnsub = onSnapshot(
        userRef,
        (snap) => {
          const raw = snap.data()?.['blueOrbs'];
          this.blueOrbs.set(typeof raw === 'number' && Number.isFinite(raw) ? raw : 0);
          this.loading.set(false);
        },
        () => {
          this.blueOrbs.set(0);
          this.loading.set(false);
        },
      );
    });
  }

  ngOnDestroy(): void {
    this.authSub?.unsubscribe();
    this.detachProfile();
  }

  /**
   * Persist a local-match completion reward once. `completionId` must stay stable
   * across retries for the same finished match so the grant stays idempotent.
   */
  async claimLocalMatchReward(completionId: string): Promise<ClaimLocalMatchRewardResponse> {
    const callable = httpsCallable(this.functions, 'claimLocalMatchReward');
    const result = await callable({ completionId });
    return result.data as ClaimLocalMatchRewardResponse;
  }

  private detachProfile(): void {
    if (this.profileUnsub) {
      this.profileUnsub();
      this.profileUnsub = null;
    }
  }
}
