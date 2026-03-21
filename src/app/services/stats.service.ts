import { Injectable } from '@angular/core';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';

export interface DailyStats {
  date: string;
  focusMinutes: number;
  sessionsCompleted: number;
  kibbleEarned: number;
}

export interface UserStats {
  totalMealsProvided: number;
  totalKibble: number;
  totalFocusMinutes: number;
  completedSessions: number;
  currentStreak: number;
  longestStreak: number;
  lastSessionDate: string | null;
  dailyHistory: DailyStats[];
}

const DEFAULT_STATS: UserStats = {
  totalMealsProvided: 0,
  totalKibble: 0,
  totalFocusMinutes: 0,
  completedSessions: 0,
  currentStreak: 0,
  longestStreak: 0,
  lastSessionDate: null,
  dailyHistory: []
};

const LOCAL_STORAGE_KEY = 'paws_focus_stats';
const KIBBLE_PER_MEAL = 25;
const GLOBAL_COMMUNITY_MEALS = 247583;

@Injectable({
  providedIn: 'root'
})
export class StatsService {
  private statsSubject = new BehaviorSubject<UserStats>(DEFAULT_STATS);
  public stats$ = this.statsSubject.asObservable();
  
  private isLoadingSubject = new BehaviorSubject<boolean>(false);
  public isLoading$ = this.isLoadingSubject.asObservable();

  constructor(private apiService: ApiService) {
    this.loadStats();
  }

  // ============ GETTERS ============

  get stats(): UserStats {
    return this.statsSubject.value;
  }

  get totalMeals(): number {
    return this.stats.totalMealsProvided;
  }

  get totalKibble(): number {
    return this.stats.totalKibble;
  }

  get completedSessions(): number {
    return this.stats.completedSessions;
  }

  get totalFocusMinutes(): number {
    return this.stats.totalFocusMinutes;
  }

  get currentStreak(): number {
    return this.stats.currentStreak;
  }

  get longestStreak(): number {
    return this.stats.longestStreak;
  }

  get globalMeals(): number {
    return GLOBAL_COMMUNITY_MEALS + this.stats.totalMealsProvided;
  }

  // ============ LOAD STATS ============

  async loadStats(): Promise<void> {
    // First load from local cache
    this.loadFromLocalStorage();
    
    // Then try to sync with server if authenticated
    if (this.apiService.isAuthenticated()) {
      await this.syncWithServer();
    }
  }

