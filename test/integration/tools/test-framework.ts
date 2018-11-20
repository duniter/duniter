import {catUser, NewTestingServer, tacUser, TestingServer, tocUser} from "./toolbox"
import {TestUser} from "./TestUser"
import * as assert from 'assert'
import {Underscore} from "../../../app/lib/common-libs/underscore"

export function writeBasicTestWith2Users(writeTests: (
  test: (
    testTitle: string,
    fn: (server: TestingServer, cat: TestUser, tac: TestUser, toc: TestUser) => Promise<void>
  ) => void
) => void) {

  writeBasicTestWithConfAnd2Users({}, writeTests)
}

export function writeBasicTestWithConfAnd2Users(conf: {

}, writeTests: (
  test: (
    testTitle: string,
    fn: (server: TestingServer, cat: TestUser, tac: TestUser, toc: TestUser) => Promise<void>
  ) => void
) => void) {

  let s1:TestingServer, cat:TestUser, tac:TestUser, toc:TestUser

  const configuration = Underscore.extend({
    medianTimeBlocks: 1,
    pair: {
      pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
      sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
    }
  }, conf)

  before(async () => {
    s1 = NewTestingServer(configuration)
    cat = catUser(s1)
    tac = tacUser(s1)
    toc = tocUser(s1)
    await s1.prepareForNetwork()
  })

  writeTests((title, cb: (server: TestingServer, cat: TestUser, tac: TestUser, toc: TestUser) => Promise<void>) => {
    it(title, async () => {
      await cb(s1, cat, tac, toc)
    })
  })
}

export async function createCurrencyWith2Blocks(s: TestingServer, cat: TestUser, tac: TestUser) {
  await cat.createIdentity()
  await tac.createIdentity()
  await cat.cert(tac)
  await tac.cert(cat)
  await cat.join()
  await tac.join()
  await s.commit()
  await s.commit()
  await s.commit()
}

export function assertEqual(value: number|string, expected: number|string) {
  assert.equal(value, expected)
}

export function assertTrue(expected: boolean) {
  assert.equal(true, expected)
}

export function assertNotNull(value: any) {
  assert.notEqual(value, null)
}

export function assertNull(value: any) {
  assert.equal(value, null)
}

export function assertFalse(expected: boolean) {
  assert.equal(false, expected)
}
