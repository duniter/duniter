import {ConfDTO} from "../../lib/dto/ConfDTO"
import {BlockGenerator, BlockGeneratorWhichProves} from "./lib/blockGenerator"
import {Constants} from "./lib/constants"
import {BlockProver} from "./lib/blockProver"
import {Prover} from "./lib/prover"
import {Contacter} from "../crawler/lib/contacter"
import {parsers} from "../../lib/common-libs/parsers/index"
import {PeerDTO} from "../../lib/dto/PeerDTO"

const async = require('async');

export const ProverDependency = {

  duniter: {

    /*********** Permanent prover **************/
    config: {
      onLoading: async (conf:ConfDTO) => {
        if (conf.cpu === null || conf.cpu === undefined) {
          conf.cpu = Constants.DEFAULT_CPU;
        }
        conf.powSecurityRetryDelay = Constants.POW_SECURITY_RETRY_DELAY;
        conf.powMaxHandicap = Constants.POW_MAXIMUM_ACCEPTABLE_HANDICAP;
      },
      beforeSave: async (conf:ConfDTO) => {
        delete conf.powSecurityRetryDelay;
        delete conf.powMaxHandicap;
      }
    },

    service: {
      output: (server:any) => {
        const generator = new BlockGenerator(server);
        server.generatorGetJoinData     = generator.getSinglePreJoinData.bind(generator)
        server.generatorComputeNewCerts = generator.computeNewCerts.bind(generator)
        server.generatorNewCertsToLinks = generator.newCertsToLinks.bind(generator)
        return new Prover(server)
      }
    },

    methods: {
      hookServer: (server:any) => {
        const generator = new BlockGenerator(server);
        server.generatorGetJoinData     = generator.getSinglePreJoinData.bind(generator)
        server.generatorComputeNewCerts = generator.computeNewCerts.bind(generator)
        server.generatorNewCertsToLinks = generator.newCertsToLinks.bind(generator)
      },
      prover: (server:any, conf:ConfDTO, logger:any) => new Prover(server),
      blockGenerator: (server:any, prover:any) => new BlockGeneratorWhichProves(server, prover),
      generateTheNextBlock: async (server:any, manualValues:any) => {
        const prover = new BlockProver(server);
        const generator = new BlockGeneratorWhichProves(server, prover);
        return generator.nextBlock(manualValues);
      },
      generateAndProveTheNext: async (server:any, block:any, trial:any, manualValues:any) => {
        const prover = new BlockProver(server);
        const generator = new BlockGeneratorWhichProves(server, prover);
        let res = await generator.makeNextBlock(block, trial, manualValues);
        return res
      }
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
      onDatabaseExecute: async (server:any, conf:ConfDTO, program:any, params:any) => {
        const host = params[0];
        const port = params[1];
        const difficulty = params[2];
        const generator = new BlockGeneratorWhichProves(server, null);
        return generateAndSend(program, host, port, difficulty, server, () => () => generator.nextBlock())
      }
    }, {
      name: 'gen-root [host] [port] [difficulty]',
      desc: 'Tries to generate the next block of the blockchain.',
      preventIfRunning: true,
      onDatabaseExecute: async (server:any, conf:ConfDTO, program:any, params:any) => {
        const host = params[0];
        const port = params[1];
        const difficulty = params[2];
        const generator = new BlockGeneratorWhichProves(server, null);
        let toDelete, catched = true;
        do {
          try {
            await generateAndSend(program, host, port, difficulty, server, () => () => generator.nextBlock())
            catched = false;
          } catch (e) {
            toDelete = await server.dal.idtyDAL.query('SELECT * FROM idty i WHERE 5 > (SELECT count(*) from cert c where c.`to` = i.pubkey)');
            console.log('Deleting', toDelete.map((i:any) => i.pubkey));
            await server.dal.idtyDAL.exec('DELETE FROM idty WHERE pubkey IN ('  + toDelete.map((i:any) => "'" + i.pubkey + "'").join(',') + ')');
            await server.dal.idtyDAL.exec('DELETE FROM cert WHERE `to` IN ('  + toDelete.map((i:any) => "'" + i.pubkey + "'").join(',') + ')');
            await server.dal.idtyDAL.exec('DELETE FROM cert WHERE `from` IN ('  + toDelete.map((i:any) => "'" + i.pubkey + "'").join(',') + ')');
          }
        } while (catched && toDelete.length);
        console.log('Done');
      }
    }, {
      name: 'gen-root-choose [host] [port] [difficulty]',
      desc: 'Tries to generate root block, with choice of root members.',
      preventIfRunning: true,
      onDatabaseExecute: async (server:any, conf:ConfDTO, program:any, params:any) => {
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
        const generator = new BlockGenerator(server);
        return generateAndSend(program, host, port, difficulty, server, () => generator.manualRoot);
      }
    }]
  }
}

function generateAndSend(program:any, host:string, port:string, difficulty:string, server:any, getGenerationMethod:any) {
  const logger = server.logger;
  return new Promise((resolve, reject) => {
    async.waterfall([
      function (next:any) {
        const method = getGenerationMethod(server);
        (async() => {
          const simulationValues:any = {}
          if (program.show && program.check) {
            if (program.at && !isNaN(program.at)) {
              simulationValues.medianTime = program.at
            }
          }
          const block = await method(null, simulationValues);
          next(null, block);
        })()
      },
      function (block:any, next:any) {
        if (program.check) {
          block.time = block.medianTime;
          program.show && console.log(block.getRawSigned());
          (async() => {
            try {
              const parsed = parsers.parseBlock.syncWrite(block.getRawSigned());
              await server.BlockchainService.checkBlock(parsed, false);
              logger.info('Acceptable block');
              next();
            } catch (e) {
              next(e);
            }
          })()
        }
        else {
          logger.debug('Block to be sent: %s', block.getRawInnerPart());
          async.waterfall([
            function (subNext:any) {
              proveAndSend(program, server, block, server.conf.pair.pub, parseInt(difficulty), host, parseInt(port), subNext);
            }
          ], next);
        }
      }
    ], (err:any, data:any) => {
      err && reject(err);
      !err && resolve(data);
    });
  });
}

function proveAndSend(program:any, server:any, block:any, issuer:any, difficulty:any, host:any, port:any, done:any) {
  const logger = server.logger;
  async.waterfall([
    function (next:any) {
      block.issuer = issuer;
      program.show && console.log(block.getRawSigned());
      (async () => {
        try {
          const prover = new BlockProver(server);
          const proven = await prover.prove(block, difficulty);
          const peer = PeerDTO.fromJSONObject({
            endpoints: [['BASIC_MERKLED_API', host, port].join(' ')]
          });
          program.show && console.log(proven.getRawSigned());
          logger.info('Posted block ' + proven.getRawSigned());
          const p = PeerDTO.fromJSONObject(peer);
          const contact = new Contacter(p.getHostPreferDNS(), p.getPort());
          await contact.postBlock(proven.getRawSigned());
        } catch(e) {
          next(e);
        }
      })()
    }
  ], done);
}
