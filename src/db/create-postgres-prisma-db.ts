import { PrismaPg } from '@prisma/adapter-pg';

export interface CreatePostgresPrismaDbOptions {
  connectionString: string;
}

/**
 * Constructs a Prisma client backed by the `@prisma/adapter-pg` driver
 * adapter (Prisma's Postgres-only, ORM-optional pattern). The generated
 * Prisma client is always bot-specific, so its constructor is passed in
 * rather than imported here. Only importing this module (the `./db`
 * subpath) requires `@prisma/adapter-pg`/`@prisma/client` to be installed —
 * bots that never import it don't need those peer dependencies at all.
 *
 * @example
 * import { PrismaClient } from './generated/prisma/client.js';
 * const db = createPostgresPrismaDb(PrismaClient, { connectionString: env.DATABASE_URL });
 */
export function createPostgresPrismaDb<Client>(
  PrismaClientCtor: new (options: { adapter: PrismaPg }) => Client,
  options: CreatePostgresPrismaDbOptions,
): Client {
  return new PrismaClientCtor({ adapter: new PrismaPg({ connectionString: options.connectionString }) });
}
