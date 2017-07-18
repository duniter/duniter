"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const constants_1 = require("./constants");
const engine_1 = require("./engine");
const querablep = require('querablep');
const common = require('duniter-common');
const Block = common.document.Block;
const POW_FOUND = true;
const POW_NOT_FOUND_YET = false;
class WorkerFarm {
    constructor(server, logger) {
        this.server = server;
        this.logger = logger;
        this.onAlmostPoW = null;
        this.powPromise = null;
        this.stopPromise = null;
        this.checkPoWandNotify = null;
        this.theEngine = new engine_1.PowEngine(server.conf, server.logger);
        // An utility method to filter the pow notifications
        this.checkPoWandNotify = (hash, block, found) => {
            const matches = hash.match(/^(0{2,})[^0]/);
            if (matches && this.onAlmostPoW) {
                this.onAlmostPoW(hash, matches, block, found);
            }
        };
        // Keep track of PoW advancement
        this.theEngine.setOnInfoMessage((message) => {
            if (message.error) {
                this.logger.error('Error in engine#%s:', this.theEngine.id, message.error);
            }
            else if (message.pow) {
                // A message about the PoW
                const msg = message.pow;
                this.checkPoWandNotify(msg.pow, msg.block, POW_NOT_FOUND_YET);
            }
        });
    }
    changeCPU(cpu) {
        return this.theEngine.setConf({ cpu });
    }
    changePoWPrefix(prefix) {
        return this.theEngine.setConf({ prefix });
    }
    isComputing() {
        return this.powPromise !== null && !this.powPromise.isResolved();
    }
    isStopping() {
        return this.stopPromise !== null && !this.stopPromise.isResolved();
    }
    /**
     * Eventually stops the engine PoW if one was computing
     */
    stopPoW() {
        this.stopPromise = querablep(this.theEngine.cancel());
        return this.stopPromise;
    }
    /**
     * Starts a new computation of PoW
     * @param stuff The necessary data for computing the PoW
     */
    askNewProof(stuff) {
        return __awaiter(this, void 0, void 0, function* () {
            // Starts the PoW
            this.powPromise = querablep(this.theEngine.prove(stuff));
            const res = yield this.powPromise;
            if (res) {
                this.checkPoWandNotify(res.pow.pow, res.pow.block, POW_FOUND);
            }
            return res && res.pow;
        });
    }
    setOnAlmostPoW(onPoW) {
        this.onAlmostPoW = onPoW;
    }
}
exports.WorkerFarm = WorkerFarm;
class BlockProver {
    constructor(server) {
        this.server = server;
        this.conf = server.conf;
        this.pair = this.conf.pair;
        this.logger = server.logger;
        const debug = process.execArgv.toString().indexOf('--debug') !== -1;
        if (debug) {
            //Set an unused port number.
            process.execArgv = [];
        }
    }
    getWorker() {
        if (!this.workerFarmPromise) {
            this.workerFarmPromise = (() => __awaiter(this, void 0, void 0, function* () {
                return new WorkerFarm(this.server, this.logger);
            }))();
        }
        return this.workerFarmPromise;
    }
    cancel() {
        return __awaiter(this, void 0, void 0, function* () {
            // If no farm was instanciated, there is nothing to do yet
            if (this.workerFarmPromise) {
                let farm = yield this.getWorker();
                if (farm.isComputing() && !farm.isStopping()) {
                    yield farm.stopPoW();
                }
                if (this.waitResolve) {
                    this.waitResolve();
                    this.waitResolve = null;
                }
            }
        });
    }
    prove(block, difficulty, forcedTime = null) {
        if (this.waitResolve) {
            this.waitResolve();
            this.waitResolve = null;
        }
        const remainder = difficulty % 16;
        const nbZeros = (difficulty - remainder) / 16;
        const highMark = common.constants.PROOF_OF_WORK.UPPER_BOUND[remainder];
        return (() => __awaiter(this, void 0, void 0, function* () {
            let powFarm = yield this.getWorker();
            if (block.number == 0) {
                // On initial block, difficulty is the one given manually
                block.powMin = difficulty;
            }
            // Start
            powFarm.setOnAlmostPoW((pow, matches, aBlock, found) => {
                this.powEvent(found, pow);
                if (matches && matches[1].length >= constants_1.Constants.MINIMAL_ZEROS_TO_SHOW_IN_LOGS) {
                    this.logger.info('Matched %s zeros %s with Nonce = %s for block#%s by %s', matches[1].length, pow, aBlock.nonce, aBlock.number, aBlock.issuer.slice(0, 6));
                }
            });
            block.nonce = 0;
            this.logger.info('Generating proof-of-work with %s leading zeros followed by [0-' + highMark + ']... (CPU usage set to %s%) for block#%s', nbZeros, (this.conf.cpu * 100).toFixed(0), block.number, block.issuer.slice(0, 6));
            const start = Date.now();
            let result = yield powFarm.askNewProof({
                newPoW: { conf: this.conf, block: block, zeros: nbZeros, highMark: highMark, forcedTime: forcedTime, pair: this.pair }
            });
            if (!result) {
                this.logger.info('GIVEN proof-of-work for block#%s with %s leading zeros followed by [0-' + highMark + ']! stop PoW for %s', block.number, nbZeros, this.pair && this.pair.pub.slice(0, 6));
                throw 'Proof-of-work computation canceled because block received';
            }
            else {
                const proof = result.block;
                const testsCount = result.testsCount;
                const duration = (Date.now() - start);
                const testsPerSecond = (testsCount / (duration / 1000)).toFixed(2);
                this.logger.info('Done: #%s, %s in %ss (%s tests, ~%s tests/s)', block.number, proof.hash, (duration / 1000).toFixed(2), testsCount, testsPerSecond);
                this.logger.info('FOUND proof-of-work with %s leading zeros followed by [0-' + highMark + ']!', nbZeros);
                return Block.fromJSON(proof);
            }
        }))();
    }
    ;
    changeCPU(cpu) {
        return __awaiter(this, void 0, void 0, function* () {
            this.conf.cpu = cpu;
            const farm = yield this.getWorker();
            return farm.changeCPU(cpu);
        });
    }
    changePoWPrefix(prefix) {
        return __awaiter(this, void 0, void 0, function* () {
            const farm = yield this.getWorker();
            return farm.changePoWPrefix(prefix);
        });
    }
    powEvent(found, hash) {
        this.server && this.server.push({ pow: { found, hash } });
    }
}
exports.BlockProver = BlockProver;
//# sourceMappingURL=blockProver.js.map