"use strict";

module.exports = function makeQuerablePromise(promise) {

  // Don't create a wrapper for promises that can already be queried.
  if (promise.isResolved) return promise;

  var isResolved = false;
  var isRejected = false;

  // Observe the promise, saving the fulfillment in a closure scope.
  var result = promise.then((v) => { isResolved = true; return v; }, (e)  => { isRejected = true; throw e; });
  result.isFulfilled = () => isResolved || isRejected;
  result.isResolved = () => isResolved;
  result.isRejected = () => isRejected;
  return result;
};
