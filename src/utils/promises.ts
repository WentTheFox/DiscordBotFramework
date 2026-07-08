export type LazyPromise<T> = () => Promise<T>;

/**
 * Takes a set of lazily-created promises and executes them in order.
 */
export const queueLazyPromises = <T>(lazyPromises: LazyPromise<T>[]): Promise<T[]> => {
  let queue: Promise<T[]> = Promise.resolve([]);
  if (lazyPromises.length > 0) {
    lazyPromises.forEach((lazyPromise) => {
      queue = queue.then(async (list) => [...list, await lazyPromise()] as T[]);
    });
  }
  return queue;
};
