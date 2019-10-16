// Source file from duniter: Crypto-currency software to manage libre currency such as Ğ1
// Copyright (C) 2018  Cedric Moreau <cem.moreau@gmail.com>
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.

import {Querable} from "../../../lib/common-libs/querable"

const querablep = require('querablep')

/*********
 *
 * PoW worker
 * ----------
 *
 * Its model is super simple: we ask him to find a proof, and we can wait for it.
 * Eventually, we can tell him to cancel his proof, which makes it answer `null` as proof value.
 *
 * The worker also provides two properties:
 *
 * - `worker.online`: a promise which is resolved when the worker gets « online » for the first time
 * - `worker.exit`: a promise which is resolved when the worker exits (which occurs when the worker is being closed or killed)
 *
 ********/

export class PowWorker {

  private onlinePromise:Promise<void>
  private onlineResolver:()=>void

  private exitPromise:Promise<void>
  private exitResolver:()=>void

  private proofPromise:Querable<{ message: { answer:any }}|null>
  private proofResolver:(proof:{ message: { answer:any }}|null)=>void

  private messageHandler:((worker:any, msg:any)=>void)

  constructor(
    private nodejsWorker:any,
    private onPowMessage:(message:any)=>void,
    private onlineHandler:()=>void,
    private exitHandler:(code:any, signal:any)=>void) {

    // Handle "online" promise
    this.onlinePromise = new Promise(res => this.onlineResolver = res)
    nodejsWorker.on('online', () => {
      this.onlineHandler()
      this.onlineResolver()
    })

    // Handle "exit" promise
    this.exitPromise = new Promise(res => this.exitResolver = res)
    nodejsWorker.on('exit', (code:any, signal:any) => {
      this.exitHandler(code, signal)
      this.exitResolver()
    })

    nodejsWorker.on('message', (message:any) => {
      if (message) {
        this.onPowMessage(message)
      }
      if (this.proofPromise && message.uuid && !this.proofPromise.isResolved() && this.proofResolver) {
        const result:{ message: { answer:any }}|null = message ? { message } : null
        this.proofResolver(result)
      }
    })
  }

  get online() {
    return this.onlinePromise
  }

  get exited() {
    return this.exitPromise
  }

  get pid() {
    return this.nodejsWorker.process.pid
  }

  askProof(commandMessage:{ uuid:string, command:string, value:any }) {
    this.proofPromise = querablep(new Promise<{ message: { answer:any }}|null>(res => this.proofResolver = res))
    this.nodejsWorker.send(commandMessage)
    return this.proofPromise
  }

  sendConf(confMessage:{ rootPath: string, command:string, value:any }) {
    this.nodejsWorker.send(confMessage)
  }

  sendCancel() {
    this.nodejsWorker.send({
      command: 'cancel'
    })
  }

  kill() {
    this.nodejsWorker.kill()
  }
}