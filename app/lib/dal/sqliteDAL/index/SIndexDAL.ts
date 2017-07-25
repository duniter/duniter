import {Indexer, SindexEntry} from "../../../indexer"
import {SQLiteDriver} from "../../drivers/SQLiteDriver"
import {AbstractIndex} from "../AbstractIndex"
import {CommonConstants} from "../../../common-libs/constants"
const _ = require('underscore');
const common = require('../../../../../app/common');
const constants = require('../../../constants');

export class SIndexDAL extends AbstractIndex<SindexEntry> {

  constructor(driver:SQLiteDriver) {
    super(
      driver,
      's_index',
      // PK fields
      ['op', 'identifier', 'pos', 'written_on'],
      // Fields
      [
        'op',
        'tx',
        'identifier',
        'pos',
        'created_on',
        'written_on',
        'writtenOn',
        'written_time',
        'amount',
        'base',
        'locktime',
        'consumed',
        'conditions'
      ],
      // Arrays
      [],
      // Booleans
      ['consumed'],
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
      'tx VARCHAR(80) NULL,' +
      'identifier VARCHAR(64) NOT NULL,' +
      'pos INTEGER NOT NULL,' +
      'created_on VARCHAR(80) NULL,' +
      'written_on VARCHAR(80) NOT NULL,' +
      'written_time INTEGER NOT NULL,' +
      'amount INTEGER NULL,' +
      'base INTEGER NULL,' +
      'locktime INTEGER NULL,' +
      'consumed BOOLEAN NOT NULL,' +
      'conditions TEXT,' +
      'PRIMARY KEY (op,identifier,pos,written_on)' +
      ');' +
      'CREATE INDEX IF NOT EXISTS idx_sindex_identifier ON s_index (identifier);' +
      'CREATE INDEX IF NOT EXISTS idx_sindex_pos ON s_index (pos);' +
      'COMMIT;')
  }

  async removeBlock(blockstamp:string) {
    await this.exec('DELETE FROM ' + this.table + ' WHERE written_on = \'' + blockstamp + '\'')
  }

  async getSource(identifier:string, pos:number) {
    const reducable = await this.query('SELECT * FROM ' + this.table + ' s1 ' +
      'WHERE s1.identifier = ? ' +
      'AND s1.pos = ? ' +
      'ORDER BY op ASC', [identifier, pos]);
    if (reducable.length == 0) {
      return null;
    } else {
      const src = Indexer.DUP_HELPERS.reduce(reducable);
      src.type = src.tx ? 'T' : 'D';
      return src;
    }
  }

  async getUDSources(pubkey:string) {
    const reducables = await this.query('SELECT * FROM ' + this.table + ' s1 ' +
      'WHERE conditions = ? ' +
      'AND s1.tx IS NULL ' +
      'ORDER BY op ASC', ['SIG(' + pubkey + ')']);
    const reduced = Indexer.DUP_HELPERS.reduceBy(reducables, ['identifier', 'pos']).map((src) => {
      src.type = src.tx ? 'T' : 'D';
      return src;
    });
    return _.sortBy(reduced, (row:SindexEntry) => row.type == 'D' ? 0 : 1);
  }

  getAvailableForPubkey(pubkey:string) {
    return this.getAvailableForConditions('%SIG(' + pubkey + ')%')
  }

  async getAvailableForConditions(conditionsStr:string) {
    const potentials = await this.query('SELECT * FROM ' + this.table + ' s1 ' +
      'WHERE s1.op = ? ' +
      'AND conditions LIKE ? ' +
      'AND NOT EXISTS (' +
      ' SELECT * ' +
      ' FROM s_index s2 ' +
      ' WHERE s2.identifier = s1.identifier ' +
      ' AND s2.pos = s1.pos ' +
      ' AND s2.op = ?' +
      ') ' +
      'ORDER BY CAST(SUBSTR(written_on, 0, INSTR(written_on, "-")) as number)', [CommonConstants.IDX_CREATE, conditionsStr, CommonConstants.IDX_UPDATE]);
    const sources = potentials.map((src) => {
      src.type = src.tx ? 'T' : 'D';
      return src;
    });
    return _.sortBy(sources, (row:SindexEntry) => row.type == 'D' ? 0 : 1);
  }

  async trimConsumedSource(belowNumber:number) {
    const toDelete = await this.query('SELECT * FROM ' + this.table + ' WHERE consumed AND CAST(written_on as int) < ?', [belowNumber]);
    const queries = [];
    for (const row of toDelete) {
      const sql = "DELETE FROM " + this.table + " " +
        "WHERE identifier like '" + row.identifier + "' " +
        "AND pos = " + row.pos;
      queries.push(sql);
    }
    await this.exec(queries.join(';\n'));
  }
}
