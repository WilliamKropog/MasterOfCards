import { Injectable, inject, signal } from '@angular/core';
import { Auth, authState } from '@angular/fire/auth';
import {
  Firestore,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
  type Unsubscribe,
} from '@angular/fire/firestore';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';

export interface LiveMatchPlayer {
  uid: string;
  username: string;
}

export interface LiveMatch {
  id: string;
  player1: LiveMatchPlayer;
  player2: LiveMatchPlayer;
  createdAt?: unknown;
  status: 'active';
}

@Injectable({ providedIn: 'root' })
export class MatchmakingService {
  private readonly auth = inject(Auth);
  private readonly firestore = inject(Firestore);
  private readonly router = inject(Router);

  readonly searching = signal(false);
  readonly error = signal('');

  private queueUnsub: Unsubscribe | null = null;
  private pairTimer: ReturnType<typeof setInterval> | null = null;
  /** Uid of the player currently in queue (kept so logout can still delete the queue doc). */
  private searchingUid: string | null = null;

  constructor() {
    authState(this.auth).subscribe((user) => {
      if (!user && this.searching()) {
        void this.cancelLiveSearch();
      }
    });
  }

  async startLiveSearch(): Promise<void> {
    this.error.set('');
    const user = this.auth.currentUser;
    if (!user) {
      // Wait briefly for auth hydration if needed.
      const hydrated = await firstValueFrom(authState(this.auth).pipe(take(1)));
      if (!hydrated) {
        this.error.set('Log in before starting a live game.');
        return;
      }
      return this.startLiveSearchWithUser(hydrated.uid, hydrated.displayName);
    }
    return this.startLiveSearchWithUser(user.uid, user.displayName);
  }

  private async startLiveSearchWithUser(
    uid: string,
    displayName: string | null,
  ): Promise<void> {
    if (this.searching()) {
      return;
    }

    const username = await this.resolveUsername(uid, displayName);
    const queueRef = doc(this.firestore, 'matchmakingQueue', uid);

    this.searchingUid = uid;
    this.searching.set(true);

    await setDoc(queueRef, {
      uid,
      username,
      status: 'waiting',
      matchId: null,
      createdAt: serverTimestamp(),
    });

    this.queueUnsub = onSnapshot(queueRef, (snap) => {
      const data = snap.data();
      if (data?.['status'] === 'matched' && typeof data['matchId'] === 'string') {
        void this.onMatched(data['matchId'] as string);
      }
    });

    await this.tryPair(uid, username);
    this.pairTimer = setInterval(() => {
      void this.tryPair(uid, username);
    }, 2000);
  }

  async cancelLiveSearch(): Promise<void> {
    this.error.set('');
    const uid = this.auth.currentUser?.uid ?? this.searchingUid;
    this.clearSearchListeners();
    this.searching.set(false);
    this.searchingUid = null;

    if (!uid) {
      return;
    }

    try {
      await deleteDoc(doc(this.firestore, 'matchmakingQueue', uid));
    } catch {
      // Ignore if already removed by a successful match.
    }
  }

  async loadMatch(matchId: string): Promise<LiveMatch | null> {
    const snap = await getDoc(doc(this.firestore, 'matches', matchId));
    if (!snap.exists()) {
      return null;
    }
    const data = snap.data();
    return {
      id: matchId,
      player1: data['player1'] as LiveMatchPlayer,
      player2: data['player2'] as LiveMatchPlayer,
      createdAt: data['createdAt'],
      status: data['status'] as 'active',
    };
  }

  private async onMatched(matchId: string): Promise<void> {
    const wasSearching = this.searching();
    const uid = this.auth.currentUser?.uid ?? this.searchingUid;
    this.clearSearchListeners();
    this.searching.set(false);
    this.searchingUid = null;

    if (uid) {
      try {
        await deleteDoc(doc(this.firestore, 'matchmakingQueue', uid));
      } catch {
        // Already cleaned up.
      }
    }

    if (wasSearching || this.router.url.split('#')[0] !== '/game') {
      await this.router.navigate(['/game'], { fragment: matchId });
    }
  }

  private async tryPair(myUid: string, myUsername: string): Promise<void> {
    if (!this.searching()) {
      return;
    }

    const myRef = doc(this.firestore, 'matchmakingQueue', myUid);
    const mySnap = await getDoc(myRef);
    if (!mySnap.exists() || mySnap.data()?.['status'] !== 'waiting') {
      return;
    }

    const waitingQuery = query(
      collection(this.firestore, 'matchmakingQueue'),
      where('status', '==', 'waiting'),
      orderBy('createdAt', 'asc'),
      limit(8),
    );

    let candidates;
    try {
      candidates = await getDocs(waitingQuery);
    } catch (error) {
      console.error('Matchmaking query failed', error);
      this.error.set('Matchmaking failed. Please try again.');
      return;
    }

    const partner = candidates.docs.find((d) => d.id !== myUid);
    if (!partner) {
      return;
    }

    const partnerUid = partner.id;
    const partnerUsername =
      typeof partner.data()['username'] === 'string'
        ? (partner.data()['username'] as string)
        : 'Player';

    const matchId = this.createMatchId();
    const iAmPlayer1 = Math.random() < 0.5;
    const player1 = iAmPlayer1
      ? { uid: myUid, username: myUsername }
      : { uid: partnerUid, username: partnerUsername };
    const player2 = iAmPlayer1
      ? { uid: partnerUid, username: partnerUsername }
      : { uid: myUid, username: myUsername };

    try {
      await runTransaction(this.firestore, async (transaction) => {
        const latestMe = await transaction.get(myRef);
        const partnerRef = doc(this.firestore, 'matchmakingQueue', partnerUid);
        const latestPartner = await transaction.get(partnerRef);

        if (!latestMe.exists() || latestMe.data()?.['status'] !== 'waiting') {
          return;
        }
        if (!latestPartner.exists() || latestPartner.data()?.['status'] !== 'waiting') {
          return;
        }

        const matchRef = doc(this.firestore, 'matches', matchId);
        transaction.set(matchRef, {
          player1,
          player2,
          status: 'active',
          createdAt: serverTimestamp(),
        });
        transaction.update(myRef, { status: 'matched', matchId });
        transaction.update(partnerRef, { status: 'matched', matchId });
      });
    } catch (error) {
      console.error('Failed to create match', error);
    }
  }

  private async resolveUsername(uid: string, displayName: string | null): Promise<string> {
    if (displayName?.trim()) {
      return displayName.trim();
    }
    try {
      const profile = await getDoc(doc(this.firestore, 'users', uid));
      const username = profile.data()?.['username'];
      if (typeof username === 'string' && username.trim()) {
        return username.trim();
      }
    } catch {
      // Fall through.
    }
    return 'Player';
  }

  private createMatchId(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = crypto.getRandomValues(new Uint8Array(10));
    return Array.from(bytes, (b) => chars[b % chars.length]).join('');
  }

  private clearSearchListeners(): void {
    if (this.queueUnsub) {
      this.queueUnsub();
      this.queueUnsub = null;
    }
    if (this.pairTimer) {
      clearInterval(this.pairTimer);
      this.pairTimer = null;
    }
  }
}
