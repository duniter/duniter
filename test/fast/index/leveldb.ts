import {assertEqual} from "../../integration/tools/test-framework"
import {LevelDBSindex} from "../../../app/lib/dal/indexDAL/leveldb/LevelDBSindex"

describe('LevelDB', () => {

  it('next hash function should return correct value', () => {
    assertEqual('AAB', LevelDBSindex.upperIdentifier('AAA'))
    assertEqual('0123456789ABCDEF', LevelDBSindex.upperIdentifier('0123456789ABCDEE'))
    assertEqual('FA0006', LevelDBSindex.upperIdentifier('FA0005'))
    assertEqual('FA00FG', LevelDBSindex.upperIdentifier('FA00FF'))
    assertEqual('FA00FF-1', LevelDBSindex.upperIdentifier('FA00FF-0'))
    assertEqual('FA00FF-A', LevelDBSindex.upperIdentifier('FA00FF-9'))
    assertEqual('FFG', LevelDBSindex.upperIdentifier('FFF'))
  })
})
