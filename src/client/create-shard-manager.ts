import { ShardingManager, ShardingManagerOptions } from 'discord.js';
import { NestableLogger } from '../logger/types.js';

export interface CreateShardManagerOptions extends Omit<ShardingManagerOptions, 'token'> {
  token: string;
  botScriptPath: string;
  logger: NestableLogger;
  /** Runs once before shards are spawned, e.g. to sync slash commands. */
  beforeSpawn?: () => Promise<void>;
  /**
   * Optional OS signal (e.g. `'SIGUSR2'`) that, when received, calls the
   * manager's `respawnAll()` instead of requiring a full process restart to
   * pick up shard-side code changes. Shards are killed/respawned one at a
   * time, so a deploy only takes a single shard offline briefly (a few
   * seconds) instead of the whole fleet going down together — the manager
   * process itself is never restarted, so this does NOT pick up changes to
   * this file's own code path (e.g. `beforeSpawn` or manager options), only
   * what the spawned shard script itself imports fresh on respawn. A signal
   * received while a respawn is already in progress is ignored. Omit to
   * disable (default).
   */
  gracefulRespawnSignal?: NodeJS.Signals;
}

/**
 * Thin wrapper over discord.js's `ShardingManager`: forwards shard lifecycle
 * events to the given logger and spawns shards, optionally running a
 * `beforeSpawn` hook first. Kept deliberately minimal — orchestration logic
 * specific to a bot (e.g. what exactly `beforeSpawn` does) stays bot-side.
 */
export async function createShardManager(options: CreateShardManagerOptions): Promise<ShardingManager> {
  const { token, botScriptPath, logger, beforeSpawn, gracefulRespawnSignal, ...managerOptions } = options;

  if (beforeSpawn) {
    await beforeSpawn();
  }

  logger.log(`Starting recommended number of shards with path ${botScriptPath}`);
  const manager = new ShardingManager(botScriptPath, { token, ...managerOptions });

  manager.on('shardCreate', (shard) => {
    logger.log(`Shard ${shard.id} created`);
    shard.on('spawn', () => logger.log(`Shard ${shard.id} spawned`));
    shard.on('ready', () => logger.log(`Shard ${shard.id} ready`));
    shard.on('disconnect', () => logger.log(`Shard ${shard.id} disconnected`));
    shard.on('reconnecting', () => logger.log(`Shard ${shard.id} reconnecting`));
    shard.on('death', () => logger.log(`Shard ${shard.id} died`));
  });

  await manager.spawn();

  if (gracefulRespawnSignal) {
    registerGracefulRespawnTrigger(manager, logger, gracefulRespawnSignal);
  }

  return manager;
}

function registerGracefulRespawnTrigger(manager: ShardingManager, logger: NestableLogger, signal: NodeJS.Signals): void {
  let respawnInProgress = false;

  process.on(signal, () => {
    if (respawnInProgress) {
      logger.warn(`Received ${signal} while a respawn was already in progress, ignoring`);
      return;
    }

    respawnInProgress = true;
    logger.log(`Received ${signal}, gracefully respawning all shards…`);
    const start = Date.now();
    manager.respawnAll()
      .then(() => {
        logger.log(`All shards respawned in ${Date.now() - start}ms`);
      })
      .catch((e) => {
        logger.error('Failed to respawn all shards', e);
      })
      .finally(() => {
        respawnInProgress = false;
      });
  });
}
