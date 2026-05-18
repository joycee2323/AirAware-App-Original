import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  startService(): Promise<void>;
  configure(config: Object): Promise<void>;
  addListener(eventType: string): void;
  removeListeners(count: number): void;
  getWatchdogStats(): Promise<Object>;
  stopService(): Promise<void>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('BLEScanner');
