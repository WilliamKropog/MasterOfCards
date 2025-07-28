import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BoulderTossComponent } from './boulder-toss.component';

describe('BoulderTossComponent', () => {
  let component: BoulderTossComponent;
  let fixture: ComponentFixture<BoulderTossComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BoulderTossComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(BoulderTossComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
