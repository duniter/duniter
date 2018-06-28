const querablePromise = require('querablep');

export interface Querable<T> extends Promise<T> {
  isFulfilled(): boolean
  isResolved(): boolean
  isRejected(): boolean
  startedOn: number
}

export function querablep<T>(p: Promise<T>): Querable<T> {
  const qp = querablePromise(p)
  qp.startedOn = Date.now()
  return qp
}
