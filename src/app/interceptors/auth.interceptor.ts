import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject, Injector } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { tokenExpired } from '../utils/session-token';

let endingSession = false;

function readToken(): string | null {
  try {
    const user = JSON.parse(localStorage.getItem('focus_user') || '{}');
    return user?.token || localStorage.getItem('auth_token');
  } catch {
    return null;
  }
}

function isAuthCall(url: string): boolean {
  return url.includes('/auth/');
}

function isSessionFailure(error: HttpErrorResponse): boolean {
  const code = error?.error?.code;
  const message = String(error?.error?.message || '');
  return code === 'token_expired' || /token failed|session expired/i.test(message);
}

function endSession(injector: Injector): void {
  if (endingSession) return;
  endingSession = true;
  try {
    injector.get(AuthService).logout();
    injector.get(Router).navigate(['/auth'], {
      queryParams: { mode: 'login', reason: 'expired' },
      replaceUrl: true,
    });
  } catch (err) {
    console.warn('Could not end expired session', err);
  }
  setTimeout(() => {
    endingSession = false;
  }, 3000);
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const injector = inject(Injector);

  if (!isAuthCall(req.url)) {
    const header = req.headers.get('Authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : readToken();
    if (token && tokenExpired(token)) {
      endSession(injector);
      return throwError(() => new HttpErrorResponse({
        status: 401,
        error: { code: 'token_expired', message: 'Session expired. Please log in again.' },
        url: req.url,
      }));
    }
  }

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (!isAuthCall(req.url) && error.status === 401 && isSessionFailure(error)) {
        endSession(injector);
      }
      return throwError(() => error);
    }),
  );
};
