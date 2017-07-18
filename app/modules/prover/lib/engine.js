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
const powCluster_1 = require("./powCluster");
const os = require('os');
// Super important for Node.js debugging
const debug = process.execArgv.toString().indexOf('--debug') !== -1;
if (debug) {
    //Set an unused port number.
    process.execArgv = [];
}
class PowEngine {
    constructor(conf, logger) {
        this.conf = conf;
        // We use as much cores as available, but not more than CORES_MAXIMUM_USE_IN_PARALLEL
        this.nbWorkers = (conf && conf.nbCores) || Math.min(constants_1.Constants.CORES_MAXIMUM_USE_IN_PARALLEL, require('os').cpus().length);
        this.cluster = new powCluster_1.Master(this.nbWorkers, logger);
        this.id = this.cluster.clusterId;
    }
    forceInit() {
        return this.cluster.initCluster();
    }
    prove(stuff) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.cluster.hasProofPending) {
                yield this.cluster.cancelWork();
            }
            if (os.arch().match(/arm/)) {
                stuff.conf.cpu /= 2; // Don't know exactly why is ARM so much saturated by PoW, so let's divide by 2
            }
            return yield this.cluster.proveByWorkers(stuff);
        });
    }
    cancel() {
        return this.cluster.cancelWork();
    }
    setConf(value) {
        return this.cluster.changeConf(value);
    }
    setOnInfoMessage(callback) {
        return this.cluster.onInfoMessage = callback;
    }
}
exports.PowEngine = PowEngine;
//# sourceMappingURL=engine.js.map