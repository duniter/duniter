import {SQLiteDriver} from "../../drivers/SQLiteDriver";
import {AbstractIndex} from "../AbstractIndex";
import {IindexEntry, Indexer} from "../../../indexer";

const _ = require('underscore');

export interface OldIindexEntry extends IindexEntry {
  pubkey: string
  buid: string | null
  revocation_sig:string | null
}

export class IIndexDAL extends AbstractIndex<IindexEntry> {

  constructor(driver:SQLiteDriver) {
    super(
      driver,
      'i_index',
      // PK fields
      ['op', 'pub', 'created_on', 'written_on'],
      // Fields
      [
        'op',
        'uid',
        'pub',
        'hash',
        'sig',
        'created_on',
        'written_on',
        'writtenOn',
        'member',
        'wasMember',
        'kick',
        'wotb_id'
      ],
      // Arrays
      [],
      // Booleans
      ['member', 'wasMember', 'kick'],
      // BigIntegers
      [],
      // Transient
      []
    )
  }

  init() {
    return this.exec('BEGIN;' +
      'CREATE TABLE IF NOT EXISTS ' + this.table + ' (' +
      'op VARCHAR(10) NOT NULL,' +
      'uid VARCHAR(100) NULL,' +
      'pub VARCHAR(50) NOT NULL,' +
      'hash VARCHAR(80) NULL,' +
      'sig VARCHAR(80) NULL,' +
      'created_on VARCHAR(80) NULL,' +
      'written_on VARCHAR(80) NOT NULL,' +
      'member BOOLEAN NULL,' +
      'wasMember BOOLEAN NULL,' +
      'kick BOOLEAN NULL,' +
      'wotb_id INTEGER NULL,' +
      'PRIMARY KEY (op,pub,created_on,written_on)' +
      ');' +
      'CREATE INDEX IF NOT EXISTS idx_iindex_pub ON i_index (pub);' +
      'COMMIT;')
  }

  async getMembers() {
    // All those who has been subject to, or who are currently subject to kicking. Make one result per pubkey.
    const pubkeys = await this.query('SELECT DISTINCT(pub) FROM ' + this.table);
    // We get the full representation for each member
    const reduced = await Promise.all(pubkeys.map(async (entry) => {
      const reducable = await this.reducable(entry.pub);
      return Indexer.DUP_HELPERS.reduce(reducable);
    }));
    // Filter on those to be kicked, return their pubkey
    const filtered = _.filter(reduced, (entry:IindexEntry) => entry.member);
    return filtered.map((t:IindexEntry) => this.toCorrectEntity(t))
  }

  getMembersPubkeys() {
    return this.query('SELECT i1.pub ' +
      'FROM i_index i1 ' +
      'WHERE i1.member ' +
      'AND CAST(i1.written_on as int) = (' +
      ' SELECT MAX(CAST(i2.written_on as int)) ' +
      ' FROM i_index i2 ' +
      ' WHERE i1.pub = i2.pub ' +
      ' AND i2.member IS NOT NULL' +
      ')')
  }

  async getLatestMember() {
    const res:any = (await this.query('SELECT MAX(wotb_id) as max_wotb_id FROM ' + this.table))[0]
    const max_wotb_id = res.max_wotb_id
    return this.entityOrNull('wotb_id', max_wotb_id)
  }

  async getToBeKickedPubkeys() {
    // All those who has been subject to, or who are currently subject to kicking. Make one result per pubkey.
    const reducables = Indexer.DUP_HELPERS.reduceBy(await this.sqlFind({ kick: true }), ['pub']);
    // We get the full representation for each member
    const reduced = await Promise.all(reducables.map(async (entry) => {
      const reducable = await this.reducable(entry.pub);
      return Indexer.DUP_HELPERS.reduce(reducable);
    }))
    // Filter on those to be kicked, return their pubkey
    return _.filter(reduced, (entry:IindexEntry) => entry.kick).map((entry:IindexEntry) => entry.pub);
  }

  async searchThoseMatching(search:string) {
    const reducables = Indexer.DUP_HELPERS.reduceBy(await this.sqlFindLikeAny({
        pub: "%" + search + "%",
        uid: "%" + search + "%"
      }), ['pub']);
    // We get the full representation for each member
    return await Promise.all(reducables.map(async (entry) => {
      return this.toCorrectEntity(Indexer.DUP_HELPERS.reduce(await this.reducable(entry.pub)))
    }))
  }

  getFromPubkey(pubkey:string) {
    return this.entityOrNull('pub', pubkey)
  }

  getFromUID(uid:string) {
    return this.entityOrNull('uid', uid)
  }

  getFromHash(hash:string) {
    return this.entityOrNull('hash', hash, true)
  }

  reducable(pub:string) {
    return this.query('SELECT * FROM ' + this.table + ' WHERE pub = ? ORDER BY CAST(written_on as integer) ASC', [pub])
  }

  removeBlock(blockstamp:string) {
    return this.exec('DELETE FROM ' + this.table + ' WHERE written_on = \'' + blockstamp + '\'')
  }

  private async entityOrNull(field:string, value:any, retrieveOnField:boolean = false) {
    let reducable = await this.query('SELECT * FROM ' + this.table + ' WHERE ' + field + ' = ?', [value]);
    if (reducable.length) {
      if (retrieveOnField) {
        // Force full retrieval on `pub` field
        reducable = await this.query('SELECT * FROM ' + this.table + ' WHERE pub = ? ORDER BY CAST(written_on as int) ASC', [reducable[0].pub]);
      }
      return this.toCorrectEntity(Indexer.DUP_HELPERS.reduce(reducable));
    }
    return null;
  }

  private toCorrectEntity(row:IindexEntry): OldIindexEntry {
    // Old field
    return {
      pubkey: row.pub,
      pub: row.pub,
      buid: row.created_on,
      revocation_sig: null,
      uid: row.uid,
      hash: row.hash,
      sig: row.sig,
      created_on: row.created_on,
      member: row.member,
      wasMember: row.wasMember,
      kick: row.kick,
      wotb_id: row.wotb_id,
      age: row.age,
      index: row.index,
      op: row.op,
      writtenOn: row.writtenOn,
      written_on: row.written_on
    }
  }
}
