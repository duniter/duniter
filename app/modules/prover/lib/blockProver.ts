import {ProverConstants} from "./constants"
import {Server} from "../../../../server"
import {PowEngine} from "./engine"
import {DBBlock} from "../../../lib/db/DBBlock"
import {CommonConstants} from "../../../lib/common-libs/constants"
import {BlockDTO} from "../../../lib/dto/BlockDTO"
import {ConfDTO, Keypair} from "../../../lib/dto/ConfDTO"

const os        = require('os')
const querablep = require('querablep')

const POW_FOUND = true;
const POW_NOT_FOUND_YET = false;

export class WorkerFarm {

  private theEngine:PowEngine
  private onAlmostPoW:any = null
  private powPromise:any = null
  private stopPromise:any = null
  private checkPoWandNotify:any = null

  constructor(private server:Server, private logger:any) {

    this.theEngine = new PowEngine(server.conf, server.logger)

    // An utility method to filter the pow notifications
    this.checkPoWandNotify = (hash:string, block:DBBlock, found:boolean) => {
      const matches = hash.match(/^(0{2,})[^0]/);
      if (matches && this.onAlmostPoW) {
        this.onAlmostPoW(hash, matches, block, found);
      }
    }

    // Keep track of PoW advancement
    this.theEngine.setOnInfoMessage((message:any) => {
      if (message.error) {
        this.logger.error('Error in engine#%s:', this.theEngine.id, message.error)
      } else if (message.pow) {
        // A message about the PoW
        const msg = message.pow
        this.checkPoWandNotify(msg.pow, msg.block, POW_NOT_FOUND_YET)
      }
    })
  }

  get nbWorkers() {
    return this.theEngine.getNbWorkers()
  }

  changeCPU(cpu:any) {
    return this.theEngine.setConf({ cpu })
  }

  changePoWPrefix(prefix:any) {
    return this.theEngine.setConf({ prefix })
  }

  isComputing() {
    return this.powPromise !== null && !this.powPromise.isResolved()
  }

  isStopping() {
    return this.stopPromise !== null && !this.stopPromise.isResolved()
  }

  /**
   * Eventually stops the engine PoW if one was computing
   */
  stopPoW() {
    this.stopPromise = querablep(this.theEngine.cancel())
    return this.stopPromise;
  }

  shutDownEngine() {
    return this.theEngine.shutDown()
  }

  /**
   * Starts a new computation of PoW
   * @param stuff The necessary data for computing the PoW
   */
  async askNewProof(stuff:any) {
    // Starts the PoW
    this.powPromise = querablep(this.theEngine.prove(stuff))
    const res = await this.powPromise
    if (res) {
      this.checkPoWandNotify(res.pow.pow, res.pow.block, POW_FOUND);
    }
    return res && res.pow
  }

  setOnAlmostPoW(onPoW:any) {
    this.onAlmostPoW = onPoW
  }
}

export class BlockProver {

  logger:any
  waitResolve:any
  workerFarmPromise:any

  constructor(private server:Server) {
    this.logger = server.logger

    const debug = process.execArgv.toString().indexOf('--debug') !== -1;
    if(debug) {
      //Set an unused port number.
      process.execArgv = [];
    }
  }

  get conf():ConfDTO {
    return this.server.conf
  }

  get pair(): Keypair|null {
    return this.conf.pair
  }

  getWorker(): Promise<WorkerFarm> {
    if (!this.workerFarmPromise) {
      this.workerFarmPromise = (async () => {
        return new WorkerFarm(this.server, this.logger)
      })()
    }
    return this.workerFarmPromise
  }

  async cancel() {
    // If no farm was instanciated, there is nothing to do yet
    if (this.workerFarmPromise) {
      let farm = await this.getWorker();
      if (farm.isComputing() && !farm.isStopping()) {
        await farm.stopPoW()
      } else {
        // We force the stop anyway, just to be sure
        await farm.stopPoW()
      }
      if (this.waitResolve) {
        this.waitResolve();
        this.waitResolve = null;
      }
    }
  }

  prove(block:any, difficulty:any, forcedTime:any = null) {

    if (this.waitResolve) {
      this.waitResolve();
      this.waitResolve = null;
    }

    const remainder = difficulty % 16;
    const nbZeros = (difficulty - remainder) / 16;
    const highMark = CommonConstants.PROOF_OF_WORK.UPPER_BOUND[remainder];

    return (async () => {

      let powFarm = await this.getWorker();

      if (block.number == 0) {
        // On initial block, difficulty is the one given manually
        block.powMin = difficulty;
      }

      // Start
      powFarm.setOnAlmostPoW((pow:any, matches:any, aBlock:any, found:boolean) => {
        this.powEvent(found, pow);
        if (matches && matches[1].length >= ProverConstants.MINIMAL_ZEROS_TO_SHOW_IN_LOGS) {
          this.logger.info('Matched %s zeros %s with Nonce = %s for block#%s by %s', matches[1].length, pow, aBlock.nonce, aBlock.number, aBlock.issuer.slice(0,6));
        }
      });

      block.nonce = 0;
      this.logger.info('Generating proof-of-work with %s leading zeros followed by [0-' + highMark + ']... (CPU usage set to %s%) for block#%s', nbZeros, (this.conf.cpu * 100).toFixed(0), block.number, block.issuer.slice(0,6));
      const start = Date.now();
      let result = await powFarm.askNewProof({
        newPoW: {
          conf: {
            cpu: this.conf.cpu,
            prefix: this.conf.prefix,
            avgGenTime: this.conf.avgGenTime,
            medianTimeBlocks: this.conf.medianTimeBlocks
          },
          block: block,
          zeros: nbZeros,
          highMark: highMark,
          forcedTime: forcedTime,
          pair: this.pair
        }
      });
      if (!result) {
        this.logger.info('GIVEN proof-of-work for block#%s with %s leading zeros followed by [0-' + highMark + ']! stop PoW for %s', block.number, nbZeros, this.pair && this.pair.pub.slice(0,6));
        throw 'Proof-of-work computation canceled because block received';
      } else {
        const proof = result.block;
        const testsCount = result.testsCount * powFarm.nbWorkers
        const duration = (Date.now() - start);
        const testsPerSecond = testsCount / (duration / 1000)
        this.logger.info('Done: #%s, %s in %ss (~%s tests, ~%s tests/s, using %s cores, CPU %s%)', block.number, proof.hash, (duration / 1000).toFixed(2), testsCount, testsPerSecond.toFixed(2), powFarm.nbWorkers, Math.floor(100*this.conf.cpu))
        this.logger.info('FOUND proof-of-work with %s leading zeros followed by [0-' + highMark + ']!', nbZeros);
        return BlockDTO.fromJSONObject(proof)
      }
    })()
  };

  async changeCPU(cpu:number) {
    this.conf.cpu = cpu;
    const farm = await this.getWorker()
    return farm.changeCPU(cpu)
  }

  async changePoWPrefix(prefix:any) {
    this.conf.prefix = prefix
    const farm = await this.getWorker()
    return farm.changePoWPrefix(prefix)
  }

  private powEvent(found:boolean, hash:string) {
    this.server && this.server.push({ pow: { found, hash } });
  }
}
