import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FieldRow } from './field-row';

describe('FieldRow', () => {
  let fixture: ComponentFixture<FieldRow>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FieldRow],
    }).compileComponents();

    fixture = TestBed.createComponent(FieldRow);
    fixture.componentRef.setInput('playerSlot', 'player1');
    fixture.componentRef.setInput('zone', 'land');
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });
});
