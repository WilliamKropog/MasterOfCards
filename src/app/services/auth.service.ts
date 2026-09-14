import { Injectable, inject } from '@angular/core';
import {
  Auth,
  User,
  authState,
  createUserWithEmailAndPassword,
  deleteUser,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from '@angular/fire/auth';
import {
  Firestore,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
} from '@angular/fire/firestore';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { MatchmakingService } from './matchmaking.service';

export interface RegisterPayload {
  username: string;
  email: string;
  password: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly auth = inject(Auth);
  private readonly firestore = inject(Firestore);
  private readonly matchmaking = inject(MatchmakingService);
  private readonly router = inject(Router);

  readonly user$: Observable<User | null> = authState(this.auth);

  async logout(): Promise<void> {
    // Leave the queue while still authenticated so Firestore delete rules allow it.
    await this.matchmaking.cancelLiveSearch();
    await signOut(this.auth);
    await this.router.navigateByUrl('/');
  }

  normalizeUsername(username: string): string {
    return username.trim().toLowerCase();
  }

  async isUsernameTaken(username: string): Promise<boolean> {
    const key = this.normalizeUsername(username);
    if (!key) {
      return false;
    }
    const snap = await getDoc(doc(this.firestore, 'usernames', key));
    return snap.exists();
  }

  /**
   * Resolves a username or email to the account email, then signs in.
   * Throws Error('INVALID_CREDENTIALS') for any failed login attempt.
   */
  async login(identifier: string, password: string): Promise<User> {
    const trimmedId = identifier.trim();
    const trimmedPassword = password;

    if (!trimmedId || !trimmedPassword) {
      throw new Error('INVALID_CREDENTIALS');
    }

    let email = trimmedId.toLowerCase();

    if (!trimmedId.includes('@')) {
      email = await this.resolveEmailFromUsername(trimmedId);
    }

    try {
      const credential = await signInWithEmailAndPassword(
        this.auth,
        email,
        trimmedPassword,
      );
      return credential.user;
    } catch {
      throw new Error('INVALID_CREDENTIALS');
    }
  }

  /** Username index stores only uid; profile email lives on users/{uid}. */
  private async resolveEmailFromUsername(username: string): Promise<string> {
    const usernameSnap = await getDoc(
      doc(this.firestore, 'usernames', this.normalizeUsername(username)),
    );
    if (!usernameSnap.exists()) {
      throw new Error('INVALID_CREDENTIALS');
    }

    const data = usernameSnap.data();
    // Legacy docs may still have email; new docs are uid-only.
    const legacyEmail = data?.['email'];
    if (typeof legacyEmail === 'string' && legacyEmail) {
      return legacyEmail;
    }

    const uid = data?.['uid'];
    if (typeof uid !== 'string' || !uid) {
      throw new Error('INVALID_CREDENTIALS');
    }

    const userSnap = await getDoc(doc(this.firestore, 'users', uid));
    const profileEmail = userSnap.data()?.['email'];
    if (!userSnap.exists() || typeof profileEmail !== 'string' || !profileEmail) {
      throw new Error('INVALID_CREDENTIALS');
    }

    return profileEmail;
  }

  async register({ username, email, password }: RegisterPayload): Promise<User> {
    const trimmedUsername = username.trim();
    const usernameKey = this.normalizeUsername(trimmedUsername);
    const trimmedEmail = email.trim().toLowerCase();

    if (await this.isUsernameTaken(trimmedUsername)) {
      throw new Error('USERNAME_TAKEN');
    }

    const credential = await createUserWithEmailAndPassword(
      this.auth,
      trimmedEmail,
      password,
    );
    const user = credential.user;

    try {
      await updateProfile(user, { displayName: trimmedUsername });

      await runTransaction(this.firestore, async (transaction) => {
        const usernameRef = doc(this.firestore, 'usernames', usernameKey);
        const usernameSnap = await transaction.get(usernameRef);
        if (usernameSnap.exists()) {
          throw new Error('USERNAME_TAKEN');
        }

        // Thin uniqueness index: doc id = lowercase username, value = uid only.
        transaction.set(usernameRef, {
          uid: user.uid,
        });

        transaction.set(doc(this.firestore, 'users', user.uid), {
          uid: user.uid,
          username: trimmedUsername,
          usernameLower: usernameKey,
          email: trimmedEmail,
          createdAt: serverTimestamp(),
        });
      });
    } catch (error) {
      try {
        await deleteUser(user);
      } catch {
        // Best-effort rollback if profile/username write fails.
      }
      throw error;
    }

    return user;
  }

  getFirebaseErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message === 'USERNAME_TAKEN') {
      return 'That username is already taken.';
    }
    if (error instanceof Error && error.message === 'INVALID_CREDENTIALS') {
      return 'Invalid username or password';
    }

    const code =
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof (error as { code: unknown }).code === 'string'
        ? (error as { code: string }).code
        : '';

    switch (code) {
      case 'auth/email-already-in-use':
        return 'An account with this email already exists.';
      case 'auth/invalid-email':
        return 'Please enter a valid email address.';
      case 'auth/weak-password':
        return 'Password is too weak.';
      case 'auth/operation-not-allowed':
        return 'Email/password sign-up is not enabled for this project.';
      case 'auth/network-request-failed':
        return 'Network error. Check your connection and try again.';
      case 'permission-denied':
        return 'Could not save your profile. Check Firestore rules and try again.';
      default:
        return 'Registration failed. Please try again.';
    }
  }
}
