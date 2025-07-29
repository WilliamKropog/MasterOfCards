import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home.component';
import { AuthenticationComponent } from './pages/authentication/authentication.component';

export const routes: Routes = [
    { path: '', component: HomeComponent },
    { path: 'login', component: AuthenticationComponent },
    { path: '**', redirectTo: ''}
];
