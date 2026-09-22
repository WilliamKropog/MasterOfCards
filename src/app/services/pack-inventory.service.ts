import { Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import { Auth, authState } from '@angular/fire/auth';
import {
  Firestore,
  collection,
  onSnapshot,
  type Unsubscribe,
} from '@angular/fire/firestore';
import { Subscription } from 'rxjs';
import { getPackDefinition, isPackId, type PackId } from '../game/pack-catalog';
import type { OwnedPack } from '../game/owned-pack';

export interface PackStackView {
  packId: PackId;
  name: string;
  count: number;
  /** One sealed instance id (used when opening a pack from the stack). */
  ownedPackId: string;
}

/**
 * Live sealed-pack instances for the signed-in user's packInventory.
 */
@Injectable({ providedIn: 'root' })
export class PackInventoryService implements OnDestroy {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(Auth);

  readonly ownedPacks = signal<readonly OwnedPack[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

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
        ownedPackId: pack.ownedPackId,
      });
    }
    return Array.from(stacks.values()).sort((a, b) => a.name.localeCompare(b.name));
  });

  private authSub: Subscription | null = null;
  private inventoryUnsub: Unsubscribe | null = null;

  constructor() {
    this.authSub = authState(this.auth).subscribe((user) => {
      this.detachInventory();
      if (!user) {
        this.ownedPacks.set([]);
        this.loading.set(false);
        this.error.set(null);
        return;
      }
      this.attachInventory(user.uid);
    });
  }

  ngOnDestroy(): void {
    this.authSub?.unsubscribe();
    this.authSub = null;
    this.detachInventory();
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
      },
      (err) => {
        this.error.set(err.message || 'Could not load pack inventory.');
        this.loading.set(false);
      },
    );
  }

  private detachInventory(): void {
    if (this.inventoryUnsub) {
      this.inventoryUnsub();
      this.inventoryUnsub = null;
    }
  }
}
