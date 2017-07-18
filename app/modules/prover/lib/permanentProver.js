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
const blockGenerator_1 = require("./blockGenerator");
const blockProver_1 = require("./blockProver");
const constants_1 = require("./constants");
const querablep = require('querablep');
const common = require('duniter-common');
const dos2unix = common.dos2unix;
const parsers = common.parsers;
class PermanentProver {
    constructor(server) {
        this.server = server;
        this.permanenceStarted = false;
        this.blockchainChangedResolver = null;
        this.promiseOfWaitingBetween2BlocksOfOurs = null;
        this.lastComputedBlock = null;
        this.resolveContinuePromise = null;
        this.continuePromise = null;
        this.pullingResolveCallback = null;
        this.timeoutPullingCallback = null;
        this.pullingFinishedPromise = null;
        this.timeoutPulling = null;
        this.logger = server.logger;
        this.conf = server.conf;
        this.prover = new blockProver_1.BlockProver(server);
        this.generator = new blockGenerator_1.BlockGeneratorWhichProves(server, this.prover);
        // Promises triggering the prooving lopp
        this.resolveContinuePromise = null;
        this.continuePromise = new Promise((resolve) => this.resolveContinuePromise = resolve);
        this.pullingResolveCallback = null;
        this.timeoutPullingCallback = null;
        this.pullingFinishedPromise = querablep(Promise.resolve());
        this.loops = 0;
    }
    allowedToStart() {
        if (!this.permanenceStarted) {
            this.permanenceStarted = true;
            this.startPermanence();
        }
        this.resolveContinuePromise(true);
    }
    // When we detected a pulling, we stop the PoW loop
    pullingDetected() {
        if (this.pullingFinishedPromise.isResolved()) {
            this.pullingFinishedPromise = querablep(Promise.race([
                // We wait for end of pulling signal
                new Promise((res) => this.pullingResolveCallback = res),
                // Security: if the end of pulling signal is not emitted after some, we automatically trigger it
                new Promise((res) => this.timeoutPullingCallback = () => {
                    this.logger.warn('Pulling not finished after %s ms, continue PoW', constants_1.Constants.PULLING_MAX_DURATION);
                    res();
                })
            ]));
        }
        // Delay the triggering of pulling timeout
        if (this.timeoutPulling) {
            clearTimeout(this.timeoutPulling);
        }
        this.timeoutPulling = setTimeout(this.timeoutPullingCallback, constants_1.Constants.PULLING_MAX_DURATION);
    }
    pullingFinished() {
        return this.pullingResolveCallback && this.pullingResolveCallback();
    }
    startPermanence() {
        return __awaiter(this, void 0, void 0, function* () {
            /******************
             * Main proof loop
             *****************/
            while (yield this.continuePromise) {
                try {
                    const waitingRaces = [];
                    // By default, we do not make a new proof
                    let doProof = false;
                    try {
                        const selfPubkey = this.server.keyPair.publicKey;
                        const dal = this.server.dal;
                        const theConf = this.server.conf;
                        if (!selfPubkey) {
                            throw 'No self pubkey found.';
                        }
                        let current;
                        const isMember = yield dal.isMember(selfPubkey);
                        if (!isMember) {
                            throw 'Local node is not a member. Waiting to be a member before computing a block.';
                        }
                        current = yield dal.getCurrentBlockOrNull();
                        if (!current) {
                            throw 'Waiting for a root block before computing new blocks';
                        }
                        const trial = yield this.server.getBcContext().getIssuerPersonalizedDifficulty(selfPubkey);
                        this.checkTrialIsNotTooHigh(trial, current, selfPubkey);
                        const lastIssuedByUs = current.issuer == selfPubkey;
                        if (this.pullingFinishedPromise && !this.pullingFinishedPromise.isFulfilled()) {
                            this.logger.warn('Waiting for the end of pulling...');
                            yield this.pullingFinishedPromise;
                            this.logger.warn('Pulling done. Continue proof-of-work loop.');
                        }
                        if (lastIssuedByUs && !this.promiseOfWaitingBetween2BlocksOfOurs) {
                            this.promiseOfWaitingBetween2BlocksOfOurs = new Promise((resolve) => setTimeout(resolve, theConf.powDelay));
                            this.logger.warn('Waiting ' + theConf.powDelay + 'ms before starting to compute next block...');
                        }
                        else {
                            // We have waited enough
                            this.promiseOfWaitingBetween2BlocksOfOurs = null;
                            // But under some conditions, we can make one
                            doProof = true;
                        }
                    }
                    catch (e) {
                        this.logger.warn(e);
                    }
                    if (doProof) {
                        /*******************
                         * COMPUTING A BLOCK
                         ******************/
                        yield Promise.race([
                            // We still listen at eventual blockchain change
                            (() => __awaiter(this, void 0, void 0, function* () {
                                // If the blockchain changes
                                yield new Promise((resolve) => this.blockchainChangedResolver = resolve);
                                // Then cancel the generation
                                yield this.prover.cancel();
                            }))(),
                            // The generation
                            (() => __awaiter(this, void 0, void 0, function* () {
                                try {
                                    const current = yield this.server.dal.getCurrentBlockOrNull();
                                    const selfPubkey = this.server.keyPair.publicKey;
                                    const trial2 = yield this.server.getBcContext().getIssuerPersonalizedDifficulty(selfPubkey);
                                    this.checkTrialIsNotTooHigh(trial2, current, selfPubkey);
                                    this.lastComputedBlock = yield this.generator.makeNextBlock(null, trial2);
                                    try {
                                        const obj = parsers.parseBlock.syncWrite(dos2unix(this.lastComputedBlock.getRawSigned()));
                                        yield this.server.singleWritePromise(obj);
                                    }
                                    catch (err) {
                                        this.logger.warn('Proof-of-work self-submission: %s', err.message || err);
                                    }
                                }
                                catch (e) {
                                    this.logger.warn('The proof-of-work generation was canceled: %s', (e && e.message) || e || 'unkonwn reason');
                                }
                            }))()
                        ]);
                    }
                    else {
                        /*******************
                         * OR WAITING PHASE
                         ******************/
                        if (this.promiseOfWaitingBetween2BlocksOfOurs) {
                            waitingRaces.push(this.promiseOfWaitingBetween2BlocksOfOurs);
                        }
                        let raceDone = false;
                        yield Promise.race(waitingRaces.concat([
                            // The blockchain has changed! We or someone else found a proof, we must make a gnu one
                            new Promise((resolve) => this.blockchainChangedResolver = () => {
                                this.logger.warn('Blockchain changed!');
                                resolve();
                            }),
                            // Security: if nothing happens for a while, trigger the whole process again
                            new Promise((resolve) => setTimeout(() => {
                                if (!raceDone) {
                                    this.logger.warn('Security trigger: proof-of-work process seems stuck');
                                    resolve();
                                }
                            }, this.conf.powSecurityRetryDelay))
                        ]));
                        raceDone = true;
                    }
                }
                catch (e) {
                    this.logger.warn(e);
                }
                this.loops++;
                // Informative variable
                this.logger.trace('PoW loops = %s', this.loops);
            }
        });
    }
    blockchainChanged(gottenBlock) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.server && (!gottenBlock || !this.lastComputedBlock || gottenBlock.hash !== this.lastComputedBlock.hash)) {
                // Cancel any processing proof
                yield this.prover.cancel();
                // If we were waiting, stop it and process the continuous generation
                this.blockchainChangedResolver && this.blockchainChangedResolver();
            }
        });
    }
    stopEveryting() {
        return __awaiter(this, void 0, void 0, function* () {
            // First: avoid continuing the main loop
            this.continuePromise = new Promise((resolve) => this.resolveContinuePromise = resolve);
            // Second: stop any started proof
            yield this.prover.cancel();
            // If we were waiting, stop it and process the continuous generation
            this.blockchainChangedResolver && this.blockchainChangedResolver();
        });
    }
    checkTrialIsNotTooHigh(trial, current, selfPubkey) {
        if (trial > (current.powMin + this.conf.powMaxHandicap)) {
            this.logger.debug('Trial = %s, powMin = %s, pubkey = %s', trial, current.powMin, selfPubkey.slice(0, 6));
            throw 'Too high difficulty: waiting for other members to write next block';
        }
    }
}
exports.PermanentProver = PermanentProver;
//# sourceMappingURL=permanentProver.js.map