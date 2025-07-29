import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';

@Component({
    selector: 'app-navbar',
    imports: [
        CommonModule,
        MatButtonModule,
        MatIconModule,
        RouterLink
    ],
    templateUrl: './navbar.component.html',
    styleUrl: './navbar.component.css'
})
export class NavbarComponent {
  constructor(private router: Router) {}

  goLogin() {
    this.router.navigate(['/login']);
    console.log('Login button clicked.');
  }
}
