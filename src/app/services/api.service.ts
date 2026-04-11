import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, BehaviorSubject, from } from 'rxjs';
import { catchError, map, tap, switchMap } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { safeGetItem, safeSetItem, safeRemoveItem } from '../utils/storage';

export interface ApiResponse<T> {
  success?: boolean;
  message?: string;
  data?: T;
  [key: string]: any;
}

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private baseUrl = environment.apiUrl;
  private tokenKey = 'auth_token';

  private isOnlineSubject = new BehaviorSubject<boolean>(navigator.onLine);
  public isOnline$ = this.isOnlineSubject.asObservable();

  constructor(private http: HttpClient) {
    // Listen for online/offline events
    window.addEventListener('online', () => this.isOnlineSubject.next(true));
    window.addEventListener('offline', () => this.isOnlineSubject.next(false));
  }

  // ============ TOKEN MANAGEMENT ============

  getToken(): string | null {
    return safeGetItem(this.tokenKey);
  }

  setToken(token: string): void {
    safeSetItem(this.tokenKey, token);
  }

  clearToken(): void {
    safeRemoveItem(this.tokenKey);
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  // ============ HTTP HEADERS ============

  private getHeaders(): HttpHeaders {
    const token = this.getToken();
    let headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });

    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }

    return headers;
  }

  // ============ HTTP METHODS ============

  get<T>(endpoint: string): Observable<T> {
    return this.http.get<T>(`${this.baseUrl}${endpoint}`, {
      headers: this.getHeaders()
    }).pipe(
      catchError(this.handleError.bind(this))
    );
  }

  post<T>(endpoint: string, data: any): Observable<T> {
    return this.http.post<T>(`${this.baseUrl}${endpoint}`, data, {
      headers: this.getHeaders()
    }).pipe(
      catchError(this.handleError.bind(this))
    );
  }

  put<T>(endpoint: string, data: any): Observable<T> {
    return this.http.put<T>(`${this.baseUrl}${endpoint}`, data, {
      headers: this.getHeaders()
    }).pipe(
      catchError(this.handleError.bind(this))
    );
  }

  delete<T>(endpoint: string): Observable<T> {
    return this.http.delete<T>(`${this.baseUrl}${endpoint}`, {
      headers: this.getHeaders()
    }).pipe(
      catchError(this.handleError.bind(this))
    );
  }

  // ============ ERROR HANDLING ============

  private handleError(error: HttpErrorResponse): Observable<never> {
    let errorMessage = 'An error occurred';

    if (error.error instanceof ErrorEvent) {
      // Client-side error
      errorMessage = error.error.message;
    } else {
      // Server-side error
      if (error.status === 0) {
        errorMessage = 'Unable to connect to server. Check your internet or CORS settings.';
        // Trigger a background check instead of assuming offline
        this.checkConnection().subscribe();
      } else if (error.status === 401) {
        errorMessage = 'Session expired. Please log in again.';
        this.clearToken();
      } else if (error.status === 429) {
        errorMessage = error.error?.message || 'Too many requests. Please wait a moment.';
      } else if (error.status === 503) {
        errorMessage = 'Database unavailable. Please try again later.';
      } else if (error.error?.message) {
        errorMessage = error.error.message;
      }
    }

    console.error('API Error:', errorMessage, error);
    return throwError(() => new Error(errorMessage));
  }

  // ============ CONNECTIVITY ============

  get isOnline(): boolean {
    return this.isOnlineSubject.value;
  }

  checkConnection(): Observable<boolean> {
    return this.http.get<{ status: string }>(`${this.baseUrl}/health`).pipe(
      map(response => response.status === 'ok'),
      catchError(() => {
        this.isOnlineSubject.next(false);
        return [false];
      }),
      tap(online => this.isOnlineSubject.next(online))
    );
  }

  // ============ AUTH ENDPOINTS ============

  login(email: string, password: string): Observable<any> {
    return this.post<any>('/auth/login', { email, password }).pipe(
      tap(response => {
        if (response.token) {
          this.setToken(response.token);
        }
      })
    );
  }

  register(username: string, email: string, password: string): Observable<any> {
    return this.post<any>('/auth/register', { username, email, password }).pipe(
      tap(response => {
        if (response.token) {
          this.setToken(response.token);
        }
      })
    );
  }

  socialLogin(provider: string, tokenOrData: any): Observable<any> {
    return this.post<any>(`/auth/${provider}`, tokenOrData).pipe(
      tap(response => {
        if (response.token) {
          this.setToken(response.token);
        }
      })
    );
  }

  logout(): void {
    this.clearToken();
  }

  // ============ STATS ENDPOINTS ============

  getStats(): Observable<any> {
    return this.get<any>('/stats');
  }

  recordSession(focusMinutes: number, kibbleEarned: number, status: string = 'completed'): Observable<any> {
    return this.post<any>('/stats/session', { focusMinutes, kibbleEarned, status });
  }

  getDailyStats(days: number = 30): Observable<any> {
    return this.get<any>(`/stats/daily?days=${days}`);
  }

  getSessionHistory(limit: number = 20): Observable<any> {
    return this.get<any>(`/stats/history?limit=${limit}`);
  }

  // ============ BREED ENDPOINTS ============

  getBreeds(): Observable<any> {
    return this.get<any>('/breeds');
  }

  getBreedCollection(): Observable<any> {
    return this.get<any>('/breeds/collection');
  }

  setActiveBreed(breedId: string): Observable<any> {
    return this.post<any>('/breeds/active', { breedId });
  }

  unlockBreed(breedId: string): Observable<any> {
    return this.post<any>('/breeds/unlock', { breedId });
  }

  getActiveBreed(): Observable<any> {
    return this.get<any>('/breeds/active');
  }

  checkBreedUnlocks(): Observable<any> {
    return this.post<any>('/breeds/check-unlocks', {});
  }

  // ============ BUDDY ENDPOINTS ============

  getBuddyStats(): Observable<any> {
    return this.get<any>('/buddy');
  }

  interactWithBuddy(action: 'pet' | 'play' | 'treat'): Observable<any> {
    return this.post<any>('/buddy/interact', { action });
  }

  feedBuddy(amount: number = 10): Observable<any> {
    return this.post<any>('/buddy/feed', { amount });
  }

  // ============ FOCUS ENDPOINTS ============

  startFocusSession(duration: number): Observable<any> {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const headers = this.getHeaders().set('x-timezone', timezone);
    return this.http.post<any>(`${this.baseUrl}/focus/start`, { duration }, { headers }).pipe(
      catchError(this.handleError.bind(this))
    );
  }

  completeFocusSession(data: { duration: number, startTime: string, sessionToken: string }): Observable<any> {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const headers = this.getHeaders().set('x-timezone', timezone);
    return this.http.post<any>(`${this.baseUrl}/focus/complete`, data, { headers }).pipe(
      catchError(this.handleError.bind(this))
    );
  }

  failFocusSession(data: { duration: number, startTime: string, minutesCompleted: number, sessionToken: string }): Observable<any> {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const headers = this.getHeaders().set('x-timezone', timezone);
    return this.http.post<any>(`${this.baseUrl}/focus/fail`, data, { headers }).pipe(
      catchError(this.handleError.bind(this))
    );
  }

  // ============ USER PROFILE ============

  getProfile(): Observable<any> {
    return this.get<any>('/user/profile');
  }
}
