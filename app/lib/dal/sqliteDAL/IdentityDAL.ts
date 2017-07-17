import {AbstractSQLite} from "./AbstractSQLite";
import {SQLiteDriver} from "../drivers/SQLiteDriver";
import {SandBox} from "./SandBox";
const constants = require('../../constants');

export interface DBIdentity {
  revoked: boolean
  currentMSN: null
  currentINN: null
  buid: string
  member: boolean
  kick: boolean
  leaving: boolean | null
  wasMember: boolean
  pubkey: string
  uid: string
  sig: string
  revocation_sig: string | null
  hash: string
  written: boolean
  wotb_id: number | null
  revoked_on: number | null
  expires_on: number
}

export interface DBSandboxIdentity extends DBIdentity {
  certsCount: number
  ref_block: number
}

export class IdentityDAL extends AbstractSQLite<DBIdentity> {

  constructor(driver:SQLiteDriver) {
    super(
      driver,
      'idty',
      // PK fields
      ['pubkey', 'uid', 'hash'],
      // Fields
      [
        'revoked',
        'revoked_on',
        'revocation_sig',
        'currentMSN',
        'currentINN',
        'buid',
        'member',
        'kick',
        'leaving',
        'wasMember',
        'pubkey',
        'uid',
        'sig',
        'hash',
        'written',
        'wotb_id',
        'expired',
        'expires_on',
        'removed'
      ],
      // Arrays
      [],
      // Booleans
      ['revoked', 'member', 'kick', 'leaving', 'wasMember', 'written', 'removed'],
      // BigIntegers
      [],
      // Transient
      ['certsCount', 'ref_block']
    )
  }

  async init() {
    await this.exec('BEGIN;' +
      'CREATE TABLE IF NOT EXISTS ' + this.table + ' (' +
      'revoked BOOLEAN NOT NULL,' +
      'currentMSN INTEGER NULL,' +
      'currentINN INTEGER NULL,' +
      'buid VARCHAR(100) NOT NULL,' +
      'member BOOLEAN NOT NULL,' +
      'kick BOOLEAN NOT NULL,' +
      'leaving BOOLEAN NULL,' +
      'wasMember BOOLEAN NOT NULL,' +
      'pubkey VARCHAR(50) NOT NULL,' +
      'uid VARCHAR(255) NOT NULL,' +
      'sig VARCHAR(100) NOT NULL,' +
      'revocation_sig VARCHAR(100) NULL,' +
      'hash VARCHAR(64) NOT NULL,' +
      'written BOOLEAN NULL,' +
      'wotb_id INTEGER NULL,' +
      'expires_on INTEGER NULL,' +
      'PRIMARY KEY (pubkey,uid,hash)' +
      ');' +
      'CREATE INDEX IF NOT EXISTS idx_idty_pubkey ON idty (pubkey);' +
      'CREATE INDEX IF NOT EXISTS idx_idty_uid ON idty (uid);' +
      'CREATE INDEX IF NOT EXISTS idx_idty_kick ON idty (kick);' +
      'CREATE INDEX IF NOT EXISTS idx_idty_member ON idty (member);' +
      'CREATE INDEX IF NOT EXISTS idx_idty_wasMember ON idty (wasMember);' +
      'CREATE INDEX IF NOT EXISTS idx_idty_hash ON idty (hash);' +
      'CREATE INDEX IF NOT EXISTS idx_idty_written ON idty (written);' +
      'CREATE INDEX IF NOT EXISTS idx_idty_currentMSN ON idty (currentMSN);' +
      'CREATE INDEX IF NOT EXISTS idx_idty_currentINN ON idty (currentINN);' +
      'COMMIT;')
  }

  revokeIdentity(pubkey:string) {
    return this.exec('DELETE FROM ' + this.table + ' WHERE pubkey = \'' + pubkey + '\'')
  }

  removeUnWrittenWithPubkey(pubkey:string) {
    return this.sqlRemoveWhere({
      pubkey: pubkey,
      written: false
    })
  }

  removeUnWrittenWithUID(uid:string) {
    return this.sqlRemoveWhere({
      uid: uid,
      written: false
    })
  }

  getByHash(hash:string) {
    return this.sqlFindOne({
      hash: hash
    })
  }

  saveIdentity(idty:DBIdentity) {
    return this.saveEntity(idty)
  }

  async deleteByHash(hash:string) {
    await this.exec('UPDATE ' + this.table + ' SET removed = 1 where hash = \'' + hash + '\'')
  }

  getToRevoke() {
    return this.sqlFind({
      revocation_sig: { $null: false },
      revoked: false,
      wasMember: true
    })
  }

  getPendingIdentities() {
    return this.sqlFind({
      revocation_sig: { $null: false },
      revoked: false
    })
  }

  searchThoseMatching(search:string) {
    return this.sqlFindLikeAny({
      pubkey: "%" + search + "%",
      uid: "%" + search + "%"
    })
  }

  async trimExpiredIdentities(medianTime:number) {
    await this.exec('DELETE FROM ' + this.table + ' WHERE (expires_on IS NULL AND revocation_sig IS NULL) OR expires_on < ' + medianTime)
  }

  /**************************
   * SANDBOX STUFF
   */

  getSandboxIdentities() {
    return this.query('SELECT * FROM sandbox_idty LIMIT ' + (this.sandbox.maxSize), [])
  }

  sandbox = new SandBox(constants.SANDBOX_SIZE_IDENTITIES, this.getSandboxIdentities.bind(this), (compared:DBSandboxIdentity, reference:DBSandboxIdentity) => {
    if (compared.certsCount < reference.certsCount) {
      return -1;
    }
    else if (compared.certsCount > reference.certsCount) {
      return 1;
    }
    else if (compared.ref_block < reference.ref_block) {
      return -1;
    }
    else if (compared.ref_block > reference.ref_block) {
      return 1;
    }
    else {
      return 0;
    }
  });

  getSandboxRoom() {
    return this.sandbox.getSandboxRoom()
  }

  setSandboxSize(maxSize:number) {
    this.sandbox.maxSize = maxSize
  }
}
