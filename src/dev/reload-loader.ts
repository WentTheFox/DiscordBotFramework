import type {
  InitializeHook,
  LoadFnOutput,
  LoadHook,
  ResolveFnOutput,
  ResolveHook,
} from 'node:module';

// Runs in Node's dedicated loader thread (see `module.register()`), separate from the
// main thread — state here can only be shared back via the SharedArrayBuffer passed
// through `initialize`'s `data`, never via plain module-level variables on the main side.
const EPOCH_PARAM = 'reloadEpoch';

let rootUrl: string | undefined;
let epochView: Int32Array | undefined;

export interface ReloadLoaderData {
  /** file:// URL prefix (with trailing slash) of the directory whose modules should be cache-busted on reload. Everything outside it (node_modules, this framework) is left untouched. */
  rootUrl: string;
  /** Shared 4-byte counter bumped on the main thread before each reload; read here to tag freshly-resolved local modules. */
  sab: SharedArrayBuffer;
}

export const initialize: InitializeHook<ReloadLoaderData> = (data) => {
  rootUrl = data.rootUrl;
  epochView = new Int32Array(data.sab);
};

export const resolve: ResolveHook = async (specifier, context, nextResolve) => {
  const result: ResolveFnOutput = await nextResolve(specifier, context);
  if (!rootUrl || !epochView || !result.url.startsWith(rootUrl)) {
    return result;
  }

  const url = new URL(result.url);
  url.searchParams.set(EPOCH_PARAM, String(Atomics.load(epochView, 0)));
  return { ...result, url: url.href };
};

export const load: LoadHook = async (url, context, nextLoad) => {
  if (!url.includes(EPOCH_PARAM)) {
    return nextLoad(url, context) as Promise<LoadFnOutput>;
  }

  const parsed = new URL(url);
  parsed.searchParams.delete(EPOCH_PARAM);
  return nextLoad(parsed.href, context) as Promise<LoadFnOutput>;
};
