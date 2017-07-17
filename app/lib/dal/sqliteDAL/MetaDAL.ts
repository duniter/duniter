import {AbstractSQLite} from "./AbstractSQLite";
import {SQLiteDriver} from "../drivers/SQLiteDriver";
import {ConfDTO} from "../../dto/ConfDTO";
import {SindexEntry} from "../../indexer";
import {hashf} from "../../common";
import {TransactionDTO} from "../../dto/TransactionDTO";
import {BlockDAL} from "./BlockDAL";
import {IdentityDAL} from "./IdentityDAL";
import {SIndexDAL} from "./index/SIndexDAL";
import {WalletDAL} from "./WalletDAL";
import {MIndexDAL} from "./index/MIndexDAL";

const _ = require('underscore')
const logger = require('../../logger').NewLogger('metaDAL');
const common = require('duniter-common');
const rawer = require('duniter-common').rawer;
const constants = require('./../../constants');

export interface DBMeta {
  id: number,
  version: number
}

export class MetaDAL extends AbstractSQLite<DBMeta> {

  driverCopy:SQLiteDriver

  constructor(driver:SQLiteDriver) {
    super(
      driver,
      'meta',
      // PK fields
      ['version'],
      // Fields
      [
        'id',
        'version'
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
    this.driverCopy = driver
  }

  private migrations:any = {

    // Test
    0: 'BEGIN; COMMIT;',

    // Test
    1: 'BEGIN;' +
    'CREATE VIEW IF NOT EXISTS identities_pending AS SELECT * FROM idty WHERE NOT written;' +
    'CREATE VIEW IF NOT EXISTS certifications_pending AS SELECT * FROM cert WHERE NOT written;' +
    'CREATE VIEW IF NOT EXISTS transactions_pending AS SELECT * FROM txs WHERE NOT written;' +
    'CREATE VIEW IF NOT EXISTS transactions_desc AS SELECT * FROM txs ORDER BY time DESC;' +
    'CREATE VIEW IF NOT EXISTS forks AS SELECT number, hash, issuer, monetaryMass, dividend, UDTime, membersCount, medianTime, time, * FROM block WHERE fork ORDER BY number DESC;' +
    'CREATE VIEW IF NOT EXISTS blockchain AS SELECT number, hash, issuer, monetaryMass, dividend, UDTime, membersCount, medianTime, time, * FROM block WHERE NOT fork ORDER BY number DESC;' +
    'CREATE VIEW IF NOT EXISTS network AS select i.uid, (last_try - first_down) / 1000 as down_delay_in_sec, p.* from peer p LEFT JOIN idty i on i.pubkey = p.pubkey ORDER by down_delay_in_sec;' +
    'COMMIT;',

    // New `receveid` column
    2: 'BEGIN; ALTER TABLE txs ADD COLUMN received INTEGER NULL; COMMIT;',

    // Update wrong recipients field (was not filled in)
    3: async () => {},

    // Migrates wrong unitbases
    4: async () => {},

    // Migrates wrong monetary masses
    5: async () => {},

    6: 'BEGIN; ALTER TABLE idty ADD COLUMN expired INTEGER NULL; COMMIT;',
    7: 'BEGIN; ALTER TABLE cert ADD COLUMN expired INTEGER NULL; COMMIT;',
    8: 'BEGIN; ALTER TABLE membership ADD COLUMN expired INTEGER NULL; COMMIT;',
    9: 'BEGIN;' +
    'ALTER TABLE txs ADD COLUMN output_base INTEGER NULL;' +
    'ALTER TABLE txs ADD COLUMN output_amount INTEGER NULL;' +
    'COMMIT;',
    10: 'BEGIN; ALTER TABLE txs ADD COLUMN blockstamp VARCHAR(200) NULL; COMMIT;',
    11: 'BEGIN;' +
    'ALTER TABLE block ADD COLUMN issuersFrame INTEGER NULL;' +
    'ALTER TABLE block ADD COLUMN issuersFrameVar INTEGER NULL;' +
    'ALTER TABLE block ADD COLUMN issuersCount INTEGER NULL;' +
    'COMMIT;',
    12: async () => {
      let blockDAL = new BlockDAL(this.driverCopy)
      await blockDAL.exec('ALTER TABLE block ADD COLUMN len INTEGER NULL;');
      await blockDAL.exec('ALTER TABLE txs ADD COLUMN len INTEGER NULL;');
    },
    13: 'BEGIN; ALTER TABLE txs ADD COLUMN blockstampTime INTEGER NULL; COMMIT;',
    14: 'BEGIN; ' +
      
    'CREATE VIEW IF NOT EXISTS sandbox_txs AS SELECT * FROM txs WHERE NOT written AND NOT removed ORDER BY output_base DESC, output_amount DESC;' +
      
    'CREATE VIEW IF NOT EXISTS sandbox_idty AS SELECT ' +
      'I.*, ' +
      'I.hash, ' +
      '(SELECT COUNT(*) FROM cert C where C.target = I.hash) AS certsCount, ' +
      'CAST(SUBSTR(buid, 0, INSTR(buid, "-")) as number) AS ref_block ' +
      'FROM idty as I ' +
      'WHERE NOT I.member ' +
      'AND I.expired IS NULL ' +
      'ORDER BY certsCount DESC, ref_block DESC;' +
      
    'CREATE VIEW IF NOT EXISTS sandbox_memberships AS SELECT ' +
      '* ' +
      'FROM membership ' +
      'WHERE expired IS NULL ' +
      'AND written_number IS NULL ' +
      'ORDER BY blockNumber DESC;' +
      
    'CREATE VIEW IF NOT EXISTS sandbox_certs AS SELECT ' +
      '* ' +
      'FROM cert ' +
      'WHERE expired IS NULL ' +
      'AND written_block IS NULL ' +
      'ORDER BY block_number DESC;' +
    'COMMIT;',

    15: async () => {
      let idtyDAL = new IdentityDAL(this.driverCopy)
      await idtyDAL.exec('ALTER TABLE idty ADD COLUMN revoked_on INTEGER NULL');
    },

    16: async () => {},

    17: async () => {
      let blockDAL = new BlockDAL(this.driverCopy)
      let sindexDAL = new SIndexDAL(this.driverCopy)
      const blocks = await blockDAL.query('SELECT * FROM block WHERE NOT fork');
      const Block = require('../../../lib/entity/block');
      const Identity = require('../../../lib/entity/identity');
      const amountsPerKey:any = {};
      const members = [];
      for (const block of blocks) {
        const b = new Block(block);
        const amountsInForBlockPerKey:any = {};
        for (const idty of b.identities) {
          members.push(Identity.statics.fromInline(idty).pubkey);
        }
        if (b.dividend) {
          for (const member of members) {
            amountsInForBlockPerKey[member] = amountsInForBlockPerKey[member] || { amounts: [], sources: [] };
            amountsInForBlockPerKey[member].amounts.push({ amount: b.dividend * Math.pow(10, b.unitbase), comment: 'Dividend' });
            amountsInForBlockPerKey[member].sources.push({ type: 'D', amount: b.dividend, base: b.unitbase, identifier: member, pos: b.number, block: b, tx: null });
          }
        }
        const txs = b.getTransactions();
        for (let i = 0; i < txs.length; i++) {
          const tx = txs[i];
          tx.hash = hashf(rawer.getTransaction(b.transactions[i]))
          for (const input of tx.inputs) {
            input.tx = tx.hash;
            input.block = b;
            amountsInForBlockPerKey[tx.issuers[0]] = amountsInForBlockPerKey[tx.issuers[0]] || { amounts: [], sources: [] };
            amountsInForBlockPerKey[tx.issuers[0]].amounts.push({ amount: -input.amount * Math.pow(10, input.base), comment: tx.comment || '######' });
            amountsInForBlockPerKey[tx.issuers[0]].sources.push(input);
          }
          for (let j = 0; j < tx.outputs.length; j++) {
            const output = tx.outputs[j];
            const conditions = output.conditions.match(/^SIG\((.+)\)$/);
            if (conditions) {
              output.tx = tx.hash;
              output.identifier = tx.hash;
              output.pos = j;
              output.block = b;
              amountsInForBlockPerKey[conditions[1]] = amountsInForBlockPerKey[conditions[1]] || { amounts: [], sources: [] };
              amountsInForBlockPerKey[conditions[1]].amounts.push({ amount: output.amount * Math.pow(10, output.base), comment: tx.comment || '######' });
              amountsInForBlockPerKey[conditions[1]].sources.push(output);
            }
          }
        }
        for (const key of Object.keys(amountsInForBlockPerKey)) {
          amountsPerKey[key] = amountsPerKey[key] || [];
          amountsPerKey[key].push(amountsInForBlockPerKey[key]);
        }
      }
      const keysToSee = Object.keys(amountsPerKey);
      const sourcesMovements: SindexEntry[] = [];
      for (const key of keysToSee) {
        const allCreates: any = {};
        const allUpdates: any = {};
        const amounts = amountsPerKey[key];
        let balance = 0;
        for (let j = 0; j < amounts.length; j++) {
          const amountsInBlock = amounts[j].amounts;
          for (let i = 0; i < amountsInBlock.length; i++) {
            const a = amountsInBlock[i].amount;
            const id = [amounts[j].sources[i].identifier, amounts[j].sources[i].pos].join('-');
            if (a < 0) {
              allUpdates[id] = amounts[j].sources[i];
              delete allCreates[id];
            } else {
              allCreates[id] = amounts[j].sources[i];
            }
            balance += a;
          }
          if (balance > 0 && balance < 100) {
            const sourcesToDelete = [];
            for (const k of Object.keys(amountsPerKey)) {
              for (const amPerBlock of Object.keys(amountsPerKey[k])) {
                for (const src of amountsPerKey[k][amPerBlock].sources) {
                  const id = [src.identifier, src.pos].join('-');
                  if (src.conditions == 'SIG(' + key + ')' && allCreates[id]) {
                    sourcesToDelete.push(src);
                  }
                }
              }
            }
            const amountsToDelete = sourcesToDelete.map((src) => {
              return {
                amount: -src.amount * Math.pow(10, src.base),
                comment: '--DESTRUCTION--'
              };
            });
            amounts.splice(j + 1, 0, { amounts: amountsToDelete, sources: sourcesToDelete });
          }
        }
        let amountMissing = 0;
        await Promise.all(_.values(allCreates).map(async (src:any) => {
          const exist = await sindexDAL.getSource(src.identifier, src.pos);
          if (!exist || exist.consumed) {
            amountMissing += src.amount;
            const block = src.block;
            sourcesMovements.push({
              index: common.constants.I_INDEX,
              op: common.constants.IDX_CREATE,
              tx: src.tx,
              identifier: src.identifier,
              pos: src.pos,
              unlock: null,
              age: 0,
              txObj: TransactionDTO.mock(),
              created_on: null,
              written_on: [block.number, block.hash].join('-'),
              writtenOn: block.number,
              written_time: block.medianTime,
              locktime: src.locktime,
              amount: src.amount,
              base: src.base,
              conditions: src.conditions,
              consumed: false
            });
          }
        }))
        let amountNotDestroyed = 0;
        await _.values(allUpdates).map(async (src:any) => {
          const exist = await sindexDAL.getSource(src.identifier, src.pos);
          if (exist && !exist.consumed) {
            amountNotDestroyed += src.amount;
          }
        })
      }
      await sindexDAL.insertBatch(sourcesMovements);
    },

    18: 'BEGIN;' +
      // Add a `massReeval` column
    'ALTER TABLE b_index ADD COLUMN massReeval VARCHAR(100) NOT NULL DEFAULT \'0\';' +
    'COMMIT;',

    19: 'BEGIN;' +
      // Add a `removed` column
    'ALTER TABLE idty ADD COLUMN removed BOOLEAN NULL DEFAULT 0;' +
    'COMMIT;',

    /**
     * Feeds the table of wallets with balances
     */
    20: async () => {
      let walletDAL = new WalletDAL(this.driverCopy)
      let sindexDAL = new SIndexDAL(this.driverCopy)
      const conditions = await sindexDAL.query('SELECT DISTINCT(conditions) FROM s_index')
      for (const row of conditions) {
        const wallet = {
          conditions: row.conditions,
          balance: 0
        }
        const amountsRemaining = await sindexDAL.getAvailableForConditions(row.conditions)
        wallet.balance = amountsRemaining.reduce((sum:number, src:SindexEntry) => sum + src.amount * Math.pow(10, src.base), 0)
        await walletDAL.saveWallet(wallet)
      }
    },

    /**
     * Feeds the m_index.chainable_on
     */
    21: async (conf:ConfDTO) => {
      let blockDAL = new BlockDAL(this.driverCopy)
      let mindexDAL = new MIndexDAL(this.driverCopy)
      await mindexDAL.exec('ALTER TABLE m_index ADD COLUMN chainable_on INTEGER NULL;')
      const memberships = await mindexDAL.query('SELECT * FROM m_index WHERE op = ?', [common.constants.IDX_CREATE])
      for (const ms of memberships) {
        const reference = await blockDAL.getBlock(parseInt(ms.written_on.split('-')[0]))
        const updateQuery = 'UPDATE m_index SET chainable_on = ' + (reference.medianTime + conf.msPeriod) + ' WHERE pub = \'' + ms.pub + '\' AND op = \'CREATE\''
        await mindexDAL.exec(updateQuery)
      }
    },

    // Replay the wallet table feeding, because of a potential bug
    22: () => {
      return this.migrations[20]()
    },

    23: 'BEGIN;' +
    // Add a `writtenOn` column for MISC Index
    'ALTER TABLE m_index ADD COLUMN writtenOn INTEGER NOT NULL DEFAULT 0;' +
    'ALTER TABLE i_index ADD COLUMN writtenOn INTEGER NOT NULL DEFAULT 0;' +
    'ALTER TABLE s_index ADD COLUMN writtenOn INTEGER NOT NULL DEFAULT 0;' +
    'ALTER TABLE c_index ADD COLUMN writtenOn INTEGER NOT NULL DEFAULT 0;' +
    'CREATE INDEX IF NOT EXISTS idx_mindex_writtenOn ON m_index (writtenOn);' +
    'CREATE INDEX IF NOT EXISTS idx_iindex_writtenOn ON i_index (writtenOn);' +
    'CREATE INDEX IF NOT EXISTS idx_sindex_writtenOn ON s_index (writtenOn);' +
    'CREATE INDEX IF NOT EXISTS idx_cindex_writtenOn ON c_index (writtenOn);' +
    'UPDATE m_index SET writtenOn = CAST(written_on as integer);' +
    'UPDATE i_index SET writtenOn = CAST(written_on as integer);' +
    'UPDATE s_index SET writtenOn = CAST(written_on as integer);' +
    'UPDATE c_index SET writtenOn = CAST(written_on as integer);' +
    'COMMIT;'
  };

  async init() {
    await this.exec('BEGIN;' +
      'CREATE TABLE IF NOT EXISTS ' + this.table + ' (' +
      'id INTEGER NOT NULL,' +
      'version INTEGER NOT NULL,' +
      'PRIMARY KEY (id)' +
      ');' +
      'COMMIT;')
  }

  private async executeMigration(migration: any[], conf:ConfDTO) {
    try {
      if (typeof migration == "string") {

        // Simple SQL script to pass
        await this.exec(migration);

      } else if (typeof migration == "function") {

        // JS function to execute
        await migration(conf);

      }
    } catch (e) {
      logger.warn('An error occured during DB migration, continue.', e);
    }
  }

  async upgradeDatabase(conf:ConfDTO) {
    let version = await this.getVersion();
    while(this.migrations[version]) {
      await this.executeMigration(this.migrations[version], conf);
      // Automated increment
      await this.exec('UPDATE meta SET version = version + 1');
      version++;
    }
  }

  getRow() {
    return this.sqlFindOne({ id: 1 })
  }

  async getVersion() {
    try {
      const row = await this.getRow()
      return row.version;
    } catch(e) {
      await this.exec('INSERT INTO ' + this.table + ' VALUES (1,0);')
      return 0;
    }
  }

  cleanData() {
    // Never clean data of this table
    return Promise.resolve()
  }
}
