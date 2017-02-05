"use strict";

/**
 * Created by cgeek on 22/08/15.
 */

const co = require('co');
const logger = require('../../logger')('metaDAL');
const AbstractSQLite = require('./AbstractSQLite');
const hashf = require('duniter-common').hashf;
const rawer = require('duniter-common').rawer;
const constants = require('./../../constants');

module.exports = MetaDAL;

function MetaDAL(driver) {

  AbstractSQLite.call(this, driver);

  const that = this;

  this.table = 'meta';
  this.fields = [
    'id',
    'version'
  ];
  this.arrays = [];
  this.booleans = [];
  this.pkFields = ['version'];
  this.translated = {};

  const migrations = {

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
    3: () => co(function*() {
    }),

    // Migrates wrong unitbases
    4: () => co(function*() {
    }),

    // Migrates wrong monetary masses
    5: () => co(function*() {
    }),

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
    12: () => co(function *() {
      let blockDAL = new (require('./BlockDAL'))(driver);
      yield blockDAL.exec('ALTER TABLE block ADD COLUMN len INTEGER NULL;');
      yield blockDAL.exec('ALTER TABLE txs ADD COLUMN len INTEGER NULL;');
    }),
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

    15: () => co(function *() {
      let idtyDAL = new (require('./IdentityDAL'))(driver);
      yield idtyDAL.exec('ALTER TABLE idty ADD COLUMN revoked_on INTEGER NULL');
    }),

    16: () => co(function *() {
    }),

    17: () => co(function *() {
      let blockDAL = new (require('./BlockDAL'))(driver);
      let sindexDAL = new (require('./index/SIndexDAL'))(driver);
      const blocks = yield blockDAL.query('SELECT * FROM block WHERE NOT fork');
      const Block = require('../../../lib/entity/block');
      const Identity = require('../../../lib/entity/identity');
      const amountsPerKey = {};
      const members = [];
      for (const block of blocks) {
        const b = new Block(block);
        const amountsInForBlockPerKey = {};
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
          tx.hash = hashf(rawer.getTransaction(b.transactions[i])).toUpperCase();
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
      const sourcesMovements = [];
      for (const key of keysToSee) {
        const allCreates = {};
        const allUpdates = {};
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
        yield Object.values(allCreates).map((src) => co(function*() {
          const exist = yield sindexDAL.getSource(src.identifier, src.pos);
          if (!exist || exist.consumed) {
            amountMissing += src.amount;
            const block = src.block;
            sourcesMovements.push({
              op: constants.IDX_CREATE,
              tx: src.tx,
              identifier: src.identifier,
              pos: src.pos,
              written_on: [block.number, block.hash].join('-'),
              written_time: block.medianTime,
              locktime: src.locktime,
              amount: src.amount,
              base: src.base,
              conditions: src.conditions,
              consumed: false
            });
          }
        }));
        let amountNotDestroyed = 0;
        yield Object.values(allUpdates).map((src) => co(function*() {
          const exist = yield sindexDAL.getSource(src.identifier, src.pos);
          if (exist && !exist.consumed) {
            amountNotDestroyed += src.amount;
          }
        }));
      }
      yield sindexDAL.insertBatch(sourcesMovements);
    })
  };

  this.init = () => co(function *() {
    return that.exec('BEGIN;' +
      'CREATE TABLE IF NOT EXISTS ' + that.table + ' (' +
      'id INTEGER NOT NULL,' +
      'version INTEGER NOT NULL,' +
      'PRIMARY KEY (id)' +
      ');' +
      'COMMIT;', []);
  });

  function executeMigration(migration) {
    return co(function *() {
      try {
        if (typeof migration == "string") {

          // Simple SQL script to pass
          yield that.exec(migration);

        } else if (typeof migration == "function") {

          // JS function to execute
          yield migration();

        }
      } catch (e) {
        logger.warn('An error occured during DB migration, continue.', e);
      }
    });
  }

  this.upgradeDatabase = () => co(function *() {
    let version = yield that.getVersion();
    while(migrations[version]) {
      yield executeMigration(migrations[version]);
      // Automated increment
      yield that.exec('UPDATE meta SET version = version + 1');
      version++;
    }
  });

  this.upgradeDatabaseVersions = (versions) => co(function *() {
    for (const version of versions) {
      logger.debug("Upgrading from to v%s...", version, version + 1);
      yield executeMigration(migrations[version]);
    }
  });

  this.getRow = () => that.sqlFindOne({ id: 1 });

  this.getVersion = () => co(function *() {
    try {
      const row = yield that.getRow();
      return row.version;
    } catch(e) {
      yield that.exec('INSERT INTO ' + that.table + ' VALUES (1,0);');
      return 0;
    }
  });

  this.cleanData = null; // Never clean data of this table
}
