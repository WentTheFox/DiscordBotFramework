import { describe, expect, it, vi } from 'vitest';
import { REST } from '@discordjs/rest';
import { DevNullLogger } from '../logger/dev-null-logger.js';
import { createCommandRegistrar } from './registration.js';

const createRegistrar = (put: ReturnType<typeof vi.fn>) => createCommandRegistrar({
  rest: { put } as unknown as REST,
  applicationId: 'app-1',
  logger: new DevNullLogger(),
});

describe('createCommandRegistrar', () => {
  it('returns the result of a successful global commands update', async () => {
    const result = [{ id: 'cmd-1' }];
    const registrar = createRegistrar(vi.fn().mockResolvedValue(result));

    await expect(registrar.updateGlobalCommands([])).resolves.toBe(result);
  });

  it('rethrows failures instead of exiting the process', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const error = new Error('This operation was aborted');
    const registrar = createRegistrar(vi.fn().mockRejectedValue(error));

    await expect(registrar.updateGlobalCommands([])).rejects.toBe(error);
    await expect(registrar.updateGuildCommands('guild-1', [])).rejects.toBe(error);
    await expect(registrar.cleanGlobalCommands()).rejects.toBe(error);
    await expect(registrar.cleanGuildCommands('guild-1')).rejects.toBe(error);
    expect(exit).not.toHaveBeenCalled();
    exit.mockRestore();
  });
});
