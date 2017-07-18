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
const async = require('async');
const constants = require('../lib/constants');
module.exports = {
    duniter: {
        service: {
            neutral: (server, conf) => new PeerSignalEmitter(server, conf)
        }
    }
};
/**
 * Service which triggers the server's peering generation (actualization of the Peer document).
 * @constructor
 */
class PeerSignalEmitter {
    constructor(server, conf) {
        this.server = server;
        this.conf = conf;
        this.INTERVAL = null;
        this.peerFifo = async.queue(function (task, callback) {
            task(callback);
        }, 1);
    }
    startService() {
        return __awaiter(this, void 0, void 0, function* () {
            // The interval duration
            const SIGNAL_INTERVAL = 1000 * this.conf.avgGenTime * constants.NETWORK.STATUS_INTERVAL.UPDATE;
            // We eventually clean an existing interval
            if (this.INTERVAL)
                clearInterval(this.INTERVAL);
            // Create the new regular algorithm
            this.INTERVAL = setInterval(() => {
                this.peerFifo.push((done) => __awaiter(this, void 0, void 0, function* () {
                    try {
                        yield this.server.PeeringService.generateSelfPeer(this.conf, SIGNAL_INTERVAL);
                        done();
                    }
                    catch (e) {
                        done(e);
                    }
                }));
            }, SIGNAL_INTERVAL);
            // Launches it a first time, immediately
            yield this.server.PeeringService.generateSelfPeer(this.conf, SIGNAL_INTERVAL);
        });
    }
    stopService() {
        // Stop the interval
        if (this.INTERVAL) {
            clearInterval(this.INTERVAL);
        }
        // Empty the fifo
        this.peerFifo.kill();
    }
}
//# sourceMappingURL=peersignal.js.map