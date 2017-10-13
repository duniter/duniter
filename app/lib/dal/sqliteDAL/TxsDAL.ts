import {AbstractSQLite} from "./AbstractSQLite"
import {SQLiteDriver} from "../drivers/SQLiteDriver"
import {TransactionDTO} from "../../dto/TransactionDTO"
import {SandBox} from "./SandBox"

const _ = require('underscore');
const moment = require('moment');
const constants = require('../../constants');

export class DBTx {
  hash: string
  block_number: number | null
  locktime: number
  version: number
  currency: string
  comment: string
  blockstamp: string
  blockstampTime: number | null
  time: number | null
  inputs: string[]
  unlocks: string[]
  outputs: string[]
  issuers: string[]
  signatures: string[]
  recipients: string[]
  written: boolean
  removed: boolean
  received: number
  output_base: number
  output_amount: number

  static fromTransactionDTO(tx:TransactionDTO) {
    const dbTx = new DBTx()
    dbTx.hash = tx.hash
    dbTx.locktime = tx.locktime
    dbTx.version = tx.version
    dbTx.currency = tx.currency
    dbTx.blockstamp = tx.blockstamp
    dbTx.blockstampTime = tx.blockstampTime
    dbTx.comment = tx.comment || ""
    dbTx.inputs = tx.inputs
    dbTx.unlocks = tx.unlocks
    dbTx.outputs = tx.outputs
    dbTx.issuers = tx.issuers
    dbTx.signatures = tx.signatures
    dbTx.recipients = tx.outputsAsRecipients()
    dbTx.written = false
    dbTx.removed = false
    dbTx.output_base = tx.output_base
    dbTx.output_amount = tx.output_amount
    return dbTx
  }

  static setRecipients(txs:DBTx[]) {
    // Each transaction must have a good "recipients" field for future searchs
    txs.forEach((tx) => tx.recipients = DBTx.outputs2recipients(tx))
  }

  static outputs2recipients(tx:DBTx) {
    return tx.outputs.map(function(out) {
      const recipent = out.match('SIG\\((.*)\\)')
      return (recipent && recipent[1]) || 'UNKNOWN'
    })
  }
}

export class TxsDAL extends AbstractSQLite<DBTx> {

  constructor(driver:SQLiteDriver) {
    super(
      driver,
      'txs',
      // PK fields
      ['hash'],
      // Fields
      [
        'hash',
        'block_number',
        'version',
        'currency',
        'comment',
        'blockstamp',
        'blockstampTime',
        'locktime',
        'received',
        'time',
        'written',
        'removed',
        'inputs',
        'unlocks',
        'outputs',
        'issuers',
        'signatures',
        'recipients',
        'output_base',
        'output_amount'
      ],
      // Arrays
      ['inputs','unlocks','outputs','issuers','signatures','recipients'],
      // Booleans
      ['written','removed'],
      // BigIntegers
      [],
      // Transient
      []
    )
  }

  async init() {
    await this.exec('BEGIN;' +
      'CREATE TABLE IF NOT EXISTS ' + this.table + ' (' +
      'hash CHAR(64) NOT NULL,' +
      'block_number INTEGER,' +
      'locktime INTEGER NOT NULL,' +
      'version INTEGER NOT NULL,' +
      'currency VARCHAR(50) NOT NULL,' +
      'comment VARCHAR(255) NOT NULL,' +
      'time DATETIME,' +
      'inputs TEXT NOT NULL,' +
      'unlocks TEXT NOT NULL,' +
      'outputs TEXT NOT NULL,' +
      'issuers TEXT NOT NULL,' +
      'signatures TEXT NOT NULL,' +
      'recipients TEXT NOT NULL,' +
      'written BOOLEAN NOT NULL,' +
      'removed BOOLEAN NOT NULL,' +
      'PRIMARY KEY (hash)' +
      ');' +
      'CREATE INDEX IF NOT EXISTS idx_txs_issuers ON txs (issuers);' +
      'CREATE INDEX IF NOT EXISTS idx_txs_written ON txs (written);' +
      'CREATE INDEX IF NOT EXISTS idx_txs_removed ON txs (removed);' +
      'CREATE INDEX IF NOT EXISTS idx_txs_hash ON txs (hash);' +
      'COMMIT;')
  }

