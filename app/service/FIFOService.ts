import {GlobalFifoPromise} from "./GlobalFifoPromise";

export abstract class FIFOService {

  constructor(private fifoPromiseHandler:GlobalFifoPromise) {}

  async pushFIFO<T>(operationId: string, p: () => Promise<T>): Promise<T> {
    return this.fifoPromiseHandler.pushFIFOPromise(operationId, p)
  }
}