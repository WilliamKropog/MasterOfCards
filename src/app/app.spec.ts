import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render two player hands', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('section[aria-label="Game table"]')).toBeTruthy();
    expect(compiled.querySelectorAll('app-player-hand').length).toBe(2);
    expect(compiled.querySelector('app-play-field')).toBeTruthy();
    expect(compiled.querySelectorAll('app-card').length).toBe(6);
  });
});
