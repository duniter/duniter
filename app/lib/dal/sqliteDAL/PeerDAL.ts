import {SQLiteDriver} from "../drivers/SQLiteDriver"
import {AbstractSQLite} from "./AbstractSQLite"

export class DBPeer {

  version: number
  currency: string
  status: string
  statusTS: number
  hash: string
  first_down: number | null
  last_try: number | null
  pubkey: string
  block: string
  signature: string 
  endpoints: string[]
  raw: string

  json() {
    return {
      version: this.version,
      currency: this.currency,
      endpoints: this.endpoints,
      status: this.status,
      block: this.block,
      signature: this.signature,
      raw: this.raw,
      pubkey: this.pubkey
    }
  }
}

export class PeerDAL extends AbstractSQLite<DBPeer> {

  constructor(driver:SQLiteDriver) {
    super(
      driver,
      'peer',
      // PK fields
      ['pubkey'],
      // Fields
      [
        'version',
        'currency',
        'status',
        'statusTS',
        'hash',
        'first_down',
        'last_try',
        'pubkey',
        'block',
        'signature',
        'endpoints',
        'raw'
      ],
      // Arrays
      ['endpoints'],
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
      'version INTEGER NOT NULL,' +
      'currency VARCHAR(50) NOT NULL,' +
      'status VARCHAR(10),' +
      'statusTS INTEGER NOT NULL,' +
      'hash CHAR(64),' +
      'first_down INTEGER,' +
      'last_try INTEGER,' +
      'pubkey VARCHAR(50) NOT NULL,' +
      'block VARCHAR(60) NOT NULL,' +
      'signature VARCHAR(100),' +
      'endpoints TEXT NOT NULL,' +
      'raw TEXT,' +
      'PRIMARY KEY (pubkey)' +
      ');' +
      'CREATE INDEX IF NOT EXISTS idx_link_source ON peer (pubkey);' +
      'COMMIT;')
  }

  listAll() {
    return this.sqlListAll()
  }

  getPeer(pubkey:string) {
    return this.sqlFindOne({ pubkey: pubkey })
  }

  getPeersWithEndpointsLike(str:string) {
    return this.query('SELECT * FROM peer WHERE endpoints LIKE ?', ['%' + str + '%'])
  }

  savePeer(peer:DBPeer) {
    return this.saveEntity(peer)
  }

  removePeerByPubkey(pubkey:string) {
    return this.exec('DELETE FROM peer WHERE pubkey LIKE \'' + pubkey + '\'')
  }

  async removeAll() {
    await this.sqlDeleteAll()
  }
}
