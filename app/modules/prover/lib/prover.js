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
const permanentProver_1 = require("./permanentProver");
const stream = require("stream");
class Prover extends stream.Transform {
    constructor(server) {
        super({ objectMode: true });
        this.permaProver = this.permaProver = new permanentProver_1.PermanentProver(server);
    }
    _write(obj, enc, done) {
        // Never close the stream
        if (obj && obj.membersCount) {
            this.permaProver.blockchainChanged(obj);
        }
        else if (obj.nodeIndexInPeers !== undefined) {
            this.permaProver.prover.changePoWPrefix((obj.nodeIndexInPeers + 1) * 10); // We multiply by 10 to give room to computers with < 100 cores
        }
        else if (obj.cpu !== undefined) {
            this.permaProver.prover.changeCPU(obj.cpu); // We multiply by 10 to give room to computers with < 100 cores
        }
        else if (obj.pulling !== undefined) {
            if (obj.pulling === 'processing') {
                this.permaProver.pullingDetected();
            }
            else if (obj.pulling === 'finished') {
                this.permaProver.pullingFinished();
            }
        }
        done && done();
    }
    ;
    startService() {
        return __awaiter(this, void 0, void 0, function* () {
            this.permaProver.allowedToStart();
        });
    }
    stopService() {
        return __awaiter(this, void 0, void 0, function* () {
            this.permaProver.stopEveryting();
        });
    }
}
exports.Prover = Prover;
//# sourceMappingURL=prover.js.map