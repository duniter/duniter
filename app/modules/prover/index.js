"use strict";

const co = require('co');
const async = require('async');
const contacter = require('duniter-crawler').duniter.methods.contacter;
const common = require('duniter-common');
const constants = require('./lib/constants');
const Prover = require('./lib/prover');
const blockGenerator = require('./lib/blockGenerator');
const blockProver = require('./lib/blockProver');

const Peer = common.document.Peer

module.exports = {

  duniter: {

    /*********** Permanent prover **************/
    config: {
      onLoading: (conf) => co(function*() {
        if (conf.cpu === null || conf.cpu === undefined) {
          conf.cpu = constants.DEFAULT_CPU;
        }
        conf.powSecurityRetryDelay = constants.POW_SECURITY_RETRY_DELAY;
        conf.powMaxHandicap = constants.POW_MAXIMUM_ACCEPTABLE_HANDICAP;
      }),
      beforeSave: (conf) => co(function*() {
        delete conf.powSecurityRetryDelay;
        delete conf.powMaxHandicap;
      })
    },

    service: {
      output: (server, conf, logger) => {
        const generator = blockGenerator(server);
        server.generatorGetJoinData     = generator.getSinglePreJoinData.bind(generator)
        server.generatorComputeNewCerts = generator.computeNewCerts.bind(generator)
        server.generatorNewCertsToLinks = generator.newCertsToLinks.bind(generator)
        return new Prover(server, conf, logger)
      }
    },

    methods: {
      hookServer: (server) => {
        const generator = blockGenerator(server);
        server.generatorGetJoinData     = generator.getSinglePreJoinData.bind(generator)
        server.generatorComputeNewCerts = generator.computeNewCerts.bind(generator)
        server.generatorNewCertsToLinks = generator.newCertsToLinks.bind(generator)
      },
      blockProver: blockProver,
      prover: (server, conf, logger) => new Prover(server, conf, logger),
      blockGenerator: (server, prover) => blockGenerator(server, prover),
      generateTheNextBlock: (server, manualValues) => co(function*() {
        const prover = blockProver(server);
        const generator = blockGenerator(server, prover);
        return generator.nextBlock(manualValues);
      }),
      generateAndProveTheNext: (server, block, trial, manualValues) => co(function*() {
        const prover = blockProver(server);
        const generator = blockGenerator(server, prover);
        let res = yield generator.makeNextBlock(block, trial, manualValues);
        return res
      })
    },

    /*********** CLI gen-next + gen-root **************/

    cliOptions: [
      {value: '--show',  desc: 'With gen-next or gen-root commands, displays the generated block.'},
      {value: '--check', desc: 'With gen-next: just check validity of generated block.'},
      {value: '--at <medianTime>', desc: 'With gen-next --show --check: allows to try in a future time.', parser: parseInt }
    ],

    cli: [{
      name: 'gen-next [host] [port] [difficulty]',
      desc: 'Tries to generate the next block of the blockchain.',
      onDatabaseExecute: (server, conf, program, params) => co(function*() {
        const host = params[0];
        const port = params[1];
        const difficulty = params[2];
        const generator = blockGenerator(server, null);
        return generateAndSend(program, host, port, difficulty, server, () => generator.nextBlock);
      })
    }, {
      name: 'gen-root [host] [port] [difficulty]',
      desc: 'Tries to generate the next block of the blockchain.',
      preventIfRunning: true,
      onDatabaseExecute: (server, conf, program, params) => co(function*() {
        const host = params[0];
        const port = params[1];
        const difficulty = params[2];
        const generator = blockGenerator(server, null);
        let toDelete, catched = true;
        do {
          try {
            yield generateAndSend(program, host, port, difficulty, server, () => generator.nextBlock);
            catched = false;
          } catch (e) {
            toDelete = yield server.dal.idtyDAL.query('SELECT * FROM idty i WHERE 5 > (SELECT count(*) from cert c where c.`to` = i.pubkey)');
            console.log('Deleting', toDelete.map(i => i.pubkey));
            yield server.dal.idtyDAL.exec('DELETE FROM idty WHERE pubkey IN ('  + toDelete.map(i => "'" + i.pubkey + "'").join(',') + ')');
            yield server.dal.idtyDAL.exec('DELETE FROM cert WHERE `to` IN ('  + toDelete.map(i => "'" + i.pubkey + "'").join(',') + ')');
            yield server.dal.idtyDAL.exec('DELETE FROM cert WHERE `from` IN ('  + toDelete.map(i => "'" + i.pubkey + "'").join(',') + ')');
          }
        } while (catched && toDelete.length);
        console.log('Done');
      })
    }, {
      name: 'gen-root-choose [host] [port] [difficulty]',
      desc: 'Tries to generate root block, with choice of root members.',
      preventIfRunning: true,
      onDatabaseExecute: (server, conf, program, params, startServices, stopServices) => co(function*() {
        const host = params[0];
        const port = params[1];
        const difficulty = params[2];
        if (!host) {
          throw 'Host is required.';
        }
        if (!port) {
          throw 'Port is required.';
        }
        if (!difficulty) {
          throw 'Difficulty is required.';
        }
        const generator = blockGenerator(server, null);
        return generateAndSend(program, host, port, difficulty, server, () => generator.manualRoot);
      })
    }]
  }
}

function generateAndSend(program, host, port, difficulty, server, getGenerationMethod) {
  const logger = server.logger;
  return new Promise((resolve, reject) => {
    async.waterfall([
      function (next) {
        const method = getGenerationMethod(server);
        co(function*(){
          const simulationValues = {}
          if (program.show && program.check) {
            if (program.at && !isNaN(program.at)) {
              simulationValues.medianTime = program.at
            }
          }
          const block = yield method(null, simulationValues);
          next(null, block);
        });
      },
      function (block, next) {
        if (program.check) {
          block.time = block.medianTime;
          program.show && console.log(block.getRawSigned());
          co(function*(){
            try {
              const parsed = common.parsers.parseBlock.syncWrite(block.getRawSigned());
              yield server.BlockchainService.checkBlock(parsed, false);
              logger.info('Acceptable block');
              next();
            } catch (e) {
              next(e);
            }
          });
        }
        else {
          logger.debug('Block to be sent: %s', block.getRawInnerPart());
          async.waterfall([
            function (subNext) {
              proveAndSend(program, server, block, server.conf.pair.pub, parseInt(difficulty), host, parseInt(port), subNext);
            }
          ], next);
        }
      }
    ], (err, data) => {
      err && reject(err);
      !err && resolve(data);
    });
  });
}

function proveAndSend(program, server, block, issuer, difficulty, host, port, done) {
  const logger = server.logger;
  async.waterfall([
    function (next) {
      block.issuer = issuer;
      program.show && console.log(block.getRawSigned());
      co(function*(){
        try {
          const prover = blockProver(server);
          const proven = yield prover.prove(block, difficulty);
          const peer = Peer.fromJSON({
            endpoints: [['BASIC_MERKLED_API', host, port].join(' ')]
          });
          program.show && console.log(proven.getRawSigned());
          logger.info('Posted block ' + proven.getRawSigned());
          const p = Peer.fromJSON(peer);
          const contact = contacter(p.getHostPreferDNS(), p.getPort());
          yield contact.postBlock(proven.getRawSigned());
        } catch(e) {
          next(e);
        }
      });
    }
  ], done);
}
