import { Routes } from '@angular/router';
import { authGuard } from './auth/auth.guard';
import { CollectionPage } from './collection-page/collection-page';
import { DeckBuilderPage } from './deck-builder-page/deck-builder-page';
import { GamePage } from './game-page/game-page';
import { HomePage } from './home-page/home-page';
import { RegisterPage } from './register-page/register-page';
import { StorePage } from './store-page/store-page';

export const routes: Routes = [
  { path: '', pathMatch: 'full', component: HomePage },
  { path: 'register', component: RegisterPage },
  { path: 'game', component: GamePage },
  { path: 'store', component: StorePage },
  {
    path: 'collection',
    component: CollectionPage,
    canActivate: [authGuard],
  },
  {
    path: 'deck-builder',
    component: DeckBuilderPage,
    canActivate: [authGuard],
  },
  { path: '**', redirectTo: '' },
];
