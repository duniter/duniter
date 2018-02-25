import {GlobalFifoPromise} from "./GlobalFifoPromise";
import * as stream from 'stream';

export abstract class FIFOService extends stream.Readable {

  constructor(private fifoPromiseHandler:GlobalFifoPromise) {
    super({ objectMode: true })
  }

  async pushFIFO<T>(operationId: string, p: () => Promise<T>): Promise<T> {
    return this.fifoPromiseHandler.pushFIFOPromise(operationId, p)
  }
}