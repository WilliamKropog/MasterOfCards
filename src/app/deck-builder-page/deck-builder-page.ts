import { Component } from '@angular/core';
import { NavBar } from '../nav-bar/nav-bar';
import { SideNav } from '../side-nav/side-nav';

@Component({
  selector: 'app-deck-builder-page',
  imports: [NavBar, SideNav],
  template: `
    <div class="page-shell">
      <app-nav-bar />
      <div class="page-body">
        <main class="page-main">
          <h1>Deck Builder</h1>
          <p>Deck Builder page coming soon.</p>
        </main>
        <app-side-nav class="page-side-nav" />
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100vh;
      }
      .page-shell {
        display: flex;
        flex-direction: column;
        min-height: 100vh;
        background: #1a1d22;
        color: rgba(245, 240, 232, 0.95);
      }
      .page-body {
        flex: 1;
        display: grid;
        grid-template-columns: minmax(0, 1fr) 16rem;
        min-height: 0;
      }
      .page-main {
        padding: 2rem;
      }
      .page-side-nav {
        min-height: 0;
      }
    `,
  ],
})
export class DeckBuilderPage {}
