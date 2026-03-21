import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

export interface FocusSession {
  _id: string;
  startTime: Date;
  duration: number;
  status: 'completed' | 'failed';
}

export interface CompleteSessionResponse {
  session: FocusSession;
  kibbleAwarded: number;
  message: string;
}

@Injectable({
  providedIn: 'root'
})
export class FocusService {
  private apiUrl = environment.apiUrl;

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) {}

  completeSession(
    startTime: Date,
    duration: number,
    status: 'completed' | 'failed'
  ): Observable<CompleteSessionResponse> {
    return this.http.post<CompleteSessionResponse>(
      `${this.apiUrl}/focus/complete`,
      {
        startTime: startTime.toISOString(),
        duration,
        status
      },
      {
        headers: this.authService.getAuthHeaders()
      }
    );
  }
}
