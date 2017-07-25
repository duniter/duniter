import {AbstractIndex} from "../AbstractIndex"
import {SQLiteDriver} from "../../drivers/SQLiteDriver"
import {CindexEntry} from "../../../indexer"
import {CommonConstants} from "../../../common-libs/constants"

const constants = require('./../../../constants');
const indexer         = require('../../../indexer').Indexer

export class CIndexDAL extends AbstractIndex<CindexEntry> {

  constructor(driver:SQLiteDriver) {
    super(
      driver,
      'c_index',
      // PK fields
      ['op', 'issuer', 'receiver', 'written_on'],
      // Fields
      [
        'op',
        'issuer',
        'receiver',
        'created_on',
        'written_on',
        'writtenOn',
        'sig',
        'expires_on',
        'expired_on',
        'chainable_on',
        'from_wid',
        'to_wid'
      ],
      // Arrays
      [],
      // Booleans
      [],
      // BigIntegers
      [],
      // Transient
      []
    )
  }

  async init() {
    await this.exec('BEGIN;' +
      'CREATE TABLE IF NOT EXISTS ' + this.table + ' (' +
      'op VARCHAR(10) NOT NULL,' +
      'issuer VARCHAR(50) NOT NULL,' +
      'receiver VARCHAR(50) NOT NULL,' +
      'created_on VARCHAR(80) NOT NULL,' +
      'written_on VARCHAR(80) NOT NULL,' +
      'sig VARCHAR(100) NULL,' +
      'expires_on INTEGER NULL,' +
      'expired_on INTEGER NULL,' +
      'chainable_on INTEGER NULL,' +
      'from_wid INTEGER NULL,' +
      'to_wid INTEGER NULL,' +
      'PRIMARY KEY (op,issuer,receiver,written_on)' +
      ');' +
      'CREATE INDEX IF NOT EXISTS idx_cindex_issuer ON c_index (issuer);' +
      'CREATE INDEX IF NOT EXISTS idx_cindex_receiver ON c_index (receiver);' +
      'CREATE INDEX IF NOT EXISTS idx_cindex_chainable_on ON c_index (chainable_on);' +
      'COMMIT;')
  }

  async reducablesFrom(from:string) {
    const reducables = await this.query('SELECT * FROM ' + this.table + ' WHERE issuer = ? ORDER BY CAST(written_on as integer) ASC', [from]);
    return indexer.DUP_HELPERS.reduceBy(reducables, ['issuer', 'receiver', 'created_on']);
  }

  async trimExpiredCerts(belowNumber:number) {
    const toDelete = await this.query('SELECT * FROM ' + this.table + ' WHERE expired_on > ? AND CAST(written_on as int) < ?', [0, belowNumber])
    for (const row of toDelete) {
      await this.exec("DELETE FROM " + this.table + " " +
        "WHERE issuer like '" + row.issuer + "' " +
        "AND receiver = '" + row.receiver + "' " +
        "AND created_on like '" + row.created_on + "'");
    }
  }

  getWrittenOn(blockstamp:string) {
    return this.sqlFind({ written_on: blockstamp })
  }

  findExpired(medianTime:number) {
    return this.query('SELECT * FROM ' + this.table + ' c1 WHERE expires_on <= ? ' +
      'AND NOT EXISTS (' +
      ' SELECT * FROM c_index c2' +
      ' WHERE c1.issuer = c2.issuer' +
      ' AND c1.receiver = c2.receiver' +
      ' AND c1.created_on = c2.created_on' +
      ' AND c2.op = ?' +
      ')', [medianTime, CommonConstants.IDX_UPDATE])
  }

  getValidLinksTo(receiver:string) {
    return this.query('SELECT * FROM ' + this.table + ' c1 ' +
      'WHERE c1.receiver = ? ' +
      'AND c1.expired_on = 0 ' +
      'AND NOT EXISTS (' +
      ' SELECT * FROM c_index c2' +
      ' WHERE c1.issuer = c2.issuer' +
      ' AND c1.receiver = c2.receiver' +
      ' AND c1.created_on = c2.created_on' +
      ' AND c2.op = ?' +
      ')', [receiver, CommonConstants.IDX_UPDATE])
  }

  getValidLinksFrom(issuer:string) {
    return this.query('SELECT * FROM ' + this.table + ' c1 ' +
      'WHERE c1.issuer = ? ' +
      'AND c1.expired_on = 0 ' +
      'AND NOT EXISTS (' +
      ' SELECT * FROM c_index c2' +
      ' WHERE c1.issuer = c2.issuer' +
      ' AND c1.receiver = c2.receiver' +
      ' AND c1.created_on = c2.created_on' +
      ' AND c2.op = ?' +
      ')', [issuer, CommonConstants.IDX_UPDATE])
  }

  async existsNonReplayableLink(issuer:string, receiver:string) {
    const results = await this.query('SELECT * FROM ' + this.table + ' c1 ' +
      'WHERE c1.issuer = ? ' +
      'AND c1.receiver = ? ' +
      'AND NOT EXISTS (' +
      ' SELECT * FROM c_index c2' +
      ' WHERE c1.issuer = c2.issuer' +
      ' AND c1.receiver = c2.receiver' +
      ' AND c1.created_on = c2.created_on' +
      ' AND c2.op = ?' +
      ')', [issuer, receiver, CommonConstants.IDX_UPDATE]);
    return results.length > 0;
  }

  removeBlock(blockstamp:string) {
    return this.exec('DELETE FROM ' + this.table + ' WHERE written_on = \'' + blockstamp + '\'')
  }
}
