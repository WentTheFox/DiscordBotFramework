import { applicationCommandOptionChoiceSchema } from './application-command-option-choice.schema.js';
import { channelTypeSchema } from './channel-type.schema.js';
import { optionNameSchema } from './option-name.schema.js';

/**
 * A non-nesting ApplicationCommandOption (every type except Subcommand/SubcommandGroup).
 * Modeled as flat oneOf branches (not allOf-composed with a shared base) because
 * additionalProperties:false inside an allOf branch only evaluates that branch's own
 * declared properties, rejecting fields declared on sibling allOf members (e.g. a
 * shared `name`) as "additional" and collapsing json-schema-to-ts's derived type to
 * `never` - confirmed via spike.
 */
export const applicationCommandLeafOptionSchema = {
  $id: 'https://schema.went.tf/discord-bot-framework/application-command-leaf-option.json',
  oneOf: [
    {
      type: 'object',
      properties: {
        name: { $ref: optionNameSchema.$id },
        description: { type: 'string' },
        type: { const: 3 },
        required: { type: 'boolean' },
        autocomplete: { type: 'boolean' },
        choices: { type: 'array', items: { $ref: applicationCommandOptionChoiceSchema.$id } },
        min_length: { type: 'integer', minimum: 0, maximum: 6000 },
        max_length: { type: 'integer', minimum: 1, maximum: 6000 },
      },
      required: ['name', 'type'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        name: { $ref: optionNameSchema.$id },
        description: { type: 'string' },
        type: { const: 4 },
        required: { type: 'boolean' },
        autocomplete: { type: 'boolean' },
        choices: { type: 'array', items: { $ref: applicationCommandOptionChoiceSchema.$id } },
        min_value: { type: 'integer' },
        max_value: { type: 'integer' },
      },
      required: ['name', 'type'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        name: { $ref: optionNameSchema.$id },
        description: { type: 'string' },
        type: { const: 5 },
        required: { type: 'boolean' },
      },
      required: ['name', 'type'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        name: { $ref: optionNameSchema.$id },
        description: { type: 'string' },
        type: { const: 6 },
        required: { type: 'boolean' },
      },
      required: ['name', 'type'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        name: { $ref: optionNameSchema.$id },
        description: { type: 'string' },
        type: { const: 7 },
        required: { type: 'boolean' },
        channel_types: { type: 'array', items: { $ref: channelTypeSchema.$id } },
      },
      required: ['name', 'type'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        name: { $ref: optionNameSchema.$id },
        description: { type: 'string' },
        type: { const: 8 },
        required: { type: 'boolean' },
      },
      required: ['name', 'type'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        name: { $ref: optionNameSchema.$id },
        description: { type: 'string' },
        type: { const: 9 },
        required: { type: 'boolean' },
      },
      required: ['name', 'type'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        name: { $ref: optionNameSchema.$id },
        description: { type: 'string' },
        type: { const: 10 },
        required: { type: 'boolean' },
        autocomplete: { type: 'boolean' },
        choices: { type: 'array', items: { $ref: applicationCommandOptionChoiceSchema.$id } },
        min_value: { type: 'number' },
        max_value: { type: 'number' },
      },
      required: ['name', 'type'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        name: { $ref: optionNameSchema.$id },
        description: { type: 'string' },
        type: { const: 11 },
        required: { type: 'boolean' },
      },
      required: ['name', 'type'],
      additionalProperties: false,
    },
  ],
} as const;
