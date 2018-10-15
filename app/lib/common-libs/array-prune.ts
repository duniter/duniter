export function arrayPruneAll<T>(array: T[], value: T) {
  if (!array || array.length === 0) {
    return
  }
  let index
  do {
    index = array.indexOf(value)
    if (index !== -1) {
      array.splice(index, 1)
    }
  } while (index !== -1)
}

export function arrayPruneAllCopy<T>(original: T[], value: T) {
  const array = original.slice()
  let index
  do {
    index = array.indexOf(value)
    if (index !== -1) {
      array.splice(index, 1)
    }
  } while (index !== -1)
  return array
}
