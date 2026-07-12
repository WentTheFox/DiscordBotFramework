import { Snowflake } from 'discord-api-types/v10';
import {
  ApplicationCommandOptionType,
  BaseGuildTextChannel,
  ChannelType,
  Collection,
  CommandInteraction,
  CommandInteractionOption,
  Message,
  User,
} from 'discord.js';
import { queueLazyPromises } from './promises.js';
import { condenseStringArray } from './strings.js';

export async function sendMessageSlices(channel: BaseGuildTextChannel, message: string): Promise<void> {
  const messageSlices = condenseStringArray(message.split(/\n\n/g), 2000, '\n\n');

  await queueLazyPromises(messageSlices.map((slice) => () => channel.send(slice)));
}

export async function loadAllMessages(channel: BaseGuildTextChannel): Promise<Collection<Snowflake, Message>> {
  let beforeId: string | undefined;
  let done = false;
  let allMessages: Collection<Snowflake, Message> = new Collection();
  while (!done) {
    const messages = await channel.messages.fetch({
      limit: 10,
      before: beforeId || undefined,
    });

    if (messages.size > 0) {
      beforeId = messages.lastKey();
      allMessages = allMessages.concat(messages);
    } else {
      done = true;
    }
  }

  return allMessages;
}

type UserFriendCode = `@${string}` | `${string}#${string}`;

/**
 * Formats a user as `@username` (the post-migration username system) or
 * `username#discriminator` (legacy accounts, `discriminator !== '0'`).
 */
export const getUserFriendCode = (user: User): UserFriendCode =>
  user.discriminator === '0' ? `@${user.username}` : `${user.username}#${user.discriminator}`;

export const getUserIdentifier = (user: User): `${UserFriendCode} (${string})` => `${getUserFriendCode(user)} (${user.id})`;

export const stringifyChannelName = (channel: CommandInteraction['channel']): string => {
  if (channel) {
    let stringName: string;
    if (channel.type === ChannelType.GuildText && 'name' in channel) {
      stringName = `#${channel.name}`;
    } else {
      stringName = channel.toString();
    }

    return `${stringName} (${channel.id})`;
  }

  return '(unknown channel)';
};

export const stringifyOptionsData = (data: readonly CommandInteractionOption[]): string => data.map((option): string => {
  const optionName = option.name;
  let optionValue: string | number | boolean | null | undefined = option.value;
  switch (option.type) {
    case ApplicationCommandOptionType.Channel:
      if (option.channel) optionValue = `${option.channel.type === ChannelType.GuildText ? '#' : ''}${option.channel.name}`;
      break;
    case ApplicationCommandOptionType.User:
      if (option.user) optionValue = getUserIdentifier(option.user);
      break;
    case ApplicationCommandOptionType.Role:
      if (option.role) optionValue = `@${option.role.name}`;
      break;
    case ApplicationCommandOptionType.Subcommand:
      optionValue = option.options ? stringifyOptionsData(option.options) : null;
      break;
    default:
      break;
  }
  return `(${optionName}${optionValue !== null ? `:${optionValue}` : ''})`;
})
  .join(' ');
