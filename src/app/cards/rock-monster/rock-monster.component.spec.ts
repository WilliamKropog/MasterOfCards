import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RockMonsterComponent } from './rock-monster.component';

describe('RockMonsterComponent', () => {
  let component: RockMonsterComponent;
  let fixture: ComponentFixture<RockMonsterComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RockMonsterComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(RockMonsterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
