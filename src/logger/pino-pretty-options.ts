import pretty from 'pino-pretty';

type PrettyOptions = NonNullable<Parameters<typeof pretty>[0]>;

/**
 * Shared between the bare `Logger` constructor's synchronous pretty stream and
 * `createLogger`'s console transport target, so both render the same
 * `[prefix1][prefix2] message` bracket style pino's own bindings-based prefixLabel
 * produces. `messageFormat` must stay a plain string template (not a function) so it
 * survives being passed into a `pino.transport()` worker thread.
 */
export const PINO_PRETTY_OPTIONS: PrettyOptions = {
  colorize: true,
  ignore: 'pid,hostname,prefixLabel',
  messageFormat: '{prefixLabel}{msg}',
  // Writes synchronously (fs.writeSync) instead of sonic-boom's default async
  // buffering, so log output can't be lost on abrupt process exit and so it's
  // deterministically observable/testable via a single fs.writeSync call.
  sync: true,
};
