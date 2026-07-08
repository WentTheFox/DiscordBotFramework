export type LogMethod =
  | 'debug'
  | 'info'
  | 'log'
  | 'warn'
  | 'error';

export type NestableLogger = Record<LogMethod, (...params: unknown[]) => void> & {
  nest(nestedPrefix: string | string[]): NestableLogger;

  muteMethods(mutedMethods: LogMethod[]): NestableLogger;
};
