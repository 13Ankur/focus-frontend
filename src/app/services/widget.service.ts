import { Injectable } from '@angular/core';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { StatsService } from './stats.service';
import { BreedService } from './breed.service';

export interface StayPawsWidgetPlugin {
  updateWidgetData(options: {
    currentStreak: number;
    todayFocusMinutes: number;
    dailyGoal: number;
    totalKibble: number;
    activeBreed: string;
  }): Promise<void>;

  setSessionActive(options: {
    active: boolean;
    sessionEndTime?: number;
  }): Promise<void>;

  reloadWidgets(): Promise<void>;
}

const StayPawsWidget = registerPlugin<StayPawsWidgetPlugin>('StayPawsWidget');

@Injectable({
  providedIn: 'root',
})
export class WidgetService {
  private isNative = Capacitor.isNativePlatform();

  constructor(
    private statsService: StatsService,
    private breedService: BreedService,
  ) {}

  async updateWidgetData(): Promise<void> {
    if (!this.isNative) return;

    try {
      const stats = this.statsService.stats;
      const today = this.statsService.getTodayStats();
      const dailyGoal = parseInt(localStorage.getItem('paws_daily_goal') || '60', 10);
      const activeBreed = this.breedService.activeBreed;

      await StayPawsWidget.updateWidgetData({
        currentStreak: stats?.currentStreak || 0,
        todayFocusMinutes: today?.focusMinutes || 0,
        dailyGoal,
        totalKibble: stats?.totalKibble || 0,
        activeBreed: activeBreed?.name || 'Golden Retriever',
      });
    } catch (e) {
      console.warn('Widget data update failed:', e);
    }
  }

  async setSessionActive(active: boolean, sessionEndTimeMs?: number): Promise<void> {
    if (!this.isNative) return;

    try {
      await StayPawsWidget.setSessionActive({
        active,
        sessionEndTime: sessionEndTimeMs ? sessionEndTimeMs / 1000 : 0,
      });
    } catch (e) {
      console.warn('Widget session state update failed:', e);
    }
  }

  async reloadWidgets(): Promise<void> {
    if (!this.isNative) return;

    try {
      await StayPawsWidget.reloadWidgets();
    } catch (e) {
      console.warn('Widget reload failed:', e);
    }
  }
}
