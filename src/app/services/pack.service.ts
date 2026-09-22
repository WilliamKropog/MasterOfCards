import { Injectable, inject, signal } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Auth } from '@angular/fire/auth';
import type { OwnedCard } from '../game/owned-card';
import { getCardDefinition } from '../game/card-catalog';
import { getPackDefinition, type PackId } from '../game/pack-catalog';

export type PackOpenPhase = 'idle' | 'pressed' | 'generating' | 'success' | 'error';

export interface PackOpenProgress {
  phase: PackOpenPhase;
  message: string;
  cards: OwnedCard[];
  error: string | null;
}

type GrantPackResponse = {
  ok: boolean;
  ownedPackId: string;
  packId: PackId;
  name: string;
};

type OpenOwnedPackResponse = {
  ok: boolean;
  packId: PackId;
  packSize: number;
  cards: OwnedCard[];
};

@Injectable({ providedIn: 'root' })
export class PackService {
  private readonly functions = inject(Functions);
  private readonly auth = inject(Auth);

  readonly progress = signal<PackOpenProgress>({
    phase: 'idle',
    message: '',
    cards: [],
    error: null,
  });

  readonly opening = signal(false);
  readonly granting = signal(false);
  readonly grantError = signal<string | null>(null);

  /**
   * Grants one sealed Rock Booster Pack into the user's packInventory.
   */
  async grantRockBoosterPack(): Promise<void> {
    return this.grantPack('rock-booster');
  }

  async grantPack(packId: PackId): Promise<void> {
    if (this.granting()) {
      return;
    }
    if (!this.auth.currentUser) {
      this.grantError.set('Sign in to receive a pack.');
      return;
    }

    this.granting.set(true);
    this.grantError.set(null);
    const label = getPackDefinition(packId)?.name ?? packId;
    console.log(`[Pack] Granting ${label}…`);

    try {
      const callable = httpsCallable<{ packId: PackId }, GrantPackResponse>(
        this.functions,
        'grantPack',
      );
      const result = await callable({ packId });
      console.log(
        `[Pack] Granted ${result.data?.name ?? label} (${result.data?.ownedPackId}).`,
      );
    } catch (error) {
      const message =
        typeof error === 'object' &&
        error !== null &&
        'message' in error &&
        typeof (error as { message: unknown }).message === 'string'
          ? (error as { message: string }).message
          : 'Could not grant pack.';
      this.grantError.set(message);
      console.error('[Pack] Grant failed.', message, error);
    } finally {
      this.granting.set(false);
    }
  }

  /**
   * Opens one sealed pack from inventory: server consumes it and mints cards.
   */
  async openOwnedPack(ownedPackId: string): Promise<void> {
    if (this.opening()) {
      return;
    }
    if (!this.auth.currentUser) {
      const message = 'Sign in to open a pack.';
      this.progress.set({
        phase: 'error',
        message,
        cards: [],
        error: message,
      });
      return;
    }

    this.opening.set(true);
    this.progress.set({
      phase: 'pressed',
      message: 'Opening pack…',
      cards: [],
      error: null,
    });

    try {
      this.progress.update((p) => ({
        ...p,
        phase: 'generating',
        message: 'Waiting for cards to generate…',
      }));

      const callable = httpsCallable<{ ownedPackId: string }, OpenOwnedPackResponse>(
        this.functions,
        'openOwnedPack',
      );
      const result = await callable({ ownedPackId });
      const cards = result.data?.cards ?? [];
      const packName =
        getPackDefinition(result.data?.packId ?? '')?.name ?? 'Pack';

      this.progress.set({
        phase: 'success',
        message: `${packName} opened — ${cards.length} cards added to your collection.`,
        cards,
        error: null,
      });

      console.log(
        `[Pack] ${packName} opened — ${cards.length} cards added to your collection.`,
      );
      console.table(
        cards.map((card) => ({
          ownedCardId: card.ownedCardId,
          name: this.catalogDisplayName(card.catalogCardId),
          catalogCardId: card.catalogCardId,
          cardQuality: card.cardQuality,
          specialty: card.specialty,
          foil: card.foil,
          skin: card.skin,
          source: card.source,
        })),
      );
    } catch (error) {
      const message =
        typeof error === 'object' &&
        error !== null &&
        'message' in error &&
        typeof (error as { message: unknown }).message === 'string'
          ? (error as { message: string }).message
          : 'Could not open pack.';
      this.progress.set({
        phase: 'error',
        message: 'Pack open failed.',
        cards: [],
        error: message,
      });
      console.error('[Pack] Open failed.', message, error);
    } finally {
      this.opening.set(false);
    }
  }

  clearProgress(): void {
    this.progress.set({
      phase: 'idle',
      message: '',
      cards: [],
      error: null,
    });
  }

  /** Display name from the local catalog for a rolled catalog id. */
  catalogDisplayName(catalogCardId: string): string {
    return getCardDefinition(catalogCardId)?.name ?? catalogCardId;
  }
}
