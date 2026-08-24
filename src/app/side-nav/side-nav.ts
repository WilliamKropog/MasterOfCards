import { AsyncPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-side-nav',
  imports: [AsyncPipe, ReactiveFormsModule, MatButton, RouterLink],
  templateUrl: './side-nav.html',
  styleUrl: './side-nav.css',
})
export class SideNav {
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);

  readonly user$ = this.auth.user$;

  loggingIn = false;
  loggingOut = false;
  loginError = '';
  logoutError = '';

  readonly loginForm = this.fb.nonNullable.group({
    identifier: ['', Validators.required],
    password: ['', Validators.required],
  });

  async onLogin(): Promise<void> {
    this.loginError = '';
    this.loginForm.markAllAsTouched();

    if (this.loginForm.invalid || this.loggingIn) {
      return;
    }

    this.loggingIn = true;
    const { identifier, password } = this.loginForm.getRawValue();

    try {
      await this.auth.login(identifier, password);
      this.loginForm.reset();
    } catch (error) {
      this.loginError = this.auth.getFirebaseErrorMessage(error);
    } finally {
      this.loggingIn = false;
    }
  }

  async onLogout(): Promise<void> {
    this.logoutError = '';
    this.loggingOut = true;
    try {
      await this.auth.logout();
      this.loginForm.reset();
    } catch {
      this.logoutError = 'Could not sign out. Please try again.';
    } finally {
      this.loggingOut = false;
    }
  }
}
