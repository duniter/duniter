import {catUser, NewTestingServer, tacUser, TestingServer} from "./toolbox"
import {TestUser} from "./TestUser"
import * as assert from 'assert'

export function writeBasicTestWith2Users(writeTests: (test: (testTitle: string, fn: (server: TestingServer, cat: TestUser, tac: TestUser) => Promise<void>) => void) => void) {

  let s1:TestingServer, cat:TestUser, tac:TestUser

  before(async () => {
    s1 = NewTestingServer({
      medianTimeBlocks: 1,
      pair: {
        pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
        sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
      }
    })
    cat = catUser(s1)
    tac = tacUser(s1)
    await s1.prepareForNetwork()
  })

  writeTests((title, cb: (server: TestingServer, cat: TestUser, tac: TestUser) => Promise<void>) => {
    it(title, async () => {
      await cb(s1, cat, tac)
    })
  })
}

export function assertEqual(value: number, expected: number) {
  assert.equal(value, expected)
}

export function assertTrue(expected: boolean) {
  assert.equal(true, expected)
}

export function assertFalse(expected: boolean) {
  assert.equal(false, expected)
}