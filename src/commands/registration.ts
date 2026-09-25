import { Snowflake } from 'discord-api-types/globals';
import {
  RESTGetAPICurrentUserGuildsResult,
  RESTPostAPIApplicationCommandsJSONBody,
  RESTPutAPIApplicationCommandsResult,
  RESTPutAPIApplicationGuildCommandsResult,
  Routes,
} from 'discord-api-types/v10';
import { REST } from '@discordjs/rest';
import { NestableLogger } from '../logger/types.js';

export interface CommandRegistrarOptions {
  rest: REST;
  applicationId: string;
  logger: NestableLogger;
}

export interface CommandRegistrar {
  getAuthorizedServers(): Promise<string[]>;
  updateGuildCommands(guildId: Snowflake, body: RESTPostAPIApplicationCommandsJSONBody[]): Promise<RESTPutAPIApplicationGuildCommandsResult>;
  cleanGuildCommands(guildId: Snowflake): Promise<void>;
  updateGlobalCommands(body: RESTPostAPIApplicationCommandsJSONBody[]): Promise<RESTPutAPIApplicationCommandsResult>;
  cleanGlobalCommands(): Promise<void>;
}

/**
 * Wraps `@discordjs/rest` slash-command (re)registration/cleanup for both
 * global and per-guild scopes. Failures are logged and then rethrown, leaving
 * it to the caller whether that's fatal - these also run inside long-lived
 * processes (e.g. an owner-only "update commands" interaction), where exiting
 * would take the whole bot down, and a startup sync script may still have
 * other independent steps worth finishing. An uncaught rejection still ends a
 * plain CLI script with a non-zero exit code, same as before.
 *
 * Timeouts and retries are whatever the passed-in `rest` is configured with -
 * a bulk overwrite can take Discord well past `@discordjs/rest`'s 15s default,
 * so bots may want a dedicated `REST` instance for this.
 */
export function createCommandRegistrar({ rest, applicationId, logger: baseLogger }: CommandRegistrarOptions): CommandRegistrar {
  return {
    async getAuthorizedServers(): Promise<string[]> {
      const logger = baseLogger.nest('getAuthorizedServers');
      logger.log('Getting authorized servers…');
      const guilds = await rest.get(Routes.userGuilds()) as RESTGetAPICurrentUserGuildsResult;
      logger.log(`Found ${guilds.length} authorized server${guilds.length === 1 ? '' : 's'}`);
      return guilds.map((guild) => guild.id);
    },

    async updateGuildCommands(guildId, body) {
      const logger = baseLogger.nest(['updateGuildCommands', `Guild#${guildId}`]);
      try {
        logger.log('Started reloading guild commands');
        const result = await rest.put(
          Routes.applicationGuildCommands(applicationId, guildId),
          { body },
        ) as RESTPutAPIApplicationGuildCommandsResult;
        logger.log('Successfully reloaded guild commands');
        return result;
      } catch (error) {
        logger.error('Failed to reload guild commands', error);
        throw error;
      }
    },

    async cleanGuildCommands(guildId) {
      const logger = baseLogger.nest(['cleanGuildCommands', `Guild#${guildId}`]);
      try {
        logger.log('Started cleaning guild commands');
        await rest.put(Routes.applicationGuildCommands(applicationId, guildId), { body: [] });
        logger.log('Successfully cleaned guild commands');
      } catch (error) {
        logger.error('Failed to clean guild commands', error);
        throw error;
      }
    },

    async updateGlobalCommands(body) {
      const logger = baseLogger.nest('updateGlobalCommands');
      try {
        logger.log('Started refreshing application commands');
        const result = await rest.put(
          Routes.applicationCommands(applicationId),
          { body },
        ) as RESTPutAPIApplicationCommandsResult;
        logger.log('Successfully reloaded application commands');
        return result;
      } catch (error) {
        logger.error('Failed to reload application commands', error);
        throw error;
      }
    },

    async cleanGlobalCommands() {
      const logger = baseLogger.nest('cleanGlobalCommands');
      try {
        logger.log('Started cleaning application commands');
        await rest.put(Routes.applicationCommands(applicationId), { body: [] });
        logger.log('Successfully cleaned application commands');
      } catch (error) {
        logger.error('Failed to clean application commands', error);
        throw error;
      }
    },
  };
}
