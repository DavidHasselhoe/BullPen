// Centralized Logging Utility
// Provides structured logging with environment-aware levels
// In production, only logs errors. In development, logs everything.

const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

type LogContext = Record<string, unknown>;

/**
 * Structured logger that respects environment
 */
class Logger {
  private shouldLog(level: LogLevel): boolean {
    if (isDevelopment) return true;
    // In production, only log errors and warnings
    return level === 'error' || level === 'warn';
  }

  info(message: string, context?: LogContext): void {
    if (!this.shouldLog('info')) return;
    console.log(`[INFO] ${message}`, context || '');
  }

  warn(message: string, context?: LogContext): void {
    if (!this.shouldLog('warn')) return;
    console.warn(`[WARN] ${message}`, context || '');
  }

  error(message: string, error?: Error | unknown, context?: LogContext): void {
    if (!this.shouldLog('error')) return;
    let errorMsg: string;
    let stack: string | undefined;
    if (error instanceof Error) {
      errorMsg = error.message;
      stack = error.stack;
    } else if (error && typeof error === 'object' && 'message' in error) {
      errorMsg = String((error as { message?: string }).message ?? JSON.stringify(error));
      if ('code' in error) errorMsg = `[${(error as { code?: string }).code}] ${errorMsg}`;
    } else {
      errorMsg = error != null ? JSON.stringify(error) : 'unknown';
    }
    // Sanitize: never log full HTML error pages (e.g. Cloudflare 522)
    if (errorMsg.includes('<!DOCTYPE') || errorMsg.includes('<html') || errorMsg.length > 200) {
      errorMsg = errorMsg.includes('522') ? 'Connection timed out' : 'Request failed';
    }
    console.error(`[ERROR] ${message}`, { error: errorMsg, ...context });
  }

  debug(message: string, context?: LogContext): void {
    if (!isDevelopment) return;
    console.debug(`[DEBUG] ${message}`, context || '');
  }
}

export const logger = new Logger();
