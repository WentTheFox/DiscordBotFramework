import { ShardingManager, ShardingManagerOptions } from 'discord.js';
import { NestableLogger } from '../logger/types.js';

export interface CreateShardManagerOptions extends Omit<ShardingManagerOptions, 'token'> {
  token: string;
  botScriptPath: string;
  logger: NestableLogger;
  /** Runs once before shards are spawned, e.g. to sync slash commands. */
  beforeSpawn?: () => Promise<void>;
}

/**
 * Thin wrapper over discord.js's `ShardingManager`: forwards shard lifecycle
 * events to the given logger and spawns shards, optionally running a
 * `beforeSpawn` hook first. Kept deliberately minimal — orchestration logic
 * specific to a bot (e.g. what exactly `beforeSpawn` does) stays bot-side.
 */
export async function createShardManager(options: CreateShardManagerOptions): Promise<ShardingManager> {
  const { token, botScriptPath, logger, beforeSpawn, ...managerOptions } = options;

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
  return manager;
}
