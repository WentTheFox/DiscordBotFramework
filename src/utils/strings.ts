/**
 * Takes an array of strings and tries to concatenate adjacent values together
 * using `glue` until each individual item is no longer than `maxLength`, then
 * returns the result.
 */
export const condenseStringArray = (strings: string[], maxLength = 2000, glue = ''): string[] => {
  const condensedArray: string[] = [];
  if (strings.length < 2) return strings;

  let currentItem = '';
  const pushCurrentItem = (reset = true) => {
    if (!currentItem) return;
    condensedArray.push(currentItem);
    if (reset) currentItem = '';
  };

  strings.forEach((item) => {
    if (item.length >= maxLength) {
      pushCurrentItem();
      condensedArray.push(item);
      return;
    }

    if (!currentItem) {
      currentItem = item;
      return;
    }

    const combinedItem = currentItem + glue + item;
    if (combinedItem.length <= maxLength) {
      currentItem = combinedItem;
      return;
    }

    pushCurrentItem(false);
    currentItem = item;
  });
  pushCurrentItem(false);

  return condensedArray;
};
