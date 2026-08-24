import { AsyncPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { AuthService } from '../services/auth.service';
import {
  establishedEmailValidator,
  passwordsMatchValidator,
  strongPasswordValidator,
  usernameFormatValidator,
  usernameUniqueValidator,
} from '../auth/auth.validators';

@Component({
  selector: 'app-side-nav',
  imports: [AsyncPipe, ReactiveFormsModule, MatButton],
  templateUrl: './side-nav.html',
  styleUrl: './side-nav.css',
})
export class SideNav {
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);

  readonly user$ = this.auth.user$;

  submitting = false;
  loggingOut = false;
  formError = '';
  logoutError = '';

  readonly registerForm = this.fb.nonNullable.group(
    {
      username: [
        '',
        {
          validators: [usernameFormatValidator()],
          asyncValidators: [usernameUniqueValidator(this.auth)],
        },
      ],
      email: ['', establishedEmailValidator()],
      password: ['', strongPasswordValidator()],
      confirmPassword: ['', Validators.required],
    },
    { validators: [passwordsMatchValidator()] },
  );

  usernameError(): string {
    const control = this.registerForm.controls.username;
    if (!(control.touched || control.dirty) || !control.errors) {
      return '';
    }
    if (control.errors['required']) {
      return 'Username is required.';
    }
    if (control.errors['usernameTooShort']) {
      return 'Username must be at least 4 characters.';
    }
    if (control.errors['usernameFormat']) {
      return 'Use 4–20 letters, numbers, or underscores.';
    }
    if (control.errors['usernameTaken']) {
      return 'That username is already taken.';
    }
    return '';
  }

  emailError(): string {
    const control = this.registerForm.controls.email;
    if (!(control.touched || control.dirty) || !control.errors) {
      return '';
    }
    if (control.errors['required']) {
      return 'Email is required.';
    }
    if (control.errors['emailFormat']) {
      return 'Enter a valid email address.';
    }
    if (control.errors['emailDomain']) {
      return 'Use a major provider (Gmail, Outlook, Yahoo, iCloud, etc.).';
    }
    return '';
  }

  passwordError(): string {
    const control = this.registerForm.controls.password;
    if (!(control.touched || control.dirty) || !control.errors) {
      return '';
    }
    if (control.errors['required']) {
      return 'Password is required.';
    }
    if (control.errors['passwordTooShort']) {
      return 'Password must be at least 8 characters.';
    }
    if (control.errors['passwordWeak']) {
      return 'Include at least one capital letter and one special character.';
    }
    return '';
  }

  confirmPasswordError(): string {
    const control = this.registerForm.controls.confirmPassword;
    if (!(control.touched || control.dirty) || !control.errors) {
      return '';
    }
    if (control.errors['required']) {
      return 'Confirm your password.';
    }
    if (control.errors['passwordMismatch']) {
      return 'Passwords do not match.';
    }
    return '';
  }

  canSubmit(): boolean {
    return this.registerForm.valid && !this.submitting && !this.registerForm.pending;
  }

  async onRegister(): Promise<void> {
    this.formError = '';
    this.registerForm.markAllAsTouched();
    this.registerForm.updateValueAndValidity();

    if (!this.canSubmit()) {
      return;
    }

    this.submitting = true;
    const { username, email, password } = this.registerForm.getRawValue();

    try {
      await this.auth.register({ username, email, password });
      this.registerForm.reset();
    } catch (error) {
      this.formError = this.auth.getFirebaseErrorMessage(error);
    } finally {
      this.submitting = false;
    }
  }

  async onLogout(): Promise<void> {
    this.logoutError = '';
    this.loggingOut = true;
    try {
      await this.auth.logout();
      this.registerForm.reset();
    } catch {
      this.logoutError = 'Could not sign out. Please try again.';
    } finally {
      this.loggingOut = false;
    }
  }
}
