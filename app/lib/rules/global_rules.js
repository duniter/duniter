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
const co = require('co');
const _ = require('underscore');
const common = require('duniter-common');
const indexer = require('../indexer').Indexer;
const local_rules = require('../rules/local_rules');
const constants = common.constants;
const keyring = common.keyring;
const rawer = common.rawer;
const Identity = common.document.Identity;
const Transaction = common.document.Transaction;
const unlock = common.txunlock;
exports.rules = {};
// Empty logger by default
let logger = {
    debug: (...args) => { },
    warn: (...args) => { }
};
// TODO: all the global rules should be replaced by index rule someday
exports.rules.FUNCTIONS = {
    checkIdentitiesAreWritable: (block, conf, dal) => __awaiter(this, void 0, void 0, function* () {
        let current = yield dal.getCurrentBlockOrNull();
        for (const obj of block.identities) {
            let idty = Identity.fromInline(obj);
            let found = yield dal.getWrittenIdtyByUID(idty.uid);
            if (found) {
                throw Error('Identity already used');
            }
            // Because the window rule does not apply on initial certifications
            if (current && idty.buid != constants.SPECIAL_BLOCK) {
                // From DUP 0.5: we fully check the blockstamp
                const basedBlock = yield dal.getBlockByBlockstamp(idty.buid);
                // Check if writable
                let duration = current.medianTime - parseInt(basedBlock.medianTime);
                if (duration > conf.idtyWindow) {
                    throw Error('Identity is too old and cannot be written');
                }
            }
        }
        return true;
    }),
    checkSourcesAvailability: (block, conf, dal, alsoCheckPendingTransactions) => __awaiter(this, void 0, void 0, function* () {
        const txs = block.transactions;
        const current = yield dal.getCurrentBlockOrNull();
        for (const tx of txs) {
            const inputs = tx.inputsAsObjects();
            const outputs = tx.outputsAsObjects();
            let unlocks = {};
            let sumOfInputs = 0;
            let maxOutputBase = current.unitbase;
            for (const theUnlock of tx.unlocks) {
                let sp = theUnlock.split(':');
                let index = parseInt(sp[0]);
                unlocks[index] = sp[1];
            }
            for (let k = 0, len2 = inputs.length; k < len2; k++) {
                let src = inputs[k];
                let dbSrc = yield dal.getSource(src.identifier, src.pos);
                logger.debug('Source %s:%s:%s:%s = %s', src.amount, src.base, src.identifier, src.pos, dbSrc && dbSrc.consumed);
                if (!dbSrc && alsoCheckPendingTransactions) {
                    // For chained transactions which are checked on sandbox submission, we accept them if there is already
                    // a previous transaction of the chain already recorded in the pool
                    dbSrc = yield (() => __awaiter(this, void 0, void 0, function* () {
                        let hypotheticSrc = null;
                        let targetTX = yield dal.getTxByHash(src.identifier);
                        if (targetTX) {
                            let outputStr = targetTX.outputs[src.pos];
                            if (outputStr) {
                                hypotheticSrc = Transaction.outputStr2Obj(outputStr);
                                hypotheticSrc.consumed = false;
                                hypotheticSrc.time = 0;
                            }
                        }
                        return hypotheticSrc;
                    }))();
                }
                if (!dbSrc || dbSrc.consumed) {
                    logger.warn('Source ' + [src.type, src.identifier, src.pos].join(':') + ' is not available');
                    throw constants.ERRORS.SOURCE_ALREADY_CONSUMED;
                }
                sumOfInputs += dbSrc.amount * Math.pow(10, dbSrc.base);
                if (block.medianTime - dbSrc.written_time < tx.locktime) {
                    throw constants.ERRORS.LOCKTIME_PREVENT;
                }
                let sigResults = local_rules.HELPERS.getSigResult(tx);
                let unlocksForCondition = [];
                let unlocksMetadata = {};
                let unlockValues = unlocks[k];
                if (dbSrc.conditions) {
                    if (unlockValues) {
                        // Evaluate unlock values
                        let sp = unlockValues.split(' ');
                        for (const func of sp) {
                            let param = func.match(/\((.+)\)/)[1];
                            if (func.match(/^SIG/)) {
                                let pubkey = tx.issuers[parseInt(param)];
                                if (!pubkey) {
                                    logger.warn('Source ' + [src.amount, src.base, src.type, src.identifier, src.pos].join(':') + ' unlock fail (unreferenced signatory)');
                                    throw constants.ERRORS.WRONG_UNLOCKER;
                                }
                                unlocksForCondition.push({
                                    pubkey: pubkey,
                                    sigOK: sigResults.sigs[pubkey] && sigResults.sigs[pubkey].matching || false
                                });
                            }
                            else if (func.match(/^XHX/)) {
                                unlocksForCondition.push(param);
                            }
                        }
                    }
                    if (dbSrc.conditions.match(/CLTV/)) {
                        unlocksMetadata.currentTime = block.medianTime;
                    }
                    if (dbSrc.conditions.match(/CSV/)) {
                        unlocksMetadata.elapsedTime = block.medianTime - dbSrc.written_time;
                    }
                    try {
                        if (!unlock(dbSrc.conditions, unlocksForCondition, unlocksMetadata)) {
                            throw Error('Locked');
                        }
                    }
                    catch (e) {
                        logger.warn('Source ' + [src.amount, src.base, src.type, src.identifier, src.pos].join(':') + ' unlock fail');
                        throw constants.ERRORS.WRONG_UNLOCKER;
                    }
                }
            }
            let sumOfOutputs = outputs.reduce(function (p, output) {
                if (output.base > maxOutputBase) {
                    throw constants.ERRORS.WRONG_OUTPUT_BASE;
                }
                return p + output.amount * Math.pow(10, output.base);
            }, 0);
            if (sumOfInputs !== sumOfOutputs) {
                logger.warn('Inputs/Outputs != 1 (%s/%s)', sumOfInputs, sumOfOutputs);
                throw constants.ERRORS.WRONG_AMOUNTS;
            }
        }
        return true;
    })
};
exports.rules.HELPERS = {
    // Functions used in an external context too
    checkMembershipBlock: (ms, current, conf, dal) => checkMSTarget(ms, current ? { number: current.number + 1 } : { number: 0 }, conf, dal),
    checkCertificationIsValid: (cert, current, findIdtyFunc, conf, dal) => checkCertificationIsValid(current ? current : { number: 0 }, cert, findIdtyFunc, conf, dal),
    checkCertificationIsValidForBlock: (cert, block, idty, conf, dal) => checkCertificationIsValid(block, cert, () => idty, conf, dal),
    isOver3Hops: (member, newLinks, newcomers, current, conf, dal) => __awaiter(this, void 0, void 0, function* () {
        if (!current) {
            return Promise.resolve(false);
        }
        try {
            return indexer.DUP_HELPERS.checkPeopleAreNotOudistanced([member], newLinks, newcomers, conf, dal);
        }
        catch (e) {
            return true;
        }
    }),
    checkExistsUserID: (uid, dal) => dal.getWrittenIdtyByUID(uid),
    checkExistsPubkey: (pub, dal) => dal.getWrittenIdtyByPubkey(pub),
    checkSingleTransaction: (tx, block, conf, dal, alsoCheckPendingTransactions) => exports.rules.FUNCTIONS.checkSourcesAvailability({
        transactions: [tx],
        medianTime: block.medianTime
    }, conf, dal, alsoCheckPendingTransactions),
    checkTxBlockStamp: (tx, dal) => __awaiter(this, void 0, void 0, function* () {
        const number = parseInt(tx.blockstamp.split('-')[0]);
        const hash = tx.blockstamp.split('-')[1];
        const basedBlock = yield dal.getBlockByNumberAndHashOrNull(number, hash);
        if (!basedBlock) {
            throw "Wrong blockstamp for transaction";
        }
        // Valuates the blockstampTime field
        tx.blockstampTime = basedBlock.medianTime;
        const current = yield dal.getCurrentBlockOrNull();
        if (current && current.medianTime > basedBlock.medianTime + constants.TX_WINDOW) {
            throw "Transaction has expired";
        }
    })
};
/*****************************
 *
 *      UTILITY FUNCTIONS
 *
 *****************************/
