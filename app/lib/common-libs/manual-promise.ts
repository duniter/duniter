import {Querable} from "./querable"

const querablePromise = require('querablep');

export interface ManualPromise<T> extends Querable<T> {
  resolve: (data: T) => void
  reject: (error: Error) => void
}

/**
 * Creates a new querable promise that can is manually triggered.
 * @returns {ManualPromise<T>}
 */
export function newManualPromise<T>() {
  let resolveCb: (data: T) => void = () => {}
  let rejectCb: (error: Error) => void = () => {}
  const p = new Promise((res, rej) => {
    resolveCb = res
    rejectCb = rej
  })
  const q: ManualPromise<T> = querablePromise(p)
  q.resolve = resolveCb
  q.reject = rejectCb
  return q
}
