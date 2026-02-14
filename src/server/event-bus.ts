import { EventEmitter } from 'events';

/**
 * Central event bus for reactive communication between ELO modules.
 * Uses Node.js EventEmitter for pub/sub pattern.
 */
class ELOEventBus extends EventEmitter {
  private static instance: ELOEventBus;

  private constructor() {
    super();
    // Increase max listeners to handle multiple subscribers
    this.setMaxListeners(50);
  }

  static getInstance(): ELOEventBus {
    if (!ELOEventBus.instance) {
      ELOEventBus.instance = new ELOEventBus();
    }
    return ELOEventBus.instance;
  }

  /**
   * Emit an event with typed payload
   */
  emit(event: string, payload?: any): boolean {
    console.log(`[EventBus] Emitted: ${event}`, payload ? JSON.stringify(payload).slice(0, 100) + '...' : '');
    return super.emit(event, payload);
  }

  /**
   * Subscribe to an event with typed handler
   */
  on(event: string, listener: (...args: any[]) => void): this {
    console.log(`[EventBus] Subscribed to: ${event}`);
    return super.on(event, listener);
  }

  /**
   * Subscribe once to an event
   */
  once(event: string, listener: (...args: any[]) => void): this {
    console.log(`[EventBus] Subscribed once to: ${event}`);
    return super.once(event, listener);
  }

  /**
   * Unsubscribe from an event
   */
  off(event: string, listener: (...args: any[]) => void): this {
    return super.off(event, listener);
  }
}

// Export singleton instance
export const eventBus = ELOEventBus.getInstance();

// Event type definitions for better TypeScript support
export interface DeviceStateChangedEvent {
  deviceId: string;
  oldState: any;
  newState: any;
  timestamp: string;
  source: 'monitor' | 'action' | 'discovery';
}

export interface PersonDetectedEvent {
  cameraId: string;
  personId: string | null; // null for unknown
  confidence: number;
  timestamp: string;
  location?: { x: number; y: number; width: number; height: number };
}

export interface UserCorrectionEvent {
  deviceId: string;
  action: string;
  originalParams: any;
  correctedParams: any;
  context: {
    time: string;
    day: number; // 0-6, Sunday=0
    peoplePresent?: string[];
  };
  timestamp: string;
}

export interface AutomationTriggeredEvent {
  automationId: string;
  trigger: string;
  context: any;
  timestamp: string;
}

export interface DeviceDiscoveredEvent {
  ip: string;
  name?: string;
  type?: string;
  protocol?: string;
  brand?: string;
  model?: string;
  timestamp: string;
}

export interface NotificationEvent {
  type: 'alert' | 'info' | 'warning';
  title: string;
  message: string;
  priority: 'low' | 'medium' | 'high';
  channels: ('telegram' | 'push' | 'ui')[];
  context?: any;
  timestamp: string;
}

// Convenience methods for typed events
export const emitDeviceStateChanged = (event: DeviceStateChangedEvent) =>
  eventBus.emit('device:state_changed', event);

export const emitPersonDetected = (event: PersonDetectedEvent) =>
  eventBus.emit('person:detected', event);

export const emitUserCorrection = (event: UserCorrectionEvent) =>
  eventBus.emit('user:correction', event);

export const emitAutomationTriggered = (event: AutomationTriggeredEvent) =>
  eventBus.emit('automation:triggered', event);

export const emitDeviceDiscovered = (event: DeviceDiscoveredEvent) =>
  eventBus.emit('device:discovered', event);

export const emitNotification = (event: NotificationEvent) =>
  eventBus.emit('notification', event);