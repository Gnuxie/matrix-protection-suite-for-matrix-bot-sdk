/**
 * Copyright (C) 2024 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 */

import { LogService } from 'matrix-bot-sdk';
import { ILoggerProvider } from 'matrix-protection-suite';

/**
 * A logger provider that uses the `LogService` from the bot-sdk to provide logging capability.
 * @see {@link setGlobalLoggerProvider}
 */
export class BotSDKLogServiceLogger implements ILoggerProvider {
  debug(moduleName: string, message: string, ...parts: unknown[]): void {
    LogService.debug(moduleName, message, ...parts);
  }
  info(moduleName: string, message: string, ...parts: unknown[]): void {
    LogService.info(moduleName, message, ...parts);
  }
  warn(moduleName: string, message: string, ...parts: unknown[]): void {
    LogService.warn(moduleName, message, ...parts);
  }
  error(moduleName: string, message: string, ...parts: unknown[]): void {
    LogService.error(moduleName, message, ...parts);
  }
}
