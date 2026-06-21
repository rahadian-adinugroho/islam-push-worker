import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { log, setLogLevel, getLogLevel, initLogger, type LogLevel } from '../src/logger';

describe('logger', () => {
  let consoleDebugSpy: ReturnType<typeof vi.spyOn>;
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setLogLevel('info'); // reset to default
  });

  afterEach(() => {
    consoleDebugSpy.mockRestore();
    consoleInfoSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('level filtering', () => {
    it('logs info and above at default level (info)', () => {
      log.debug('d');
      log.info('i');
      log.warn('w');
      log.error('e');

      expect(consoleDebugSpy).not.toHaveBeenCalled();
      expect(consoleInfoSpy).toHaveBeenCalledWith('i');
      expect(consoleWarnSpy).toHaveBeenCalledWith('w');
      expect(consoleErrorSpy).toHaveBeenCalledWith('e');
    });

    it('logs everything at debug level', () => {
      setLogLevel('debug');
      log.debug('d');
      log.info('i');
      log.warn('w');
      log.error('e');

      expect(consoleDebugSpy).toHaveBeenCalledWith('d');
      expect(consoleInfoSpy).toHaveBeenCalledWith('i');
      expect(consoleWarnSpy).toHaveBeenCalledWith('w');
      expect(consoleErrorSpy).toHaveBeenCalledWith('e');
    });

    it('logs only error at error level', () => {
      setLogLevel('error');
      log.debug('d');
      log.info('i');
      log.warn('w');
      log.error('e');

      expect(consoleDebugSpy).not.toHaveBeenCalled();
      expect(consoleInfoSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith('e');
    });

    it('logs nothing at none level', () => {
      setLogLevel('none');
      log.debug('d');
      log.info('i');
      log.warn('w');
      log.error('e');

      expect(consoleDebugSpy).not.toHaveBeenCalled();
      expect(consoleInfoSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe('initLogger', () => {
    it('parses LOG_LEVEL from env', () => {
      initLogger({ LOG_LEVEL: 'debug' });
      expect(getLogLevel()).toBe('debug');

      initLogger({ LOG_LEVEL: 'WARN' });
      expect(getLogLevel()).toBe('warn');
    });

    it('defaults to info when LOG_LEVEL is missing or invalid', () => {
      initLogger({});
      expect(getLogLevel()).toBe('info');

      initLogger({ LOG_LEVEL: 'invalid' });
      expect(getLogLevel()).toBe('info');
    });
  });

  describe('log levels enum', () => {
    it('has the expected levels in order', () => {
      const levels: LogLevel[] = ['debug', 'info', 'warn', 'error', 'none'];
      expect(levels).toEqual(['debug', 'info', 'warn', 'error', 'none']);
    });
  });
});
