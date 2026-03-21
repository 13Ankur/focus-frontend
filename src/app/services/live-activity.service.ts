import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { registerPlugin } from '@capacitor/core';

export interface LiveActivityPlugin {
    startActivity(options: {
        remainingSeconds: number;
        totalSeconds: number;
        buddyName: string;
        isRunning?: boolean
    }): Promise<{ activityId: string }>;

    updateActivity(options: {
        remainingSeconds: number;
        totalSeconds: number;
        buddyName: string;
        isRunning: boolean
    }): Promise<void>;

    endActivity(options: {
        remainingSeconds: number;
        totalSeconds: number;
        buddyName: string
    }): Promise<void>;

    isSupported(): Promise<{ supported: boolean }>;
}

const LiveActivity = registerPlugin<LiveActivityPlugin>('LiveActivity');

@Injectable({
    providedIn: 'root'
})
export class LiveActivityService {
    private isSupported = false;
    private currentActivityId: string | null = null;

    constructor() {
        this.checkSupport();
    }

    private async checkSupport() {
        if (Capacitor.getPlatform() === 'ios') {
            try {
                const result = await LiveActivity.isSupported();
                this.isSupported = result.supported;
                console.log('Live Activities supported:', this.isSupported);
            } catch (error) {
                console.error('Error checking Live Activity support:', error);
                this.isSupported = false;
            }
        }
    }

    async startActivity(remainingSeconds: number, totalSeconds: number, buddyName: string): Promise<void> {
        if (!this.isSupported) return;

        try {
            const result = await LiveActivity.startActivity({
                remainingSeconds,
                totalSeconds,
                buddyName,
                isRunning: true
            });
            this.currentActivityId = result.activityId;
            console.log('Started Live Activity:', this.currentActivityId);
        } catch (error) {
            console.error('Error starting Live Activity:', error);
        }
    }

    async updateActivity(remainingSeconds: number, totalSeconds: number, buddyName: string, isRunning: boolean): Promise<void> {
        if (!this.isSupported) return;

        try {
            await LiveActivity.updateActivity({
                remainingSeconds,
                totalSeconds,
                buddyName,
                isRunning
            });
        } catch (error) {
            console.error('Error updating Live Activity:', error);
        }
    }

    async endActivity(remainingSeconds: number = 0, totalSeconds: number = 0, buddyName: string = ''): Promise<void> {
        if (!this.isSupported) return;

        try {
            await LiveActivity.endActivity({
                remainingSeconds,
                totalSeconds,
                buddyName
            });
            this.currentActivityId = null;
            console.log('Ended Live Activity');
        } catch (error) {
            console.error('Error ending Live Activity:', error);
        }
    }
}
