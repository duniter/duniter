import * as stream from "stream"
import * as assert from "assert"

import {WS2PSingleWriteStream} from "../../../../app/modules/ws2p/lib/WS2PSingleWriteStream"

const es = require('event-stream')

describe('WS2P Single Write limiter', () => {

  const PROTECTION_DURATION = 100
  
  it('should detect double writings', async () => {
    const source = new Readable()
    const protection = new WS2PSingleWriteStream(PROTECTION_DURATION)
    let nbDocs = 0
    await new Promise(res => {
      source
        .pipe(protection)
        .pipe(es.mapSync(() => {
        nbDocs++
        if (nbDocs >= 2) {
          res()
        }
      }))

      // Writing
      source.push({ joiners: [] }) // A block
      source.push({ joiners: [] }) // A block
      source.push({ endpoints: [] }) // A peer
    })
    assert.equal(nbDocs, 2)
    assert.equal(protection.getNbProtectionsCurrently(), 2)
    await new Promise(res => setTimeout(res, PROTECTION_DURATION + 100))
    assert.equal(protection.getNbProtectionsCurrently(), 0)
  })
})

class Readable extends stream.Readable {

  constructor() {
    super({ objectMode: true })
  }

  async _read() {
  }
}