  private loadFromLocalStorage(): void {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        const stats: UserStats = {
          ...DEFAULT_STATS,
          ...parsed,
          dailyHistory: parsed.dailyHistory || []
        };
        this.statsSubject.next(stats);
      }
    } catch (error) {
      console.error('Error loading stats from localStorage:', error);
    }
  }

  async syncWithServer(): Promise<void> {
    if (!this.apiService.isAuthenticated() || !this.apiService.isOnline) {
      return;
    }

    this.isLoadingSubject.next(true);
    
    try {
      const response = await firstValueFrom(this.apiService.getStats());
      
      if (response) {
        // Map server response to our stats format
        const stats: UserStats = {
          totalMealsProvided: response.allTime?.totalMealsProvided || 0,
          totalKibble: response.allTime?.totalKibble || 0,
          totalFocusMinutes: response.allTime?.totalFocusMinutes || 0,
          completedSessions: response.allTime?.completedSessions || 0,
          currentStreak: response.allTime?.currentStreak || 0,
          longestStreak: response.allTime?.longestStreak || 0,
          lastSessionDate: response.allTime?.lastSessionDate || null,
          dailyHistory: response.chartData?.map((d: any) => ({
            date: d.date,
            focusMinutes: d.minutes,
            sessionsCompleted: d.sessions || 0,
            kibbleEarned: 0
          })) || []
        };
        
        this.statsSubject.next(stats);
        this.saveToLocalStorage();
      }
    } catch (error) {
      console.error('Error syncing stats with server:', error);
      // Continue using cached data
    } finally {
      this.isLoadingSubject.next(false);
    }
  }

  // ============ TIME PERIOD STATS ============

  getTodayStats(): DailyStats {
    const today = this.getDateString(new Date());
    const todayData = this.stats.dailyHistory.find(d => d.date === today);
    
    return todayData || {
      date: today,
      focusMinutes: 0,
      sessionsCompleted: 0,
      kibbleEarned: 0
    };
  }

  getWeeklyStats(): { 
    totalMinutes: number; 
    totalSessions: number; 
    totalKibble: number;
    dailyData: DailyStats[];
    averageMinutesPerDay: number;
  } {
    const weekData = this.getStatsForDays(7);
    const totalMinutes = weekData.reduce((sum, d) => sum + d.focusMinutes, 0);
    const totalSessions = weekData.reduce((sum, d) => sum + d.sessionsCompleted, 0);
    const totalKibble = weekData.reduce((sum, d) => sum + d.kibbleEarned, 0);
    const daysWithData = weekData.filter(d => d.focusMinutes > 0).length;
    
    return {
      totalMinutes,
      totalSessions,
      totalKibble,
      dailyData: weekData,
      averageMinutesPerDay: daysWithData > 0 ? Math.round(totalMinutes / daysWithData) : 0
    };
  }

  getMonthlyStats(): {
    totalMinutes: number;
    totalSessions: number;
    totalKibble: number;
    totalMeals: number;
    averageMinutesPerDay: number;
    activeDays: number;
  } {
    const monthData = this.getStatsForDays(30);
    const totalMinutes = monthData.reduce((sum, d) => sum + d.focusMinutes, 0);
    const totalSessions = monthData.reduce((sum, d) => sum + d.sessionsCompleted, 0);
    const totalKibble = monthData.reduce((sum, d) => sum + d.kibbleEarned, 0);
    const activeDays = monthData.filter(d => d.focusMinutes > 0).length;
    
    return {
      totalMinutes,
      totalSessions,
      totalKibble,
      totalMeals: Math.floor(totalKibble / KIBBLE_PER_MEAL),
      averageMinutesPerDay: activeDays > 0 ? Math.round(totalMinutes / activeDays) : 0,
      activeDays
    };
  }

  getDailyChartData(days: number = 7): { label: string; minutes: number; isToday: boolean }[] {
    const result: { label: string; minutes: number; isToday: boolean }[] = [];
    const today = new Date();
    const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateString = this.getDateString(date);
      const dayData = this.stats.dailyHistory.find(d => d.date === dateString);
      
      result.push({
        label: dayLabels[date.getDay()],
        minutes: dayData?.focusMinutes || 0,
        isToday: i === 0
      });
    }
    
    return result;
  }

  formatFocusTime(minutes: number): string {
    if (minutes === 0) return '0 min';
    
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    
    if (hours === 0) {
      return `${mins} min`;
    } else if (mins === 0) {
      return `${hours}h`;
    } else {
      return `${hours}h ${mins}m`;
    }
  }

  get formattedTotalFocusTime(): string {
    return this.formatFocusTime(this.stats.totalFocusMinutes);
  }

  // ============ SESSION RECORDING ============

  async recordCompletedSession(kibbleEarned: number, focusMinutes: number): Promise<any> {
    const today = this.getDateString(new Date());
    
    // Optimistic update to local state
    const currentStats = this.stats;
    const newTotalKibble = currentStats.totalKibble + kibbleEarned;
    const newTotalMeals = Math.floor(newTotalKibble / KIBBLE_PER_MEAL);
    
    // Calculate streak
    let newStreak = currentStats.currentStreak;
    if (currentStats.lastSessionDate) {
      const lastDate = new Date(currentStats.lastSessionDate);
      const todayDate = new Date(today);
      const diffDays = Math.floor((todayDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
      
      if (diffDays === 0) {
        // Same day
      } else if (diffDays === 1) {
        newStreak++;
      } else {
        newStreak = 1;
      }
    } else {
      newStreak = 1;
    }

    // Update daily history
    const updatedHistory = this.updateDailyHistory(
      currentStats.dailyHistory,
      today,
      focusMinutes,
      kibbleEarned
    );

    const updatedStats: UserStats = {
      totalMealsProvided: newTotalMeals,
      totalKibble: newTotalKibble,
      totalFocusMinutes: currentStats.totalFocusMinutes + focusMinutes,
      completedSessions: currentStats.completedSessions + 1,
      currentStreak: newStreak,
      longestStreak: Math.max(currentStats.longestStreak, newStreak),
      lastSessionDate: today,
      dailyHistory: updatedHistory
    };

    this.statsSubject.next(updatedStats);
    this.saveToLocalStorage();

    // Sync with server if authenticated
    if (this.apiService.isAuthenticated()) {
      try {
        const response = await firstValueFrom(
          this.apiService.recordSession(focusMinutes, kibbleEarned, 'completed')
        );
        
        // Update with server response if available
        if (response?.updatedStats) {
          const serverStats: UserStats = {
            ...updatedStats,
            totalKibble: response.updatedStats.totalKibble,
            totalFocusMinutes: response.updatedStats.totalFocusMinutes,
            completedSessions: response.updatedStats.completedSessions,
            totalMealsProvided: response.updatedStats.totalMealsProvided,
            currentStreak: response.updatedStats.currentStreak,
            longestStreak: response.updatedStats.longestStreak
          };
          this.statsSubject.next(serverStats);
          this.saveToLocalStorage();
        }
        
        return response;
      } catch (error) {
        console.error('Error syncing session with server:', error);
        // Keep local state, will sync later
      }
    }
    
    return { success: true, updatedStats };
  }

  addKibble(amount: number): void {
    if (amount <= 0) return;
    
    const currentStats = this.stats;
    const newTotalKibble = currentStats.totalKibble + amount;
    const newTotalMeals = Math.floor(newTotalKibble / KIBBLE_PER_MEAL);

    const updatedStats: UserStats = {
      ...currentStats,
      totalKibble: newTotalKibble,
      totalMealsProvided: newTotalMeals
    };

    this.statsSubject.next(updatedStats);
    this.saveToLocalStorage();
  }

  // ============ MEAL PROGRESS ============

  getMealProgress(): number {
    const kibbleForCurrentMeal = this.stats.totalKibble % KIBBLE_PER_MEAL;
    return kibbleForCurrentMeal / KIBBLE_PER_MEAL;
  }

  getKibbleToNextMeal(): number {
    return KIBBLE_PER_MEAL - (this.stats.totalKibble % KIBBLE_PER_MEAL);
  }

  // ============ HELPER METHODS ============

  private getDateString(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  private getStatsForDays(days: number): DailyStats[] {
    const result: DailyStats[] = [];
    const today = new Date();
    
    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateString = this.getDateString(date);
      
      const existingData = this.stats.dailyHistory.find(d => d.date === dateString);
      result.push(existingData || {
        date: dateString,
        focusMinutes: 0,
        sessionsCompleted: 0,
        kibbleEarned: 0
      });
    }
    
    return result;
  }

  private updateDailyHistory(
    history: DailyStats[],
    date: string,
    focusMinutes: number,
    kibbleEarned: number
  ): DailyStats[] {
    const existingIndex = history.findIndex(d => d.date === date);
    let updated: DailyStats[];
    
    if (existingIndex >= 0) {
      updated = [...history];
      updated[existingIndex] = {
        ...updated[existingIndex],
        focusMinutes: updated[existingIndex].focusMinutes + focusMinutes,
        sessionsCompleted: updated[existingIndex].sessionsCompleted + 1,
        kibbleEarned: updated[existingIndex].kibbleEarned + kibbleEarned
      };
    } else {
      updated = [
        ...history,
        {
          date,
          focusMinutes,
          sessionsCompleted: 1,
          kibbleEarned
        }
      ];
    }
    
    // Keep only last 90 days
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90);
    const cutoffString = this.getDateString(cutoffDate);
    
    return updated
      .filter(d => d.date >= cutoffString)
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  // ============ PERSISTENCE ============

  private saveToLocalStorage(): void {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(this.stats));
    } catch (error) {
      console.error('Error saving stats to localStorage:', error);
    }
  }

  // ============ RESET & DEBUG ============

  resetStats(): void {
    this.statsSubject.next(DEFAULT_STATS);
    localStorage.removeItem(LOCAL_STORAGE_KEY);
  }

  createTestUserData(): void {
    const today = new Date();
    const testHistory: DailyStats[] = [];
    
    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      
      const isActiveDay = Math.random() > 0.3;
      const sessions = isActiveDay ? Math.floor(Math.random() * 4) + 1 : 0;
      const minutesPerSession = [15, 25, 60][Math.floor(Math.random() * 3)];
      const focusMinutes = sessions * minutesPerSession;
      const kibbleEarned = sessions * 25;
      
      if (focusMinutes > 0) {
        testHistory.push({
          date: this.getDateString(date),
          focusMinutes,
          sessionsCompleted: sessions,
          kibbleEarned
        });
      }
    }
    
    const totalMinutes = testHistory.reduce((sum, d) => sum + d.focusMinutes, 0);
    const totalSessions = testHistory.reduce((sum, d) => sum + d.sessionsCompleted, 0);
    const totalKibble = testHistory.reduce((sum, d) => sum + d.kibbleEarned, 0);
    
    const testStats: UserStats = {
      totalMealsProvided: Math.floor(totalKibble / KIBBLE_PER_MEAL),
      totalKibble: totalKibble + 3500,
      totalFocusMinutes: totalMinutes,
      completedSessions: totalSessions,
      currentStreak: 7,
      longestStreak: 14,
      lastSessionDate: this.getDateString(today),
      dailyHistory: testHistory
    };
    
    this.statsSubject.next(testStats);
    this.saveToLocalStorage();
  }
}
