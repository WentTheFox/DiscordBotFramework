import {
  ChannelType,
  Client,
  Guild,
  GuildMember,
  Interaction,
  Role,
  TextBasedChannel,
  TextChannel,
} from 'discord.js';

export const getServer = (client: Client, serverId: string): Guild => {
  const foundServer = client.guilds.cache.get(serverId);

  if (!foundServer) throw new Error(`Could not find server with ID ${serverId}`);

  return foundServer;
};

export const findServerTextChannelByName = <Name extends string>(server: Guild, name: Name): TextChannel & { name: Name } => {
  const foundChannel = server?.channels.cache
    .find((channel) => channel.name === name);

  if (!foundChannel) throw new Error(`Could not find a channel named ${name}`);
  if (foundChannel.isThread()) throw new Error(`Found thread for name ${name}, expected GuildChannel`);
  if (foundChannel.type !== ChannelType.GuildText) throw new Error(`Found non-text channel for name ${name} (type=${foundChannel.type})`);

  return foundChannel as TextChannel & { name: Name };
};

export const findServerRoleByName = <Name extends string>(server: Guild, name: Name): Role & { name: Name } => {
  const foundRole = server?.roles.cache.find((role) => role.name === name);

  if (!foundRole) throw new Error(`Could not find a role named ${name}`);

  return foundRole as Role & { name: Name };
};

export const isChannelName = (channel: TextBasedChannel | null | undefined, name: string): boolean => Boolean(channel && 'name' in channel && channel.name === name);

export const findServerMember = (interaction: Interaction): GuildMember => {
  const serverMember = interaction.member;

  if (!serverMember) {
    throw new Error('Could not find `member` on interaction');
  }

  if (!(serverMember instanceof GuildMember)) {
    throw new Error('Expected `serverMember` to be an instance of GuildMember');
  }

  return serverMember;
};

export const getServerMemberRole = (member: GuildMember, roleName: string): Role | undefined => (
  member.roles.cache.find((role) => role.name === roleName)
);

export const serverMemberHasRole = (member: GuildMember, role: Role): boolean => (
  member.roles.cache.has(role.id)
);

export const isSameObject = <T extends { id: string }>(member1: Pick<T, 'id'>, member2: Pick<T, 'id'>): boolean => (
  member1.id === member2.id
);
