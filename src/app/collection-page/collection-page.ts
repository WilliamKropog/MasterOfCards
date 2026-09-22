import { Component, inject } from '@angular/core';
import { NavBar } from '../nav-bar/nav-bar';
import { SideNav } from '../side-nav/side-nav';
import {
  PackInventoryService,
  type PackStackView,
} from '../services/pack-inventory.service';
import { PackService } from '../services/pack.service';

@Component({
  selector: 'app-collection-page',
  imports: [NavBar, SideNav],
  templateUrl: './collection-page.html',
  styleUrl: './collection-page.css',
})
export class CollectionPage {
  private readonly inventory = inject(PackInventoryService);
  private readonly pack = inject(PackService);

  protected readonly loading = this.inventory.loading;
  protected readonly error = this.inventory.error;
  protected readonly packStacks = this.inventory.packStacks;
  protected readonly opening = this.pack.opening;
  protected readonly openProgress = this.pack.progress;

  protected onOpenPack(stack: PackStackView): void {
    if (this.opening() || stack.count <= 0) {
      return;
    }
    void this.pack.openOwnedPack(stack.ownedPackId);
  }
}
