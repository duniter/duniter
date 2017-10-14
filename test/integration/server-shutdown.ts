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
