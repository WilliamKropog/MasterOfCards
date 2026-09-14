import { Injectable, inject, signal } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Auth } from '@angular/fire/auth';
import type { OwnedCard } from '../game/owned-card';
import { getCardDefinition } from '../game/card-catalog';

export type PackOpenPhase = 'idle' | 'pressed' | 'generating' | 'success' | 'error';

export interface PackOpenProgress {
  phase: PackOpenPhase;
  message: string;
  cards: OwnedCard[];
  error: string | null;
}

type OpenTestPackResponse = {
  ok: boolean;
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

  /**
   * Opens a prototype pack: server mints 5 random owned cards into the user's
   * cardCollection subcollection and returns their data.
   */
  async openTestPack(): Promise<void> {
    if (this.opening()) {
      return;
    }
    if (!this.auth.currentUser) {
      this.progress.set({
        phase: 'error',
        message: 'Sign in to open a pack.',
        cards: [],
        error: 'Sign in to open a pack.',
      });
      return;
    }

    this.opening.set(true);
    this.progress.set({
      phase: 'pressed',
      message: 'Pack requested…',
      cards: [],
      error: null,
    });

    try {
      this.progress.update((p) => ({
        ...p,
        phase: 'generating',
        message: 'Waiting for cards to generate…',
      }));

      const callable = httpsCallable<Record<string, never>, OpenTestPackResponse>(
        this.functions,
        'openTestPack',
      );
      const result = await callable({});
      const cards = result.data?.cards ?? [];

      this.progress.set({
        phase: 'success',
        message: `Pack opened — ${cards.length} cards added to your collection.`,
        cards,
        error: null,
      });
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
