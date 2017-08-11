import {SQLiteDriver} from "../../drivers/SQLiteDriver";
import {AbstractIndex} from "../AbstractIndex";
import {Indexer, MindexEntry} from "../../../indexer";

export class MIndexDAL extends AbstractIndex<MindexEntry> {

  constructor(driver:SQLiteDriver) {
    super(
      driver,
      'm_index',
      // PK fields
      ['op', 'pub', 'created_on', 'written_on'],
      // Fields
      [
        'op',
        'pub',
        'created_on',
        'written_on',
        'writtenOn',
        'expires_on',
        'expired_on',
        'revokes_on',
        'revoked_on',
        'chainable_on',
        'leaving',
        'revocation'
      ],
      // Arrays
      [],
      // Booleans
      ['leaving'],
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
      'pub VARCHAR(50) NOT NULL,' +
      'created_on VARCHAR(80) NOT NULL,' +
      'written_on VARCHAR(80) NOT NULL,' +
      'expires_on INTEGER NULL,' +
      'expired_on INTEGER NULL,' +
      'revokes_on INTEGER NULL,' +
      'revoked_on INTEGER NULL,' +
      'leaving BOOLEAN NULL,' +
      'revocation VARCHAR(80) NULL,' +
      'PRIMARY KEY (op,pub,created_on,written_on)' +
      ');' +
      'CREATE INDEX IF NOT EXISTS idx_mindex_pub ON m_index (pub);' +
      'COMMIT;')
  }

  async getReducedMS(pub:string) {
    const reducables = await this.reducable(pub);
    if (reducables.length) {
      return Indexer.DUP_HELPERS.reduce(reducables);
    }
    return null;
  }

  reducable(pub:string) {
    return this.query('SELECT * FROM ' + this.table + ' WHERE pub = ? ORDER BY CAST(written_on as integer) ASC', [pub])
}

  async removeBlock(blockstamp:string) {
    return this.exec('DELETE FROM ' + this.table + ' WHERE written_on = \'' + blockstamp + '\'')
  }
}
