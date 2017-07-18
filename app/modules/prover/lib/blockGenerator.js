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
const TransactionDTO_1 = require("../../../lib/dto/TransactionDTO");
const global_rules_1 = require("../../../lib/rules/global_rules");
const local_rules_1 = require("../../../lib/rules/local_rules");
const indexer_1 = require("../../../lib/indexer");
const _ = require('underscore');
const moment = require('moment');
const inquirer = require('inquirer');
const common = require('duniter-common');
const keyring = common.keyring;
const hashf = common.hashf;
const rawer = common.rawer;
const Block = common.document.Block;
const Membership = common.document.Membership;
const Transaction = common.document.Transaction;
const Identity = common.document.Identity;
const Certification = common.document.Certification;
const constants = common.constants;
class BlockGenerator {
    constructor(server) {
        this.server = server;
        this.conf = server.conf;
        this.dal = server.dal;
        this.mainContext = server.BlockchainService.getContext();
        this.selfPubkey = (this.conf.pair && this.conf.pair.pub) || '';
        this.logger = server.logger;
    }
    nextBlock(manualValues, simulationValues = {}) {
        return this.generateNextBlock(new NextBlockGenerator(this.mainContext, this.conf, this.dal, this.logger), manualValues, simulationValues);
    }
    manualRoot() {
        return __awaiter(this, void 0, void 0, function* () {
            let current = yield this.dal.getCurrentBlockOrNull();
            if (current) {
                throw 'Cannot generate root block: it already exists.';
            }
            return this.generateNextBlock(new ManualRootGenerator());
        });
    }
    /**
     * Generate next block, gathering both updates & newcomers
     */
    generateNextBlock(generator, manualValues = null, simulationValues = null) {
        return __awaiter(this, void 0, void 0, function* () {
            const vHEAD_1 = yield this.mainContext.getvHEAD_1();
            if (simulationValues && simulationValues.medianTime) {
                vHEAD_1.medianTime = simulationValues.medianTime;
            }
            const current = yield this.dal.getCurrentBlockOrNull();
            const revocations = yield this.dal.getRevocatingMembers();
            const exclusions = yield this.dal.getToBeKickedPubkeys();
            const newCertsFromWoT = yield generator.findNewCertsFromWoT(current);
            const newcomersLeavers = yield this.findNewcomersAndLeavers(current, (joinersData) => generator.filterJoiners(joinersData));
            const transactions = yield this.findTransactions(current);
            const joinData = newcomersLeavers[2];
            const leaveData = newcomersLeavers[3];
            const newCertsFromNewcomers = newcomersLeavers[4];
            const certifiersOfNewcomers = _.uniq(_.keys(joinData).reduce((theCertifiers, newcomer) => {
                return theCertifiers.concat(_.pluck(joinData[newcomer].certs, 'from'));
            }, []));
            const certifiers = [].concat(certifiersOfNewcomers);
            // Merges updates
            _(newCertsFromWoT).keys().forEach(function (certified) {
                newCertsFromWoT[certified] = newCertsFromWoT[certified].filter((cert) => {
                    // Must not certify a newcomer, since it would mean multiple certifications at same time from one member
                    const isCertifier = certifiers.indexOf(cert.from) != -1;
                    if (!isCertifier) {
                        certifiers.push(cert.from);
                    }
                    return !isCertifier;
                });
            });
            _(newCertsFromNewcomers).keys().forEach((certified) => {
                newCertsFromWoT[certified] = (newCertsFromWoT[certified] || []).concat(newCertsFromNewcomers[certified]);
            });
            // Revocations
            // Create the block
            return this.createBlock(current, joinData, leaveData, newCertsFromWoT, revocations, exclusions, transactions, manualValues);
        });
    }
    findNewcomersAndLeavers(current, filteringFunc) {
        return __awaiter(this, void 0, void 0, function* () {
            const newcomers = yield this.findNewcomers(current, filteringFunc);
            const leavers = yield this.findLeavers(current);
            const cur = newcomers.current;
            const newWoTMembers = newcomers.newWotMembers;
            const finalJoinData = newcomers.finalJoinData;
            const updates = newcomers.updates;
            return [cur, newWoTMembers, finalJoinData, leavers, updates];
        });
    }
    findTransactions(current) {
        return __awaiter(this, void 0, void 0, function* () {
            const versionMin = current ? Math.min(common.constants.LAST_VERSION_FOR_TX, current.version) : common.constants.DOCUMENTS_VERSION;
            const txs = yield this.dal.getTransactionsPending(versionMin);
            const transactions = [];
            const passingTxs = [];
            for (const obj of txs) {
                obj.currency = this.conf.currency;
                const tx = TransactionDTO_1.TransactionDTO.fromJSONObject(obj);
                try {
                    yield new Promise((resolve, reject) => {
                        local_rules_1.LOCAL_RULES_HELPERS.checkBunchOfTransactions(passingTxs.concat(tx), (err, res) => {
                            if (err)
                                return reject(err);
                            return resolve(res);
                        });
                    });
                    const nextBlockWithFakeTimeVariation = { medianTime: current.medianTime + 1 };
                    yield global_rules_1.GLOBAL_RULES_HELPERS.checkSingleTransaction(tx, nextBlockWithFakeTimeVariation, this.conf, this.dal);
                    yield global_rules_1.GLOBAL_RULES_HELPERS.checkTxBlockStamp(tx, this.dal);
                    transactions.push(tx);
                    passingTxs.push(tx);
                    this.logger.info('Transaction %s added to block', tx.hash);
                }
                catch (err) {
                    this.logger.error(err);
                    const currentNumber = (current && current.number) || 0;
                    const blockstamp = tx.blockstamp || (currentNumber + '-');
                    const txBlockNumber = parseInt(blockstamp.split('-')[0]);
                    // 10 blocks before removing the transaction
                    if (currentNumber - txBlockNumber + 1 >= common.constants.TRANSACTION_MAX_TRIES) {
                        yield this.dal.removeTxByHash(tx.hash);
                    }
                }
            }
            return transactions;
        });
    }
    findLeavers(current) {
        return __awaiter(this, void 0, void 0, function* () {
            const leaveData = {};
            const memberships = yield this.dal.findLeavers();
            const leavers = [];
            memberships.forEach((ms) => leavers.push(ms.issuer));
            for (const ms of memberships) {
                const leave = { identity: null, ms: ms, key: null, idHash: '' };
                leave.idHash = (hashf(ms.userid + ms.certts + ms.issuer) + "").toUpperCase();
                let block;
                if (current) {
                    block = yield this.dal.getBlock(ms.number);
                }
                else {
                    block = {};
                }
                const identity = yield this.dal.getIdentityByHashOrNull(leave.idHash);
                const currentMembership = yield this.dal.mindexDAL.getReducedMS(ms.issuer);
                const currentMSN = currentMembership ? parseInt(currentMembership.created_on) : -1;
                if (identity && block && currentMSN < leave.ms.number && identity.member) {
                    // MS + matching cert are found
                    leave.identity = identity;
                    leaveData[identity.pubkey] = leave;
                }
            }
            return leaveData;
        });
    }
    findNewcomers(current, filteringFunc) {
        return __awaiter(this, void 0, void 0, function* () {
            const updates = {};
            const preJoinData = yield this.getPreJoinData(current);
            const joinData = yield filteringFunc(preJoinData);
            const members = yield this.dal.getMembers();
            const wotMembers = _.pluck(members, 'pubkey');
            // Checking step
            const newcomers = _(joinData).keys();
            const nextBlockNumber = current ? current.number + 1 : 0;
            try {
                const realNewcomers = yield this.iteratedChecking(newcomers, (someNewcomers) => __awaiter(this, void 0, void 0, function* () {
                    const nextBlock = {
                        number: nextBlockNumber,
                        joiners: someNewcomers,
                        identities: _.filter(newcomers.map((pub) => joinData[pub].identity), { wasMember: false }).map((idty) => idty.pubkey)
                    };
                    const theNewLinks = yield this.computeNewLinks(nextBlockNumber, someNewcomers, joinData, updates);
                    yield this.checkWoTConstraints(nextBlock, theNewLinks, current);
                }));
                const newLinks = yield this.computeNewLinks(nextBlockNumber, realNewcomers, joinData, updates);
                const newWoT = wotMembers.concat(realNewcomers);
                const finalJoinData = {};
                realNewcomers.forEach((newcomer) => {
                    // Only keep membership of selected newcomers
                    finalJoinData[newcomer] = joinData[newcomer];
                    // Only keep certifications from final members
                    const keptCerts = [];
                    joinData[newcomer].certs.forEach((cert) => {
                        const issuer = cert.from;
                        if (~newWoT.indexOf(issuer) && ~newLinks[cert.to].indexOf(issuer)) {
                            keptCerts.push(cert);
                        }
                    });
                    joinData[newcomer].certs = keptCerts;
                });
                return {
                    current: current,
                    newWotMembers: wotMembers.concat(realNewcomers),
                    finalJoinData: finalJoinData,
                    updates: updates
                };
            }
            catch (err) {
                this.logger.error(err);
                throw err;
            }
        });
    }
    checkWoTConstraints(block, newLinks, current) {
        return __awaiter(this, void 0, void 0, function* () {
            if (block.number < 0) {
                throw 'Cannot compute WoT constraint for negative block number';
            }
            const newcomers = block.joiners.map((inlineMS) => inlineMS.split(':')[0]);
            const realNewcomers = block.identities;
            for (const newcomer of newcomers) {
                if (block.number > 0) {
                    try {
                        // Will throw an error if not enough links
                        yield this.mainContext.checkHaveEnoughLinks(newcomer, newLinks);
                        // This one does not throw but returns a boolean
                        const isOut = yield global_rules_1.GLOBAL_RULES_HELPERS.isOver3Hops(newcomer, newLinks, realNewcomers, current, this.conf, this.dal);
                        if (isOut) {
                            throw 'Key ' + newcomer + ' is not recognized by the WoT for this block';
                        }
                    }
                    catch (e) {
                        this.logger.debug(e);
                        throw e;
                    }
                }
            }
        });
    }
    iteratedChecking(newcomers, checkWoTForNewcomers) {
        return __awaiter(this, void 0, void 0, function* () {
            const passingNewcomers = [];
            let hadError = false;
            for (const newcomer of newcomers) {
                try {
                    yield checkWoTForNewcomers(passingNewcomers.concat(newcomer));
                    passingNewcomers.push(newcomer);
                }
                catch (err) {
                    hadError = hadError || err;
                }
            }
            if (hadError) {
                return yield this.iteratedChecking(passingNewcomers, checkWoTForNewcomers);
            }
            else {
                return passingNewcomers;
            }
        });
    }
    getPreJoinData(current) {
        return __awaiter(this, void 0, void 0, function* () {
            const preJoinData = {};
            const memberships = yield this.dal.findNewcomers(current && current.medianTime);
            const joiners = [];
            memberships.forEach((ms) => joiners.push(ms.issuer));
            for (const ms of memberships) {
                try {
                    if (ms.block !== common.constants.SPECIAL_BLOCK) {
                        let msBasedBlock = yield this.dal.getBlockByBlockstampOrNull(ms.block);
                        if (!msBasedBlock) {
                            throw constants.ERRORS.BLOCKSTAMP_DOES_NOT_MATCH_A_BLOCK;
                        }
                        let age = current.medianTime - msBasedBlock.medianTime;
                        if (age > this.conf.msWindow) {
                            throw constants.ERRORS.TOO_OLD_MEMBERSHIP;
                        }
                    }
                    const idtyHash = (hashf(ms.userid + ms.certts + ms.issuer) + "").toUpperCase();
                    const join = yield this.getSinglePreJoinData(current, idtyHash, joiners);
                    join.ms = ms;
                    const currentMembership = yield this.dal.mindexDAL.getReducedMS(ms.issuer);
                    const currentMSN = currentMembership ? parseInt(currentMembership.created_on) : -1;
                    if (!join.identity.revoked && currentMSN < parseInt(join.ms.number)) {
                        preJoinData[join.identity.pubkey] = join;
                    }
                }
                catch (err) {
                    if (err && !err.uerr) {
                        this.logger.warn(err);
                    }
                }
            }
            return preJoinData;
        });
    }
    computeNewLinks(forBlock, theNewcomers, joinData, updates) {
        return __awaiter(this, void 0, void 0, function* () {
            let newCerts = yield this.computeNewCerts(forBlock, theNewcomers, joinData);
            return this.newCertsToLinks(newCerts, updates);
        });
    }
    newCertsToLinks(newCerts, updates) {
        let newLinks = {};
        _.mapObject(newCerts, function (certs, pubkey) {
            newLinks[pubkey] = _.pluck(certs, 'from');
        });
        _.mapObject(updates, function (certs, pubkey) {
            newLinks[pubkey] = (newLinks[pubkey] || []).concat(_.pluck(certs, 'pubkey'));
        });
        return newLinks;
    }
    computeNewCerts(forBlock, theNewcomers, joinData) {
        return __awaiter(this, void 0, void 0, function* () {
            const newCerts = {}, certifiers = [];
            const certsByKey = _.mapObject(joinData, function (val) { return val.certs; });
            for (const newcomer of theNewcomers) {
                // New array of certifiers
                newCerts[newcomer] = newCerts[newcomer] || [];
                // Check wether each certification of the block is from valid newcomer/member
                for (const cert of certsByKey[newcomer]) {
                    const isAlreadyCertifying = certifiers.indexOf(cert.from) !== -1;
                    if (!(isAlreadyCertifying && forBlock > 0)) {
                        if (~theNewcomers.indexOf(cert.from)) {
                            // Newcomer to newcomer => valid link
                            newCerts[newcomer].push(cert);
                            certifiers.push(cert.from);
                        }
                        else {
                            let isMember = yield this.dal.isMember(cert.from);
                            // Member to newcomer => valid link
                            if (isMember) {
                                newCerts[newcomer].push(cert);
                                certifiers.push(cert.from);
                            }
                        }
                    }
                }
            }
            return newCerts;
        });
    }
    getSinglePreJoinData(current, idHash, joiners) {
        return __awaiter(this, void 0, void 0, function* () {
            const identity = yield this.dal.getIdentityByHashOrNull(idHash);
            let foundCerts = [];
            const vHEAD_1 = yield this.mainContext.getvHEAD_1();
            if (!identity) {
                throw 'Identity with hash \'' + idHash + '\' not found';
            }
            if (current && identity.buid == common.constants.SPECIAL_BLOCK && !identity.wasMember) {
                throw constants.ERRORS.TOO_OLD_IDENTITY;
            }
            else if (!identity.wasMember && identity.buid != common.constants.SPECIAL_BLOCK) {
                const idtyBasedBlock = yield this.dal.getBlock(identity.buid);
                const age = current.medianTime - idtyBasedBlock.medianTime;
                if (age > this.conf.idtyWindow) {
                    throw constants.ERRORS.TOO_OLD_IDENTITY;
                }
            }
            const idty = Identity.fromJSON(identity);
            idty.currency = this.conf.currency;
            const createIdentity = idty.rawWithoutSig();
            const verified = keyring.verify(createIdentity, idty.sig, idty.pubkey);
            if (!verified) {
                throw constants.ERRORS.IDENTITY_WRONGLY_SIGNED;
            }
            const isIdentityLeaving = yield this.dal.isLeaving(idty.pubkey);
            if (!isIdentityLeaving) {
                if (!current) {
                    // Look for certifications from initial joiners
                    const certs = yield this.dal.certsNotLinkedToTarget(idHash);
                    foundCerts = _.filter(certs, function (cert) {
                        // Add 'joiners && ': special case when block#0 not written ANd not joiner yet (avoid undefined error)
                        return joiners && ~joiners.indexOf(cert.from);
                    });
                }
                else {
                    // Look for certifications from WoT members
                    let certs = yield this.dal.certsNotLinkedToTarget(idHash);
                    const certifiers = [];
                    for (const cert of certs) {
                        try {
                            const basedBlock = yield this.dal.getBlock(cert.block_number);
                            if (!basedBlock) {
                                throw 'Unknown timestamp block for identity';
                            }
                            if (current) {
                                const age = current.medianTime - basedBlock.medianTime;
                                if (age > this.conf.sigWindow || age > this.conf.sigValidity) {
                                    throw 'Too old certification';
                                }
                            }
                            // Already exists a link not replayable yet?
                            let exists = yield this.dal.existsNonReplayableLink(cert.from, cert.to);
                            if (exists) {
                                throw 'It already exists a similar certification written, which is not replayable yet';
                            }
                            // Already exists a link not chainable yet?
                            exists = yield this.dal.existsNonChainableLink(cert.from, vHEAD_1, this.conf.sigStock);
                            if (exists) {
                                throw 'It already exists a written certification from ' + cert.from + ' which is not chainable yet';
                            }
                            const isMember = yield this.dal.isMember(cert.from);
                            const doubleSignature = !!(~certifiers.indexOf(cert.from));
                            if (isMember && !doubleSignature) {
                                const isValid = yield global_rules_1.GLOBAL_RULES_HELPERS.checkCertificationIsValidForBlock(cert, { number: current.number + 1, currency: current.currency }, () => __awaiter(this, void 0, void 0, function* () {
                                    const idty = yield this.dal.getIdentityByHashOrNull(idHash);
                                    return idty;
                                }), this.conf, this.dal);
                                if (isValid) {
                                    certifiers.push(cert.from);
                                    foundCerts.push(cert);
                                }
                            }
                        }
                        catch (e) {
                            this.logger.debug(e.stack || e.message || e);
                            // Go on
                        }
                    }
                }
            }
            return {
                identity: identity,
                key: null,
                idHash: idHash,
                certs: foundCerts
            };
        });
    }
    createBlock(current, joinData, leaveData, updates, revocations, exclusions, transactions, manualValues) {
        return __awaiter(this, void 0, void 0, function* () {
            if (manualValues && manualValues.excluded) {
                exclusions = manualValues.excluded;
            }
            if (manualValues && manualValues.revoked) {
                revocations = [];
            }
            const vHEAD = yield this.mainContext.getvHeadCopy();
            const vHEAD_1 = yield this.mainContext.getvHEAD_1();
            const maxLenOfBlock = indexer_1.Indexer.DUP_HELPERS.getMaxBlockSize(vHEAD);
            let blockLen = 0;
            // Revocations have an impact on exclusions
            revocations.forEach((idty) => exclusions.push(idty.pubkey));
            // Prevent writing joins/updates for excluded members
            exclusions = _.uniq(exclusions);
            exclusions.forEach((excluded) => {
                delete updates[excluded];
                delete joinData[excluded];
                delete leaveData[excluded];
            });
            _(leaveData).keys().forEach((leaver) => {
                delete updates[leaver];
                delete joinData[leaver];
            });
            const block = new Block();
            block.number = current ? current.number + 1 : 0;
            // Compute the new MedianTime
            if (block.number == 0) {
                block.medianTime = moment.utc().unix() - this.conf.rootoffset;
            }
            else {
                block.medianTime = vHEAD.medianTime;
            }
            // Choose the version
            block.version = (manualValues && manualValues.version) || (yield local_rules_1.LOCAL_RULES_HELPERS.getMaxPossibleVersionNumber(current));
            block.currency = current ? current.currency : this.conf.currency;
            block.nonce = 0;
            if (!this.conf.dtReeval) {
                this.conf.dtReeval = this.conf.dt;
            }
            if (!this.conf.udTime0) {
                this.conf.udTime0 = block.medianTime + this.conf.dt;
            }
            if (!this.conf.udReevalTime0) {
                this.conf.udReevalTime0 = block.medianTime + this.conf.dtReeval;
            }
            block.parameters = block.number > 0 ? '' : [
                this.conf.c, this.conf.dt, this.conf.ud0,
                this.conf.sigPeriod, this.conf.sigStock, this.conf.sigWindow, this.conf.sigValidity,
                this.conf.sigQty, this.conf.idtyWindow, this.conf.msWindow, this.conf.xpercent, this.conf.msValidity,
                this.conf.stepMax, this.conf.medianTimeBlocks, this.conf.avgGenTime, this.conf.dtDiffEval,
                (this.conf.percentRot == 1 ? "1.0" : this.conf.percentRot),
                this.conf.udTime0,
                this.conf.udReevalTime0,
                this.conf.dtReeval
            ].join(':');
            block.previousHash = current ? current.hash : "";
            block.previousIssuer = current ? current.issuer : "";
            if (this.selfPubkey) {
                block.issuer = this.selfPubkey;
            }
            // Members merkle
            const joiners = _(joinData).keys();
            joiners.sort();
            const previousCount = current ? current.membersCount : 0;
            if (joiners.length == 0 && !current) {
                throw constants.ERRORS.CANNOT_ROOT_BLOCK_NO_MEMBERS;
            }
            // Kicked people
            block.excluded = exclusions;
            /*****
             * Priority 1: keep the WoT sane
             */
            // Certifications from the WoT, to the WoT
            _(updates).keys().forEach((certifiedMember) => {
                const certs = updates[certifiedMember] || [];
                certs.forEach((cert) => {
                    if (blockLen < maxLenOfBlock) {
                        block.certifications.push(Certification.fromJSON(cert).inline());
                        blockLen++;
                    }
                });
            });
            // Renewed
            joiners.forEach((joiner) => {
                const data = joinData[joiner];
                // Join only for non-members
                if (data.identity.member) {
                    if (blockLen < maxLenOfBlock) {
                        block.actives.push(Membership.fromJSON(data.ms).inline());
                        blockLen++;
                    }
                }
            });
            // Leavers
            const leavers = _(leaveData).keys();
            leavers.forEach((leaver) => {
                const data = leaveData[leaver];
                // Join only for non-members
                if (data.identity.member) {
                    if (blockLen < maxLenOfBlock) {
                        block.leavers.push(Membership.fromJSON(data.ms).inline());
                        blockLen++;
                    }
                }
            });
            /*****
             * Priority 2: revoked identities
             */
            revocations.forEach((idty) => {
                if (blockLen < maxLenOfBlock) {
                    block.revoked.push([idty.pubkey, idty.revocation_sig].join(':'));
                    blockLen++;
                }
            });
            /*****
             * Priority 3: newcomers/renewcomers
             */
            let countOfCertsToNewcomers = 0;
            // Newcomers
            // Newcomers + back people
            joiners.forEach((joiner) => {
                const data = joinData[joiner];
                // Identities only for never-have-been members
                if (!data.identity.member && !data.identity.wasMember) {
                    block.identities.push(Identity.fromJSON(data.identity).inline());
                }
                // Join only for non-members
                if (!data.identity.member) {
                    block.joiners.push(Membership.fromJSON(data.ms).inline());
                }
            });
            block.identities = _.sortBy(block.identities, (line) => {
                const sp = line.split(':');
                return sp[2] + sp[3];
            });
            // Certifications from the WoT, to newcomers
            joiners.forEach((joiner) => {
                const data = joinData[joiner] || [];
                data.certs.forEach((cert) => {
                    countOfCertsToNewcomers++;
                    block.certifications.push(Certification.fromJSON(cert).inline());
                });
            });
            // Eventually revert newcomers/renewcomer
            if (block.number > 0 && Block.getLen(block) > maxLenOfBlock) {
                for (let i = 0; i < block.identities.length; i++) {
                    block.identities.pop();
                    block.joiners.pop();
                }
                for (let i = 0; i < countOfCertsToNewcomers; i++) {
                    block.certifications.pop();
                }
            }
            // Final number of members
            block.membersCount = previousCount + block.joiners.length - block.excluded.length;
            vHEAD.membersCount = block.membersCount;
            /*****
             * Priority 4: transactions
             */
            block.transactions = [];
            blockLen = Block.getLen(block);
            if (blockLen < maxLenOfBlock) {
                transactions.forEach((tx) => {
                    const txLen = Transaction.getLen(tx);
                    if (txLen <= common.constants.MAXIMUM_LEN_OF_COMPACT_TX && blockLen + txLen <= maxLenOfBlock && tx.version == common.constants.TRANSACTION_VERSION) {
                        block.transactions.push({ raw: tx.getCompactVersion() });
                    }
                    blockLen += txLen;
                });
            }
            /**
             * Finally handle the Universal Dividend
             */
            block.powMin = vHEAD.powMin;
            // Universal Dividend
            if (vHEAD.new_dividend) {
                // BR_G13
                // Recompute according to block.membersCount
                indexer_1.Indexer.prepareDividend(vHEAD, vHEAD_1, this.conf);
                // BR_G14
                indexer_1.Indexer.prepareUnitBase(vHEAD);
                // Fix BR_G14 double call
                vHEAD.unitBase = Math.min(vHEAD_1.unitBase + 1, vHEAD.unitBase);
                block.dividend = vHEAD.dividend;
                block.unitbase = vHEAD.unitBase;
            }
            else {
                block.unitbase = block.number == 0 ? 0 : current.unitbase;
            }
            // Rotation
            block.issuersCount = vHEAD.issuersCount;
            block.issuersFrame = vHEAD.issuersFrame;
            block.issuersFrameVar = vHEAD.issuersFrameVar;
            // Manual values before hashing
            if (manualValues) {
                _.extend(block, _.omit(manualValues, 'time'));
            }
            // InnerHash
            block.time = block.medianTime;
            block.inner_hash = hashf(rawer.getBlockInnerPart(block)).toUpperCase();
            return block;
        });
    }
}
exports.BlockGenerator = BlockGenerator;
class BlockGeneratorWhichProves extends BlockGenerator {
    constructor(server, prover) {
        super(server);
        this.prover = prover;
    }
    makeNextBlock(block, trial, manualValues = null) {
        return __awaiter(this, void 0, void 0, function* () {
            const unsignedBlock = block || (yield this.nextBlock(manualValues));
            const trialLevel = trial || (yield this.mainContext.getIssuerPersonalizedDifficulty(this.selfPubkey));
            return this.prover.prove(unsignedBlock, trialLevel, (manualValues && manualValues.time) || null);
        });
    }
}
exports.BlockGeneratorWhichProves = BlockGeneratorWhichProves;
/**
 * Class to implement strategy of automatic selection of incoming data for next block.
 * @constructor
 */
