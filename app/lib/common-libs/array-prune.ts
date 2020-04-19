export function arrayPruneAll<T>(array: T[], value: T) {
  if (!array || array.length === 0) {
    return;
  }
  let index;
  do {
    index = array.indexOf(value);
    if (index !== -1) {
      array.splice(index, 1);
    }
  } while (index !== -1);
}

/**
 * Returs a copy of given array WITHOUT any record of `value`.
 * @param original The array we want records, with `value` being excluded.
 * @param value The value we don't want to see in our copy array.
 */
export function arrayPruneAllCopy<T>(original: T[], value: T) {
  const array = original.slice();
  let index;
  do {
    index = array.indexOf(value);
    if (index !== -1) {
      array.splice(index, 1);
    }
  } while (index !== -1);
  return array;
}
