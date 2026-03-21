import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../environments/environment';

export interface RoomMember {
  userId: string;
  username: string;
  activeBreed: string;
  joinedAt: string;
}

export interface FocusRoom {
  _id: string;
  roomCode: string;
  createdBy: string;
  name: string;
  members: RoomMember[];
  maxMembers: number;
  isActive: boolean;
  lastActivityAt: string;
  createdAt: string;
}

export interface RoomActivity {
  username: string;
  breed: string;
  duration: number;
  completedAt: string;
  tag: string | null;
}

export interface LeaderboardEntry {
  _id: string;
  userId: string;
  username: string;
  activeBreed: string;
  period: string;
  periodKey: string;
  focusMinutes: number;
  sessionsCompleted: number;
  mealsProvided: number;
}

export interface UserRank {
  rank: number | null;
  entry: LeaderboardEntry | null;
  nextEntry: LeaderboardEntry | null;
}

@Injectable({ providedIn: 'root' })
export class SocialService {
  private apiUrl = environment.apiUrl;
  private myRoomsSubject = new BehaviorSubject<FocusRoom[]>([]);
  myRooms$ = this.myRoomsSubject.asObservable();

  private pollingInterval: any = null;

  constructor(private http: HttpClient) {}

  private getHeaders(): HttpHeaders {
    try {
      const user = JSON.parse(localStorage.getItem('focus_user') || '{}');
      return new HttpHeaders({
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user?.token || ''}`,
      });
    } catch {
      return new HttpHeaders({ 'Content-Type': 'application/json' });
    }
  }

  get myRooms(): FocusRoom[] {
    return this.myRoomsSubject.value;
  }

  // ── Rooms ──

  async loadMyRooms(): Promise<FocusRoom[]> {
    try {
      const res: any = await this.http.get(`${this.apiUrl}/social/rooms/mine`, {
        headers: this.getHeaders(),
      }).toPromise();
      const rooms = res?.rooms || [];
      this.myRoomsSubject.next(rooms);
      return rooms;
    } catch {
      return [];
    }
  }

  async createRoom(name: string): Promise<{ room: FocusRoom; code: string }> {
    const res: any = await this.http.post(`${this.apiUrl}/social/rooms`, { name }, {
      headers: this.getHeaders(),
    }).toPromise();
    await this.loadMyRooms();
    return res;
  }

  async getRoomByCode(code: string): Promise<FocusRoom | null> {
    try {
      const res: any = await this.http.get(`${this.apiUrl}/social/rooms/${code.toUpperCase()}`, {
        headers: this.getHeaders(),
      }).toPromise();
      return res?.room || null;
    } catch {
      return null;
    }
  }

  async joinRoom(code: string): Promise<FocusRoom | null> {
    const res: any = await this.http.post(`${this.apiUrl}/social/rooms/${code.toUpperCase()}/join`, {}, {
      headers: this.getHeaders(),
    }).toPromise();
    await this.loadMyRooms();
    return res?.room || null;
  }

  async leaveRoom(code: string): Promise<void> {
    await this.http.post(`${this.apiUrl}/social/rooms/${code.toUpperCase()}/leave`, {}, {
      headers: this.getHeaders(),
    }).toPromise();
    await this.loadMyRooms();
  }

  async getRoomActivity(code: string): Promise<RoomActivity[]> {
    try {
      const res: any = await this.http.get(`${this.apiUrl}/social/rooms/${code.toUpperCase()}/activity`, {
        headers: this.getHeaders(),
      }).toPromise();
      return res?.activity || [];
    } catch {
      return [];
    }
  }

  // ── Leaderboard ──

  async getGlobalLeaderboard(period: string = 'weekly'): Promise<LeaderboardEntry[]> {
    try {
      const res: any = await this.http.get(`${this.apiUrl}/social/leaderboard?period=${period}`, {
        headers: this.getHeaders(),
      }).toPromise();
      return res?.leaderboard || [];
    } catch {
      return [];
    }
  }

  async getRoomLeaderboard(code: string, period: string = 'weekly'): Promise<LeaderboardEntry[]> {
    try {
      const res: any = await this.http.get(
        `${this.apiUrl}/social/leaderboard/room/${code.toUpperCase()}?period=${period}`,
        { headers: this.getHeaders() },
      ).toPromise();
      return res?.leaderboard || [];
    } catch {
      return [];
    }
  }

  async getMyRank(period: string = 'weekly'): Promise<UserRank> {
    try {
      const res: any = await this.http.get(`${this.apiUrl}/social/leaderboard/rank?period=${period}`, {
        headers: this.getHeaders(),
      }).toPromise();
      return res as UserRank;
    } catch {
      return { rank: null, entry: null, nextEntry: null };
    }
  }

  // ── Polling for room activity ──

  startPolling(code: string, callback: (activity: RoomActivity[]) => void, intervalMs = 30000): void {
    this.stopPolling();
    const poll = async () => {
      const activity = await this.getRoomActivity(code);
      callback(activity);
    };
    poll();
    this.pollingInterval = setInterval(poll, intervalMs);
  }

  stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }
}
