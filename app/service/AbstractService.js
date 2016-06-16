"use strict";
const async           = require('async');
const Q               = require('q');

const fifo = async.queue(function (task, callback) {
  task(callback);
}, 1);

module.exports = function AbstractService () {

  /**
   * Adds a promise to a FIFO stack of promises, so the given promise will be executed against a shared FIFO stack.
   * @param p
   * @returns {Q.Promise<T>} A promise wrapping the promise given in the parameter.
   */
  this.pushFIFO = (p) => {
    // Return a promise that will be done after the fifo has executed the given promise
    return Q.Promise((resolve, reject) => {
      // Push the promise on the stack
      fifo.push(function (cb) {
        // OK its the turn of given promise, execute it
        p()
          // Finished, we end the function in the FIFO
        .then((res) => cb(null, res))
          // Errored, we end the function with an error
        .catch(cb);
      }, (err, res) => {
        // An error occured => reject promise
        if (err) return reject(err);
        // Success => we resolve with given promise result
        resolve(res);
      });
    });
  };
};
