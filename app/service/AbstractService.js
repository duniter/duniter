"use strict";
const async = require('async');
const Q     = require('q');
const co    = require('co');

const fifo = async.queue(function (task, callback) {
  task(callback);
}, 1);

module.exports = function AbstractService () {

  /**
   * Gets the queue object for advanced flow control.
   */
  this.getFIFO = () => fifo;

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
        co(function*(){
          // OK its the turn of given promise, execute it
          try {
            const res = yield p();
            // Finished, we end the function in the FIFO
            cb(null, res);
          } catch (e) {
            // Errored, we end the function with an error
            cb(e);
          }
        });
      }, (err, res) => {
        // An error occured => reject promise
        if (err) return reject(err);
        // Success => we resolve with given promise result
        resolve(res);
      });
    });
  };
};
