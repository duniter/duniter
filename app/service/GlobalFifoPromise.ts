import {CommonConstants} from "../lib/common-libs/constants"
import {NewLogger} from "../lib/logger"

const querablep = require('querablep');
const async = require('async');
const logger = NewLogger()

export class GlobalFifoPromise {

  private fifo:any = async.queue(function (task:any, callback:any) {
    task(callback);
  }, 1)

  private operations:{ [k:string]: boolean } = {}
  private currentPromise:any

  constructor() {
  }

  /**
   * Adds a promise to a FIFO stack of promises, so the given promise will be executed against a shared FIFO stack.
   * @param operationId The ID of the operation, which indicates which task to reject if the FIFO already contains it
   * @param p
   */
  pushFIFOPromise<T>(operationId: string, p: () => Promise<T>): Promise<T> {
    // Return a promise that will be done after the fifo has executed the given promise
    return new Promise((resolve:any, reject:any) => {
      if (this.operations[operationId]) {
        throw CommonConstants.ERRORS.DOCUMENT_BEING_TREATED
      }
      this.operations[operationId] = true
      // Push the promise on the stack
      this.fifo.push(async (cb:any) => {
        // OK its the turn of given promise, execute it
        try {
          this.currentPromise = querablep(p())
          const res = await this.currentPromise
          delete this.operations[operationId]
          // Finished, we end the function in the FIFO
          cb(null, res);
        } catch (e) {
          delete this.operations[operationId]
          // Errored, we end the function with an error
          cb(e);
        }
      }, (err:any, res:T) => {
        // An error occured => reject promise
        if (err) return reject(err);
        // Success => we resolve with given promise result
        resolve(res);
      });
    });
  }

  async closeFIFO() {
    this.fifo.pause()
    if (this.currentPromise && !this.currentPromise.isFulfilled()) {
      logger.info('Waiting current task of documentFIFO to be finished...')
      await this.currentPromise
    }
  }

  remainingTasksCount() {
    return this.fifo.length()
  }
}
