import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-circular-timer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './circular-timer.component.html',
  styleUrls: ['./circular-timer.component.scss']
})
export class CircularTimerComponent implements OnChanges {
  @Input() remainingSeconds: number = 0;
  @Input() totalSeconds: number = 1500; // 25 minutes
  @Input() isRunning: boolean = false;

  displayTime: string = '25:00';
  strokeDashoffset: number = 0;
  
  private readonly CIRCUMFERENCE = 2 * Math.PI * 120; // radius = 120

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['remainingSeconds']) {
      this.updateDisplay();
    }
  }

  private updateDisplay(): void {
    // Format time
    const mins = Math.floor(this.remainingSeconds / 60);
    const secs = this.remainingSeconds % 60;
    this.displayTime = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

    // Calculate progress (0 = full, CIRCUMFERENCE = empty)
    const progress = 1 - (this.remainingSeconds / this.totalSeconds);
    this.strokeDashoffset = this.CIRCUMFERENCE * (1 - progress);
  }

  get circumference(): number {
    return this.CIRCUMFERENCE;
  }
}