class NextBlockGenerator {
    constructor(mainContext, conf, dal, logger) {
        this.mainContext = mainContext;
        this.conf = conf;
        this.dal = dal;
        this.logger = logger;
    }
    findNewCertsFromWoT(current) {
        return __awaiter(this, void 0, void 0, function* () {
            const updates = {};
            const updatesToFrom = {};
            const certs = yield this.dal.certsFindNew();
            const vHEAD_1 = yield this.mainContext.getvHEAD_1();
            for (const cert of certs) {
                const targetIdty = yield this.dal.getIdentityByHashOrNull(cert.target);
                // The identity must be known
                if (targetIdty) {
                    const certSig = cert.sig;
                    // Do not rely on certification block UID, prefer using the known hash of the block by its given number
                    const targetBlock = yield this.dal.getBlock(cert.block_number);
                    // Check if writable
                    let duration = current && targetBlock ? current.medianTime - parseInt(targetBlock.medianTime) : 0;
                    if (targetBlock && duration <= this.conf.sigWindow) {
                        cert.sig = '';
                        cert.currency = this.conf.currency;
                        cert.issuer = cert.from;
                        cert.idty_issuer = targetIdty.pubkey;
                        cert.idty_uid = targetIdty.uid;
                        cert.idty_buid = targetIdty.buid;
                        cert.idty_sig = targetIdty.sig;
                        cert.buid = current ? [cert.block_number, targetBlock.hash].join('-') : common.constants.SPECIAL_BLOCK;
                        const rawCert = Certification.fromJSON(cert).getRaw();
                        if (keyring.verify(rawCert, certSig, cert.from)) {
                            cert.sig = certSig;
                            let exists = false;
                            if (current) {
                                // Already exists a link not replayable yet?
                                exists = yield this.dal.existsNonReplayableLink(cert.from, cert.to);
                            }
                            if (!exists) {
                                // Already exists a link not chainable yet?
                                // No chainability block means absolutely nobody can issue certifications yet
                                exists = yield this.dal.existsNonChainableLink(cert.from, vHEAD_1, this.conf.sigStock);
                                if (!exists) {
                                    // It does NOT already exists a similar certification written, which is not replayable yet
                                    // Signatory must be a member
                                    const isSignatoryAMember = yield this.dal.isMember(cert.from);
                                    const isCertifiedANonLeavingMember = isSignatoryAMember && (yield this.dal.isMemberAndNonLeaver(cert.to));
                                    // Certified must be a member and non-leaver
                                    if (isSignatoryAMember && isCertifiedANonLeavingMember) {
                                        updatesToFrom[cert.to] = updatesToFrom[cert.to] || [];
                                        updates[cert.to] = updates[cert.to] || [];
                                        if (updatesToFrom[cert.to].indexOf(cert.from) == -1) {
                                            updates[cert.to].push(cert);
                                            updatesToFrom[cert.to].push(cert.from);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            return updates;
        });
    }
    filterJoiners(preJoinData) {
        return __awaiter(this, void 0, void 0, function* () {
            const filtered = {};
            const filterings = [];
            const filter = (pubkey) => __awaiter(this, void 0, void 0, function* () {
                try {
                    // No manual filtering, takes all BUT already used UID or pubkey
                    let exists = yield global_rules_1.GLOBAL_RULES_HELPERS.checkExistsUserID(preJoinData[pubkey].identity.uid, this.dal);
                    if (exists && !preJoinData[pubkey].identity.wasMember) {
                        throw 'UID already taken';
                    }
                    exists = yield global_rules_1.GLOBAL_RULES_HELPERS.checkExistsPubkey(pubkey, this.dal);
                    if (exists && !preJoinData[pubkey].identity.wasMember) {
                        throw 'Pubkey already taken';
                    }
                    filtered[pubkey] = preJoinData[pubkey];
                }
                catch (err) {
                    this.logger.warn(err);
                }
            });
            _.keys(preJoinData).forEach((joinPubkey) => filterings.push(filter(joinPubkey)));
            yield Promise.all(filterings);
            return filtered;
        });
    }
}
/**
 * Class to implement strategy of manual selection of root members for root block.
 * @constructor
 */
class ManualRootGenerator {
    findNewCertsFromWoT() {
        return Promise.resolve({});
    }
    filterJoiners(preJoinData) {
        return __awaiter(this, void 0, void 0, function* () {
            const filtered = {};
            const newcomers = _(preJoinData).keys();
            const uids = [];
            newcomers.forEach((newcomer) => uids.push(preJoinData[newcomer].ms.userid));
            if (newcomers.length > 0) {
                const answers = yield inquirer.prompt([{
                        type: "checkbox",
                        name: "uids",
                        message: "Newcomers to add",
                        choices: uids,
                        default: uids[0]
                    }]);
                newcomers.forEach((newcomer) => {
                    if (~answers.uids.indexOf(preJoinData[newcomer].ms.userid))
                        filtered[newcomer] = preJoinData[newcomer];
                });
                if (answers.uids.length == 0)
                    throw 'No newcomer selected';
                return filtered;
            }
            else {
                throw 'No newcomer found';
            }
        });
    }
}
//# sourceMappingURL=blockGenerator.js.map