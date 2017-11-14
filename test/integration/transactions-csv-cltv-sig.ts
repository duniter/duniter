import {simpleNodeWith2Users, TestingServer} from "./tools/toolbox"
import {hashf} from "../../app/lib/common"
import {Buid} from "../../app/lib/common-libs/buid"

describe("Transaction: CSV+CLTV+1of2SIG", function() {

  const now = 1500000000
  const DONT_WAIT_FOR_BLOCKCHAIN_CHANGE = true
  let s1:TestingServer
  let cat:any
  let tac:any
  let txHash:string

  const conf = {
    nbCores: 1,
    sigQty: 1,
    udTime0: now,
    medianTimeBlocks: 1 // MedianTime(t) = Time(t-1)
  }

  before(async () => {
    const res1 = await simpleNodeWith2Users(conf)
    s1 = res1.s1
    cat = res1.cat
    tac = res1.tac
    await s1.commit({ time: now })
    await s1.commit({ time: now })
  })

  it('cat should have 100 units', async () => {
    const sources = await s1.get('/tx/sources/' + cat.pub)
    sources.should.have.property('sources').length(1)
  })

  it('cat should be able to make a CSV+CLTV+1of2SIG tx', async () => {
    const current = await s1.dal.getCurrentBlockOrNull()
    const tx = await cat.makeTX([{
      src: '100:0:D:HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd:1',
      unlock: 'SIG(0)'
    }], [{
      qty: 100,
      base: 0,
      lock: '(SIG(' + cat.pub + ') || SIG(' + tac.pub + ')) && (CSV(10) || CLTV(' + now + '))'
    }], {
      blockstamp: Buid.format.buid(current)
    })
    txHash = hashf(tx)
    await cat.sendTX(tx)
    const block = await s1.commit({ time: now }, DONT_WAIT_FOR_BLOCKCHAIN_CHANGE)
    block.should.have.property('transactions').length(1)
    await s1.waitToHaveBlock(2)
  })

  it('tac should be able to consume the tx after 10s', async () => {
    await s1.commit({ time: now + 10 })
    await s1.commit({ time: now + 10 })
    const current = await s1.dal.getCurrentBlockOrNull()
    const tx = await tac.makeTX([{
      src: '100:0:T:' + txHash + ':0',
      unlock: 'SIG(0)'
    }], [{
      qty: 100,
      base: 0,
      lock: 'SIG(' + tac.pub + ')'
    }], {
      blockstamp: Buid.format.buid(current)
    })
    await tac.sendTX(tx)
    const block = await s1.commit(null, DONT_WAIT_FOR_BLOCKCHAIN_CHANGE)
    block.should.have.property('transactions').length(1)
  })

  after(async () => {
    await s1.closeCluster()
  })
})
