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
import {SandBox} from './SandBox';
import {DBDocument} from './DocumentDAL';

const constants = require('../../constants');

export interface DBCert extends DBDocument {
  linked:boolean
  written:boolean
  written_block:number|null
  written_hash:string|null
  sig:string
  block_number:number
  block_hash:string
  target:string
  to:string
  from:string
  block:number
  expired: boolean | null
  expires_on: number
}

export class CertDAL extends AbstractSQLite<DBCert> {

  constructor(driver:SQLiteDriver) {
    super(
      driver,
      'cert',
      // PK fields
      ['from','target','sig'],
      // Fields
      [
        'linked',
        'written',
        'written_block',
        'written_hash',
        'sig',
        'block_number',
        'block_hash',
        'target',
        'to',
        'from',
        'block',
        'expired',
        'expires_on'
      ],
      // Arrays
      [],
      // Booleans
      ['linked', 'written'],
      // BigIntegers
      [],
      // Transient
      [],
      (entity:DBCert) => {
        entity.written = entity.written || !!(entity.written_hash)
      }
    )
  }

  async init() {
    await this.exec('BEGIN;' +
      'CREATE TABLE IF NOT EXISTS ' + this.table + ' (' +
      '`from` VARCHAR(50) NOT NULL,' +
      '`to` VARCHAR(50) NOT NULL,' +
      'target CHAR(64) NOT NULL,' +
      'sig VARCHAR(100) NOT NULL,' +
      'block_number INTEGER NOT NULL,' +
      'block_hash VARCHAR(64),' +
      'block INTEGER NOT NULL,' +
      'linked BOOLEAN NOT NULL,' +
      'written BOOLEAN NOT NULL,' +
      'written_block INTEGER,' +
      'written_hash VARCHAR(64),' +
      'expires_on INTEGER NULL,' +
      'PRIMARY KEY (`from`, target, sig, written_block)' +
      ');' +
      'CREATE INDEX IF NOT EXISTS idx_cert_from ON cert (`from`);' +
      'CREATE INDEX IF NOT EXISTS idx_cert_target ON cert (target);' +
      'CREATE INDEX IF NOT EXISTS idx_cert_linked ON cert (linked);' +
      'COMMIT;')
  }

  getToTarget(hash:string) {
    return this.sqlFind({
      target: hash
    })
  }

  getFromPubkeyCerts(pubkey:string) {
    return this.sqlFind({
      from: pubkey
    })
  }

  getNotLinked() {
    return this.sqlFind({
      linked: false
    })
  }

  getNotLinkedToTarget(hash:string) {
    return this.sqlFind({
      target: hash,
      linked: false
    })
  }

  saveNewCertification(cert:DBCert) {
    return this.saveEntity(cert)
  }

  existsGivenCert(cert:DBCert) {
    return this.sqlExisting(cert)
  }

  deleteCert(cert:{ from:string, target:string, sig:string }) {
    return this.deleteEntity(cert)
  }

  async trimExpiredCerts(medianTime:number) {
    await this.exec('DELETE FROM ' + this.table + ' WHERE expires_on IS NULL OR expires_on < ' + medianTime)
  }

  /**************************
   * SANDBOX STUFF
   */

  getSandboxForKey = (pub:string) => {
    const getRecorded = () => this.query('SELECT * FROM cert WHERE `from` = ? ORDER BY block_number ASC LIMIT ' + constants.SANDBOX_SIZE_CERTIFICATIONS, [pub])
    const compare = (compared:DBCert, reference:DBCert) => {
      if (compared.block_number < reference.block_number) {
        return -1
      }
      else if (compared.block_number > reference.block_number) {
        return 1
      }
      else {
        return 0
      }
    }
    return new SandBox(constants.SANDBOX_SIZE_CERTIFICATIONS, getRecorded, compare)
  }
}
