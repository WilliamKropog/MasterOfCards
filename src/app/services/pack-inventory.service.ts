import { Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import { Auth, authState } from '@angular/fire/auth';
import {
  Firestore,
  collection,
  onSnapshot,
  type Unsubscribe,
} from '@angular/fire/firestore';
import { NavigationEnd, Router } from '@angular/router';
import { Subscription, filter } from 'rxjs';
import { getPackDefinition, isPackId, type PackId } from '../game/pack-catalog';
import type { OwnedPack } from '../game/owned-pack';

export interface PackStackView {
  packId: PackId;
  name: string;
  count: number;
  shape: 'square' | 'pentagon';
  /** One sealed instance id (used when opening a pack from the stack). */
  ownedPackId: string;
}

const SEEN_PACKS_STORAGE_PREFIX = 'moc.packInventory.seen.';

/**
 * Live sealed-pack instances for the signed-in user's packInventory.
 */
@Injectable({ providedIn: 'root' })
export class PackInventoryService implements OnDestroy {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);

  readonly ownedPacks = signal<readonly OwnedPack[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  /** True when inventory has sealed packs the user has not viewed on Collection yet. */
  readonly hasUnseenPacks = signal(false);

  /** Stacked sealed packs for Collection UI (by packId). */
  readonly packStacks = computed((): PackStackView[] => {
    const stacks = new Map<PackId, PackStackView>();
    for (const pack of this.ownedPacks()) {
      if (pack.status !== 'sealed') {
        continue;
      }
      const existing = stacks.get(pack.packId);
      if (existing) {
        existing.count += 1;
        continue;
      }
      const def = getPackDefinition(pack.packId);
      stacks.set(pack.packId, {
        packId: pack.packId,
        name: def?.name ?? pack.packId,
        count: 1,
        shape: def?.shape ?? 'square',
        ownedPackId: pack.ownedPackId,
      });
    }
    return Array.from(stacks.values()).sort((a, b) => a.name.localeCompare(b.name));
  });

  private authSub: Subscription | null = null;
  private routerSub: Subscription | null = null;
  private inventoryUnsub: Unsubscribe | null = null;
  private activeUid: string | null = null;
  private seenOwnedPackIds = new Set<string>();

  constructor() {
    this.authSub = authState(this.auth).subscribe((user) => {
      this.detachInventory();
      this.activeUid = user?.uid ?? null;
      this.hasUnseenPacks.set(false);
      if (!user) {
        this.ownedPacks.set([]);
        this.seenOwnedPackIds = new Set();
        this.loading.set(false);
        this.error.set(null);
        return;
      }
      this.seenOwnedPackIds = this.loadSeenIds(user.uid);
      this.attachInventory(user.uid);
    });

    this.routerSub = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(() => {
        if (this.isOnCollectionRoute()) {
          this.markPacksSeen();
        }
      });
  }

  /** Clears the Collection nav badge and remembers current sealed packs as seen. */
  markPacksSeen(): void {
    const uid = this.activeUid;
    const ids = this.ownedPacks().map((pack) => pack.ownedPackId);
    this.seenOwnedPackIds = new Set(ids);
    if (uid) {
      this.persistSeenIds(uid, this.seenOwnedPackIds);
    }
    this.hasUnseenPacks.set(false);
  }

  ngOnDestroy(): void {
    this.authSub?.unsubscribe();
    this.authSub = null;
    this.routerSub?.unsubscribe();
    this.routerSub = null;
    this.detachInventory();
  }

  private isOnCollectionRoute(): boolean {
    const url = this.router.url.split('?')[0]?.split('#')[0] ?? '';
    return url === '/collection' || url.endsWith('/collection');
  }

  private attachInventory(uid: string): void {
    this.loading.set(true);
    this.error.set(null);
    const colRef = collection(this.firestore, 'users', uid, 'packInventory');
    this.inventoryUnsub = onSnapshot(
      colRef,
      (snap) => {
        const packs: OwnedPack[] = [];
        for (const docSnap of snap.docs) {
          const data = docSnap.data();
          if (!isPackId(data['packId'])) {
            continue;
          }
          if (data['status'] !== 'sealed') {
            continue;
          }
          packs.push({
            ownedPackId: docSnap.id,
            packId: data['packId'],
            status: 'sealed',
            source: typeof data['source'] === 'string' ? data['source'] : '',
          });
        }
        this.ownedPacks.set(packs);
        this.loading.set(false);
        this.reconcileUnseen(packs);
      },
      (err) => {
        this.error.set(err.message || 'Could not load pack inventory.');
        this.loading.set(false);
      },
    );
  }

  private reconcileUnseen(packs: readonly OwnedPack[]): void {
    if (this.isOnCollectionRoute()) {
      this.markPacksSeen();
      return;
    }
    const hasUnseen = packs.some((pack) => !this.seenOwnedPackIds.has(pack.ownedPackId));
    this.hasUnseenPacks.set(hasUnseen);
  }

  private loadSeenIds(uid: string): Set<string> {
    try {
      const raw = localStorage.getItem(SEEN_PACKS_STORAGE_PREFIX + uid);
      if (!raw) {
        return new Set();
      }
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return new Set();
      }
      return new Set(parsed.filter((id): id is string => typeof id === 'string'));
    } catch {
      return new Set();
    }
  }

  private persistSeenIds(uid: string, ids: Set<string>): void {
    try {
      localStorage.setItem(SEEN_PACKS_STORAGE_PREFIX + uid, JSON.stringify([...ids]));
    } catch {
      // Ignore quota / private mode failures.
    }
  }

  private detachInventory(): void {
    if (this.inventoryUnsub) {
      this.inventoryUnsub();
      this.inventoryUnsub = null;
    }
  }
}
