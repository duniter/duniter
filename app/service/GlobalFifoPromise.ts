"use strict";
const async = require('async');

const fifo = async.queue(function (task:any, callback:any) {
  task(callback);
}, 1);

export class GlobalFifoPromise {

  static getLen() {
    return fifo.length()
  }

  /**
   * Adds a promise to a FIFO stack of promises, so the given promise will be executed against a shared FIFO stack.
   * @param p
   * @returns {Promise<T>} A promise wrapping the promise given in the parameter.
   */
  static pushFIFO(p: () => Promise<any>) {
    // Return a promise that will be done after the fifo has executed the given promise
    return new Promise((resolve:any, reject:any) => {
      // Push the promise on the stack
      fifo.push(async (cb:any) => {
        // OK its the turn of given promise, execute it
        try {
          const res = await p();
          // Finished, we end the function in the FIFO
          cb(null, res);
        } catch (e) {
          // Errored, we end the function with an error
          cb(e);
        }
      }, (err:any, res:any) => {
        // An error occured => reject promise
        if (err) return reject(err);
        // Success => we resolve with given promise result
        resolve(res);
      });
    });
  };
}
