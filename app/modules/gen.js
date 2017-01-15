"use strict";

const co = require('co');
const async = require('async');
const multicaster = require('../lib/streams/multicaster');
const Peer = require('../lib/entity/peer');
const logger = require('../lib/logger')('gen');

module.exports = {

  duniter: {

    cliOptions: [
      {value: '--show', desc: 'With gen-next or gen-root commands, displays the generated block.'},
      {value: '--check', desc: 'With gen-next: just check validity of generated block.'}
    ],

    cli: [{
      name: 'gen-next [host] [port] [difficulty]',
      desc: 'Tries to generate the next block of the blockchain.',
      onPluggedDALExecute: (server, conf, program, params) => co(function*() {
        const host = params[0];
        const port = params[1];
        const difficulty = params[2];
        return generateAndSend(program, host, port, difficulty, server, (server) => server.BlockchainService.generateNext);
      })
    }, {
      name: 'gen-root [host] [port] [difficulty]',
      desc: 'Tries to generate root block, with choice of root members.',
      onPluggedDALExecute: (server, conf, program, params, startServices, stopServices) => co(function*() {
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
        return generateAndSend(program, host, port, difficulty, server, (server) => server.BlockchainService.generateManualRoot);
      })
    }]
  }
}

function generateAndSend(program, host, port, difficulty, server, getGenerationMethod) {
  return new Promise((resolve, reject) => {
    async.waterfall([
      function (next) {
        const method = getGenerationMethod(server);
        co(function*(){
          try {
            const block = yield method();
            next(null, block);
          } catch(e) {
            next(e);
          }
        });
      },
      function (block, next) {
        if (program.check) {
          block.time = block.medianTime;
          program.show && console.log(block.getRawSigned());
          co(function*(){
            try {
              yield server.doCheckBlock(block);
              logger.info('Acceptable block');
              next();
            } catch (e) {
              next(e);
            }
          });
        }
        else {
          logger.debug('Block to be sent: %s', block.quickDescription());
          async.waterfall([
            function (next) {
              // Extract key pair
              co(function*(){
                try {
                  const pair = yield server.conf.keyPair;
                  next(null, pair);
                } catch(e) {
                  next(e);
                }
              });
            },
            function (pair, next) {
              proveAndSend(program, server, block, pair.publicKey, parseInt(difficulty), host, parseInt(port), next);
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
  const BlockchainService = server.BlockchainService;
  async.waterfall([
    function (next) {
      block.issuer = issuer;
      program.show && console.log(block.getRawSigned());
      co(function*(){
        try {
          const proven = yield BlockchainService.prove(block, difficulty);
          next(null, proven);
        } catch(e) {
          next(e);
        }
      });
    },
    function (block, next) {
      const peer = new Peer({
        endpoints: [['BASIC_MERKLED_API', host, port].join(' ')]
      });
      program.show && console.log(block.getRawSigned());
      logger.info('Posted block ' + block.quickDescription());
      co(function*(){
        try {
          yield multicaster(server.conf).sendBlock(peer, block);
          next();
        } catch(e) {
          next(e);
        }
      });
    }
  ], done);
}
