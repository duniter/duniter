// Source file from duniter: Crypto-currency software to manage libre currency such as Ğ1
// Copyright (C) 2018  Cedric Moreau <cem.moreau@gmail.com>
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.

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
