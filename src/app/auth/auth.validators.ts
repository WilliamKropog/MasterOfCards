import { AbstractControl, AsyncValidatorFn, ValidationErrors, ValidatorFn } from '@angular/forms';
import { Observable, from, map, of, switchMap, timer } from 'rxjs';
import { AuthService } from '../services/auth.service';

/** Common consumer email providers we accept at registration. */
export const ALLOWED_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'yahoo.com',
  'yahoo.co.uk',
  'ymail.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'zoho.com',
  'mail.com',
]);

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{4,20}$/;
const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_PATTERN = /^(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{8,}$/;

export function usernameFormatValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = String(control.value ?? '').trim();
    if (!value) {
      return { required: true };
    }
    if (value.length < 4) {
      return { usernameTooShort: true };
    }
    if (!USERNAME_PATTERN.test(value)) {
      return { usernameFormat: true };
    }
    return null;
  };
}

export function usernameUniqueValidator(auth: AuthService): AsyncValidatorFn {
  return (control: AbstractControl): Observable<ValidationErrors | null> => {
    const value = String(control.value ?? '').trim();
    if (!value || value.length < 4 || !USERNAME_PATTERN.test(value)) {
      return of(null);
    }

    return timer(350).pipe(
      switchMap(() => from(auth.isUsernameTaken(value))),
      map((taken) => (taken ? { usernameTaken: true } : null)),
    );
  };
}

export function establishedEmailValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = String(control.value ?? '').trim().toLowerCase();
    if (!value) {
      return { required: true };
    }
    if (!EMAIL_FORMAT.test(value)) {
      return { emailFormat: true };
    }
    const domain = value.split('@')[1] ?? '';
    if (!ALLOWED_EMAIL_DOMAINS.has(domain)) {
      return { emailDomain: true };
    }
    return null;
  };
}

export function strongPasswordValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = String(control.value ?? '');
    if (!value) {
      return { required: true };
    }
    if (value.length < 8) {
      return { passwordTooShort: true };
    }
    if (!PASSWORD_PATTERN.test(value)) {
      return { passwordWeak: true };
    }
    return null;
  };
}

export function passwordsMatchValidator(): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const password = group.get('password');
    const confirm = group.get('confirmPassword');
    if (!password || !confirm) {
      return null;
    }

    const confirmValue = String(confirm.value ?? '');
    if (!confirmValue) {
      return null;
    }

    if (password.value !== confirmValue) {
      confirm.setErrors({ ...(confirm.errors ?? {}), passwordMismatch: true });
      return { passwordMismatch: true };
    }

    if (confirm.hasError('passwordMismatch')) {
      const rest = { ...(confirm.errors ?? {}) };
      delete rest['passwordMismatch'];
      confirm.setErrors(Object.keys(rest).length ? rest : null);
    }

    return null;
  };
}
