import { Injectable, OnDestroy, inject, signal } from '@angular/core';
import { Auth, authState } from '@angular/fire/auth';
import {
  Firestore,
  collection,
  onSnapshot,
  type Unsubscribe,
} from '@angular/fire/firestore';
import { Subscription } from 'rxjs';

/**
 * Live ownership counts for the signed-in user's cardCollection,
 * keyed by catalogCardId (e.g. "rock-monster" → 3).
 */
@Injectable({ providedIn: 'root' })
export class CardCollectionService implements OnDestroy {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(Auth);

  /** catalogCardId → number of owned instances. */
  readonly ownedCounts = signal<Readonly<Record<string, number>>>({});
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  private authSub: Subscription | null = null;
  private collectionUnsub: Unsubscribe | null = null;

  constructor() {
    this.authSub = authState(this.auth).subscribe((user) => {
      this.detachCollection();
      if (!user) {
        this.ownedCounts.set({});
        this.loading.set(false);
        this.error.set(null);
        return;
      }
      this.attachCollection(user.uid);
    });
  }

  ownedCount(catalogCardId: string): number {
    return this.ownedCounts()[catalogCardId] ?? 0;
  }

  ngOnDestroy(): void {
    this.authSub?.unsubscribe();
    this.authSub = null;
    this.detachCollection();
  }

  private attachCollection(uid: string): void {
    this.loading.set(true);
    this.error.set(null);
    const colRef = collection(this.firestore, 'users', uid, 'cardCollection');
    this.collectionUnsub = onSnapshot(
      colRef,
      (snap) => {
        const counts: Record<string, number> = {};
        for (const docSnap of snap.docs) {
          const catalogCardId = docSnap.data()['catalogCardId'];
          if (typeof catalogCardId !== 'string' || !catalogCardId) {
            continue;
          }
          counts[catalogCardId] = (counts[catalogCardId] ?? 0) + 1;
        }
        this.ownedCounts.set(counts);
        this.loading.set(false);
      },
      (err) => {
        this.error.set(err.message || 'Could not load card collection.');
        this.loading.set(false);
      },
    );
  }

  private detachCollection(): void {
    if (this.collectionUnsub) {
      this.collectionUnsub();
      this.collectionUnsub = null;
    }
  }
}
