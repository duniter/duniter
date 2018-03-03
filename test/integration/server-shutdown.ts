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

import { ConfDTO } from '../../app/lib/dto/ConfDTO';
import { setTimeout } from 'timers';
import {NewTestingServer} from "./tools/toolbox"

const should = require('should')
const querablep = require('querablep')

describe("Server shutdown", () => {

  it('should not interrupt a task in the documents FIFO', async () => {
    const s1 = NewTestingServer({})

    const fifo = s1._server.getDocumentsFIFO()
    const ops:any[] = []
    for (let i = 0; i < 10; i++) {
      ops.push(querablep(fifo.pushFIFOPromise('op_' + i, async () => {
        // Wait 100ms
        await new Promise(res => setTimeout(res, 15))
      })))
    }
    fifo.remainingTasksCount().should.equal(10)
    while(fifo.remainingTasksCount() >= 9) {
      // Wait 1ms until two tasks have been taken
      await new Promise(res => setTimeout(res, 5))
    }
    await fifo.closeFIFO()
    await ops[0]
    await ops[1]
    fifo.remainingTasksCount().should.equal(8)
    ops[0].isFulfilled().should.equal(true)
    ops[1].isFulfilled().should.equal(true)
    for (let i = 2; i < 10; i++) {
      ops[i].isFulfilled().should.equal(false)
    }
  })
})