function checkMSTarget(ms, block, conf, dal) {
    return __awaiter(this, void 0, void 0, function* () {
        if (block.number == 0 && ms.number != 0) {
            throw Error('Number must be 0 for root block\'s memberships');
        }
        else if (block.number == 0 && ms.fpr != 'E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855') {
            throw Error('Hash must be E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855 for root block\'s memberships');
        }
        else if (block.number == 0) {
            return null; // Valid for root block
        }
        else {
            let basedBlock;
            try {
                basedBlock = yield dal.getBlockByNumberAndHash(ms.number, ms.fpr);
            }
            catch (e) {
                throw Error('Membership based on an unexisting block');
            }
            let current = yield dal.getCurrentBlockOrNull();
            if (current && current.medianTime > basedBlock.medianTime + conf.msValidity) {
                throw Error('Membership has expired');
            }
            return basedBlock;
        }
    });
}
function checkCertificationIsValid(block, cert, findIdtyFunc, conf, dal) {
    return __awaiter(this, void 0, void 0, function* () {
        if (block.number == 0 && cert.block_number != 0) {
            throw Error('Number must be 0 for root block\'s certifications');
        }
        else {
            let basedBlock = {
                hash: constants.SPECIAL_HASH
            };
            if (block.number != 0) {
                try {
                    basedBlock = yield dal.getBlock(cert.block_number);
                }
                catch (e) {
                    throw Error('Certification based on an unexisting block');
                }
                try {
                    const issuer = yield dal.getWrittenIdtyByPubkey(cert.from);
                    if (!issuer || !issuer.member) {
                        throw Error('Issuer is not a member');
                    }
                }
                catch (e) {
                    throw Error('Certifier must be a member');
                }
            }
            // TODO: weird call, we cannot just do "await findIdtyFunc(...)". There is a bug somewhere.
            let idty = yield co(function* () {
                return yield findIdtyFunc(block, cert.to, dal);
            });
            let current = block.number == 0 ? null : yield dal.getCurrentBlockOrNull();
            if (!idty) {
                throw Error('Identity does not exist for certified');
            }
            else if (current && current.medianTime > basedBlock.medianTime + conf.sigValidity) {
                throw Error('Certification has expired');
            }
            else if (cert.from == idty.pubkey)
                throw Error('Rejected certification: certifying its own self-certification has no meaning');
            else {
                const buid = [cert.block_number, basedBlock.hash].join('-');
                if (cert.block_hash && buid != [cert.block_number, cert.block_hash].join('-'))
                    throw Error('Certification based on an unexisting block buid. from ' + cert.from.substring(0, 8) + ' to ' + idty.pubkey.substring(0, 8));
                idty.currency = conf.currency;
                const raw = rawer.getOfficialCertification(_.extend(idty, {
                    idty_issuer: idty.pubkey,
                    idty_uid: idty.uid,
                    idty_buid: idty.buid,
                    idty_sig: idty.sig,
                    issuer: cert.from,
                    buid: buid,
                    sig: ''
                }));
                const verified = keyring.verify(raw, cert.sig, cert.from);
                if (!verified) {
                    throw constants.ERRORS.WRONG_SIGNATURE_FOR_CERT;
                }
                return true;
            }
        }
    });
}
function setLogger(newLogger) {
    logger = newLogger;
}
exports.setLogger = setLogger;
//# sourceMappingURL=global_rules.js.map