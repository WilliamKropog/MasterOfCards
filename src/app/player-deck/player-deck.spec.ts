import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PlayerDeck } from './player-deck';

describe('PlayerDeck', () => {
  let component: PlayerDeck;
  let fixture: ComponentFixture<PlayerDeck>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlayerDeck],
    }).compileComponents();

    fixture = TestBed.createComponent(PlayerDeck);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('playerSlot', 'player1');
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
