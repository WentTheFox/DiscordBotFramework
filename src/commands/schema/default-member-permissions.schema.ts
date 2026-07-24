export const defaultMemberPermissionsSchema = {
  $id: 'https://schema.went.tf/discord-bot-framework/default-member-permissions.json',
  description: 'Discord sends default_member_permissions as a stringified permissions bitfield integer.',
  type: 'string',
  pattern: '^-?[0-9]+$',
} as const;
