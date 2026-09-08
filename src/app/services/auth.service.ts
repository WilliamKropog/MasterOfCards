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
import { Observable } from 'rxjs';

export interface RegisterPayload {
  username: string;
  email: string;
  password: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly auth = inject(Auth);
  private readonly firestore = inject(Firestore);

  readonly user$: Observable<User | null> = authState(this.auth);

  async logout(): Promise<void> {
    await signOut(this.auth);
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
      const usernameSnap = await getDoc(
        doc(this.firestore, 'usernames', this.normalizeUsername(trimmedId)),
      );
      const storedEmail = usernameSnap.data()?.['email'];
      if (!usernameSnap.exists() || typeof storedEmail !== 'string' || !storedEmail) {
        throw new Error('INVALID_CREDENTIALS');
      }
      email = storedEmail;
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

        transaction.set(usernameRef, {
          uid: user.uid,
          username: trimmedUsername,
          usernameLower: usernameKey,
          email: trimmedEmail,
          createdAt: serverTimestamp(),
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
