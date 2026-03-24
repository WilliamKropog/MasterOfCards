import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PlayerHand } from './player-hand';

describe('PlayerHand', () => {
  let component: PlayerHand;
  let fixture: ComponentFixture<PlayerHand>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlayerHand]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PlayerHand);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('playerSlot', 'player1');
    fixture.componentRef.setInput('cardIds', ['rock-monster']);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
