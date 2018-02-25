import {LOCAL_RULES_HELPERS} from "../../app/lib/rules/local_rules"

const _ = require('underscore')
const assert = require('assert')

describe("Protocol BR_G110 - chained tx depth", () => {

  const sindex = [
    { tx: 'A', op: 'UPDATE', identifier: 'UD1', pos: 0 },
    { tx: 'A', op: 'CREATE', identifier: 'TXA', pos: 0 },
    { tx: 'B', op: 'UPDATE', identifier: 'TXA', pos: 0 },
    { tx: 'B', op: 'CREATE', identifier: 'TXB', pos: 0 },
    { tx: 'C', op: 'UPDATE', identifier: 'TXB', pos: 0 },
    { tx: 'C', op: 'CREATE', identifier: 'TXC', pos: 0 },
    { tx: 'D', op: 'UPDATE', identifier: 'TXC', pos: 0 },
    { tx: 'D', op: 'CREATE', identifier: 'TXD', pos: 0 },
    { tx: 'E', op: 'UPDATE', identifier: 'TXD', pos: 0 },
    { tx: 'E', op: 'CREATE', identifier: 'TXE', pos: 0 },
    { tx: 'F', op: 'UPDATE', identifier: 'TXE', pos: 0 },
    { tx: 'F', op: 'CREATE', identifier: 'TXF', pos: 0 },
    { tx: 'G', op: 'UPDATE', identifier: 'TXF', pos: 0 },
    { tx: 'G', op: 'CREATE', identifier: 'TXG', pos: 0 },
    { tx: 'H', op: 'UPDATE', identifier: 'TXG', pos: 0 },
    { tx: 'H', op: 'CREATE', identifier: 'TXH', pos: 0 },
  ]

  it('should detected normal depth', () => {
    assert.equal(0, LOCAL_RULES_HELPERS.getTransactionDepth('A', sindex))
    assert.equal(1, LOCAL_RULES_HELPERS.getTransactionDepth('B', sindex))
    assert.equal(2, LOCAL_RULES_HELPERS.getTransactionDepth('C', sindex))
    assert.equal(3, LOCAL_RULES_HELPERS.getTransactionDepth('D', sindex))
    assert.equal(4, LOCAL_RULES_HELPERS.getTransactionDepth('E', sindex))
    assert.equal(5, LOCAL_RULES_HELPERS.getTransactionDepth('F', sindex))
    assert.equal(6, LOCAL_RULES_HELPERS.getTransactionDepth('G', sindex))
  })

  it('should detected max the depth to 6', () => {
    assert.equal(6, LOCAL_RULES_HELPERS.getTransactionDepth('H', sindex))
  })

  it('should find the max depth globally', () => {
    assert.equal(6, LOCAL_RULES_HELPERS.getMaxTransactionDepth(sindex))
  })
})

