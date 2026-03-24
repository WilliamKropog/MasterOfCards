import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PlayField } from './play-field';

describe('PlayField', () => {
  let component: PlayField;
  let fixture: ComponentFixture<PlayField>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlayField]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PlayField);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
