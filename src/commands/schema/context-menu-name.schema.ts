export const contextMenuNameSchema = {
  $id: 'https://schema.went.tf/discord-bot-framework/context-menu-name.json',
  description:
    "Discord's name pattern for USER/MESSAGE context-menu commands - mixed case allowed, spaces allowed, 1-32 characters. Narrowed to ASCII for the same regex-flag reason documented in option-name.schema.ts.",
  type: 'string',
  pattern: "^[-' _a-zA-Z0-9]{1,32}$",
} as const;
