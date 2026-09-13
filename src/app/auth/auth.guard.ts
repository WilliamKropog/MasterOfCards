import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map, take } from 'rxjs';
import { AuthService } from '../services/auth.service';

/**
 * Allows navigation only when a user is signed in.
 * Logged-out visitors are sent to the Register page.
 */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.user$.pipe(
    take(1),
    map((user) => (user ? true : router.createUrlTree(['/register']))),
  );
};