  getAllPending(versionMin:number): Promise<DBTx[]> {
    return this.sqlFind({
      written: false,
      removed: false,
      version: { $gte: versionMin }
    })
  }

  getTX(hash:string): Promise<DBTx> {
    return this.sqlFindOne({
      hash: hash
    })
  }

  async removeTX(hash:string) {
    const tx = await this.sqlFindOne({
      hash: hash
    });
    if (tx) {
      tx.removed = true;
      return this.saveEntity(tx);
    }
    return tx
  }

  addLinked(tx:TransactionDTO, block_number:number, time:number) {
    const dbTx = DBTx.fromTransactionDTO(tx)
    dbTx.block_number = block_number
    dbTx.time = time
    dbTx.received = moment().unix()
    dbTx.written = true
    dbTx.removed = false
    dbTx.hash = tx.getHash()
    return this.saveEntity(dbTx)
  }

  addPending(dbTx:DBTx) {
    dbTx.received = moment().unix()
    dbTx.written = false
    dbTx.removed = false
    //dbTx.hash = tx.getHash()
    return this.saveEntity(dbTx)
  }

  getLinkedWithIssuer(pubkey:string): Promise<DBTx[]> {
    return this.sqlFind({
      issuers: { $contains: pubkey },
      written: true
    })
  }

  async getLinkedWithRecipient(pubkey:string) {
    const rows = await this.sqlFind({
      recipients: { $contains: pubkey },
      written: true
    })
    // Which does not contains the key as issuer
    return _.filter(rows, (row:DBTx) => row.issuers.indexOf(pubkey) === -1);
  }

  getPendingWithIssuer(pubkey:string) {
    return this.sqlFind({
      issuers: { $contains: pubkey },
      written: false,
      removed: false
    })
  }

  getPendingWithRecipient(pubkey:string) {
    return this.sqlFind({
      recipients: { $contains: pubkey },
      written: false,
      removed: false
    })
  }

  insertBatchOfTxs(txs:DBTx[]) {
    // // Be sure the recipients field are correctly updated
    DBTx.setRecipients(txs);
    const queries = [];
    const insert = this.getInsertHead();
    const values = txs.map((cert) => this.getInsertValue(cert));
    if (txs.length) {
      queries.push(insert + '\n' + values.join(',\n') + ';');
    }
    if (queries.length) {
      this.exec(queries.join('\n'));
    }
  }

  trimExpiredNonWrittenTxs(limitTime:number) {
    return this.exec("DELETE FROM txs WHERE NOT written AND blockstampTime <= " + limitTime)
  }

  getTransactionByExtendedHash(hash:string) {
    return this.query("SELECT * FROM txs WHERE hash = ? OR v4_hash = ? OR v5_hash = ?", [hash, hash, hash])
  }

  /**************************
   * SANDBOX STUFF
   */

  getSandboxTxs() {
    return this.query('SELECT * FROM sandbox_txs LIMIT ' + (this.sandbox.maxSize), [])
  }

  sandbox = new SandBox(constants.SANDBOX_SIZE_TRANSACTIONS, this.getSandboxTxs.bind(this), (compared:DBTx, reference:DBTx) => {
    if (compared.output_base < reference.output_base) {
      return -1;
    }
    else if (compared.output_base > reference.output_base) {
      return 1;
    }
    else if (compared.output_amount > reference.output_amount) {
      return -1;
    }
    else if (compared.output_amount < reference.output_amount) {
      return 1;
    }
    else {
      return 0;
    }
  })

  getSandboxRoom() {
    return this.sandbox.getSandboxRoom()
  }

  setSandboxSize(maxSize:number) {
    this.sandbox.maxSize = maxSize
  }
}
