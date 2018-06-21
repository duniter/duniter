const querablePromise = require('querablep');

export interface Querable<T> extends Promise<T> {
  isFulfilled(): boolean
  isResolved(): boolean
  isRejected(): boolean
}

export function querablep<T>(p: Promise<T>): Querable<T> {
  return querablePromise(p)
}
