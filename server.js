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
const IdentityService_1 = require("./app/service/IdentityService");
const MembershipService_1 = require("./app/service/MembershipService");
const PeeringService_1 = require("./app/service/PeeringService");
const BlockchainService_1 = require("./app/service/BlockchainService");
const TransactionsService_1 = require("./app/service/TransactionsService");
const ConfDTO_1 = require("./app/lib/dto/ConfDTO");
const fileDAL_1 = require("./app/lib/dal/fileDAL");
const DuniterBlockchain_1 = require("./app/lib/blockchain/DuniterBlockchain");
const SqlBlockchain_1 = require("./app/lib/blockchain/SqlBlockchain");
const stream = require("stream");
const path = require('path');
const _ = require('underscore');
const archiver = require('archiver');
const unzip = require('unzip2');
const fs = require('fs');
const daemonize = require("daemonize2");
const parsers = require('duniter-common').parsers;
const constants = require('./app/lib/constants');
const jsonpckg = require('./package.json');
const keyring = require('duniter-common').keyring;
const directory = require('./app/lib/system/directory');
const rawer = require('duniter-common').rawer;
const logger = require('./app/lib/logger').NewLogger('server');
class Server extends stream.Duplex {
    constructor(home, memoryOnly, overrideConf) {
        super({ objectMode: true });
        this.overrideConf = overrideConf;
        this.home = home;
        this.conf = ConfDTO_1.ConfDTO.mock();
        this.version = jsonpckg.version;
        this.logger = logger;
        this.rawer = rawer;
        this.paramsP = directory.getHomeParams(memoryOnly, home);
        this.MerkleService = require("./app/lib/helpers/merkle");
        this.IdentityService = new IdentityService_1.IdentityService();
        this.MembershipService = new MembershipService_1.MembershipService();
        this.PeeringService = new PeeringService_1.PeeringService(this);
        this.BlockchainService = new BlockchainService_1.BlockchainService(this);
        this.TransactionsService = new TransactionsService_1.TransactionService();
        // Create document mapping
        this.documentsMapping = {
            'identity': { action: (obj) => this.IdentityService.submitIdentity(obj), parser: parsers.parseIdentity },
            'certification': { action: (obj) => this.IdentityService.submitCertification(obj), parser: parsers.parseCertification },
            'revocation': { action: (obj) => this.IdentityService.submitRevocation(obj), parser: parsers.parseRevocation },
            'membership': { action: (obj) => this.MembershipService.submitMembership(obj), parser: parsers.parseMembership },
            'peer': { action: (obj) => this.PeeringService.submitP(obj), parser: parsers.parsePeer },
            'transaction': { action: (obj) => this.TransactionsService.processTx(obj), parser: parsers.parseTransaction },
            'block': { action: (obj) => this.BlockchainService.submitBlock(obj, true, constants.NO_FORK_ALLOWED), parser: parsers.parseBlock }
        };
    }
    // Unused, but made mandatory by Duplex interface
    _read() { }
    _write(obj, enc, writeDone) {
        return this.submit(obj, false, () => writeDone);
    }
    /**
     * Facade method to control what is pushed to the stream (we don't want it to be closed)
     * @param obj An object to be pushed to the stream.
     */
    streamPush(obj) {
        if (obj) {
            this.push(obj);
        }
    }
    getBcContext() {
        return this.BlockchainService.getContext();
    }
    plugFileSystem() {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('Plugging file system...');
            const params = yield this.paramsP;
            this.dal = new fileDAL_1.FileDAL(params);
            yield this.onPluggedFSHook();
        });
    }
    unplugFileSystem() {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('Unplugging file system...');
            yield this.dal.close();
        });
    }
    loadConf(useDefaultConf = false) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('Loading conf...');
            this.conf = yield this.dal.loadConf(this.overrideConf, useDefaultConf);
            // Default values
            this.conf.remoteipv6 = this.conf.remoteipv6 === undefined ? this.conf.ipv6 : this.conf.remoteipv6;
            this.conf.remoteport = this.conf.remoteport === undefined ? this.conf.port : this.conf.remoteport;
            this.conf.c = this.conf.c === undefined ? constants.CONTRACT.DEFAULT.C : this.conf.c;
            this.conf.dt = this.conf.dt === undefined ? constants.CONTRACT.DEFAULT.DT : this.conf.dt;
            this.conf.ud0 = this.conf.ud0 === undefined ? constants.CONTRACT.DEFAULT.UD0 : this.conf.ud0;
            this.conf.stepMax = this.conf.stepMax === undefined ? constants.CONTRACT.DEFAULT.STEPMAX : this.conf.stepMax;
            this.conf.sigPeriod = this.conf.sigPeriod === undefined ? constants.CONTRACT.DEFAULT.SIGPERIOD : this.conf.sigPeriod;
            this.conf.msPeriod = this.conf.msPeriod === undefined ? constants.CONTRACT.DEFAULT.MSPERIOD : this.conf.msPeriod;
            this.conf.sigStock = this.conf.sigStock === undefined ? constants.CONTRACT.DEFAULT.SIGSTOCK : this.conf.sigStock;
            this.conf.sigWindow = this.conf.sigWindow === undefined ? constants.CONTRACT.DEFAULT.SIGWINDOW : this.conf.sigWindow;
            this.conf.sigValidity = this.conf.sigValidity === undefined ? constants.CONTRACT.DEFAULT.SIGVALIDITY : this.conf.sigValidity;
            this.conf.msValidity = this.conf.msValidity === undefined ? constants.CONTRACT.DEFAULT.MSVALIDITY : this.conf.msValidity;
            this.conf.sigQty = this.conf.sigQty === undefined ? constants.CONTRACT.DEFAULT.SIGQTY : this.conf.sigQty;
            this.conf.idtyWindow = this.conf.idtyWindow === undefined ? constants.CONTRACT.DEFAULT.IDTYWINDOW : this.conf.idtyWindow;
            this.conf.msWindow = this.conf.msWindow === undefined ? constants.CONTRACT.DEFAULT.MSWINDOW : this.conf.msWindow;
            this.conf.xpercent = this.conf.xpercent === undefined ? constants.CONTRACT.DEFAULT.X_PERCENT : this.conf.xpercent;
            this.conf.percentRot = this.conf.percentRot === undefined ? constants.CONTRACT.DEFAULT.PERCENTROT : this.conf.percentRot;
            this.conf.powDelay = this.conf.powDelay === undefined ? constants.CONTRACT.DEFAULT.POWDELAY : this.conf.powDelay;
            this.conf.avgGenTime = this.conf.avgGenTime === undefined ? constants.CONTRACT.DEFAULT.AVGGENTIME : this.conf.avgGenTime;
            this.conf.dtDiffEval = this.conf.dtDiffEval === undefined ? constants.CONTRACT.DEFAULT.DTDIFFEVAL : this.conf.dtDiffEval;
            this.conf.medianTimeBlocks = this.conf.medianTimeBlocks === undefined ? constants.CONTRACT.DEFAULT.MEDIANTIMEBLOCKS : this.conf.medianTimeBlocks;
            this.conf.rootoffset = this.conf.rootoffset === undefined ? 0 : this.conf.rootoffset;
            this.conf.forksize = this.conf.forksize === undefined ? constants.BRANCHES.DEFAULT_WINDOW_SIZE : this.conf.forksize;
            // 1.3.X: the msPeriod = msWindow
            this.conf.msPeriod = this.conf.msPeriod === undefined ? this.conf.msWindow : this.conf.msPeriod;
            // Default keypair
            if (!this.conf.pair || !this.conf.pair.pub || !this.conf.pair.sec) {
                // Create a random key
                this.conf.pair = keyring.randomKey().json();
            }
            // Extract key pair
            this.keyPair = keyring.Key(this.conf.pair.pub, this.conf.pair.sec);
            this.sign = this.keyPair.sign;
            // Blockchain object
            this.blockchain = new DuniterBlockchain_1.DuniterBlockchain(new SqlBlockchain_1.SQLBlockchain(this.dal), this.dal);
            // Update services
            this.IdentityService.setConfDAL(this.conf, this.dal);
            this.MembershipService.setConfDAL(this.conf, this.dal);
            this.PeeringService.setConfDAL(this.conf, this.dal, this.keyPair);
            this.BlockchainService.setConfDAL(this.conf, this.dal, this.keyPair);
            this.TransactionsService.setConfDAL(this.conf, this.dal);
            return this.conf;
        });
    }
    initWithDAL() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.plugFileSystem();
            yield this.loadConf();
            yield this.initDAL();
            return this;
        });
    }
    submit(obj, isInnerWrite = false, done = null) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!obj.documentType) {
                throw 'Document type not given';
            }
            try {
                const action = this.documentsMapping[obj.documentType].action;
                let res;
                if (typeof action == 'function') {
                    // Handle the incoming object
                    res = yield action(obj);
                }
                else {
                    throw 'Unknown document type \'' + obj.documentType + '\'';
                }
                if (res) {
                    // Only emit valid documents
                    this.emit(obj.documentType, _.clone(res));
                    this.streamPush(_.clone(res));
                }
                if (done) {
                    isInnerWrite ? done(null, res) : done();
                }
                return res;
            }
            catch (err) {
                if (err && !err.uerr) {
                    // Unhandled error, display it
                    logger.debug('Document write error: ', err);
                }
                if (done) {
                    isInnerWrite ? done(err, null) : done();
                }
                else {
                    throw err;
                }
            }
        });
    }
    submitP(obj, isInnerWrite) {
        return this.submit(obj, isInnerWrite);
    }
    initDAL(conf = null) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.dal.init(this.conf);
            // Maintenance
            let head_1 = yield this.dal.bindexDAL.head(1);
            if (head_1) {
                // Case 1: b_index < block
                yield this.dal.blockDAL.exec('DELETE FROM block WHERE NOT fork AND number > ' + head_1.number);
                // Case 2: b_index > block
                const current = yield this.dal.blockDAL.getCurrent();
                const nbBlocksToRevert = (head_1.number - current.number);
                for (let i = 0; i < nbBlocksToRevert; i++) {
                    yield this.revert();
                }
            }
        });
    }
    recomputeSelfPeer() {
        return this.PeeringService.generateSelfPeer(this.conf, 0);
    }
    getCountOfSelfMadePoW() {
        return this.BlockchainService.getCountOfSelfMadePoW();
    }
    isServerMember() {
        return this.BlockchainService.isMember();
    }
    checkConfig() {
        if (!this.conf.pair) {
            throw new Error('No keypair was given.');
        }
    }
    resetHome() {
        return __awaiter(this, void 0, void 0, function* () {
            const params = yield this.paramsP;
            const myFS = params.fs;
            const rootPath = params.home;
            const existsDir = yield myFS.exists(rootPath);
            if (existsDir) {
                yield myFS.removeTree(rootPath);
            }
        });
    }
    resetAll(done) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.resetDataHook();
            yield this.resetConfigHook();
            const files = ['stats', 'cores', 'current', directory.DUNITER_DB_NAME, directory.DUNITER_DB_NAME + '.db', directory.DUNITER_DB_NAME + '.log', directory.WOTB_FILE, 'export.zip', 'import.zip', 'conf'];
            const dirs = ['blocks', 'blockchain', 'ud_history', 'branches', 'certs', 'txs', 'cores', 'sources', 'links', 'ms', 'identities', 'peers', 'indicators', 'leveldb'];
            return this.resetFiles(files, dirs, done);
        });
    }
    resetData(done = null) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.resetDataHook();
            const files = ['stats', 'cores', 'current', directory.DUNITER_DB_NAME, directory.DUNITER_DB_NAME + '.db', directory.DUNITER_DB_NAME + '.log', directory.WOTB_FILE];
            const dirs = ['blocks', 'ud_history', 'branches', 'certs', 'txs', 'cores', 'sources', 'links', 'ms', 'identities', 'peers', 'indicators', 'leveldb'];
            yield this.resetFiles(files, dirs, done);
        });
    }
    resetConf(done) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.resetConfigHook();
            const files = ['conf'];
            const dirs = [];
            return this.resetFiles(files, dirs, done);
        });
    }
    resetStats(done) {
        const files = ['stats'];
        const dirs = ['ud_history'];
        return this.resetFiles(files, dirs, done);
    }
    resetPeers(done) {
        return this.dal.resetPeers();
    }
    exportAllDataAsZIP() {
        return __awaiter(this, void 0, void 0, function* () {
            const params = yield this.paramsP;
            const rootPath = params.home;
            const myFS = params.fs;
            const archive = archiver('zip');
            if (yield myFS.exists(path.join(rootPath, 'indicators'))) {
                archive.directory(path.join(rootPath, 'indicators'), '/indicators', undefined, { name: 'indicators' });
            }
            const files = ['duniter.db', 'stats.json', 'wotb.bin'];
            for (const file of files) {
                if (yield myFS.exists(path.join(rootPath, file))) {
                    archive.file(path.join(rootPath, file), { name: file });
                }
            }
            archive.finalize();
            return archive;
        });
    }
    importAllDataFromZIP(zipFile) {
        return __awaiter(this, void 0, void 0, function* () {
            const params = yield this.paramsP;
            yield this.resetData();
            const output = unzip.Extract({ path: params.home });
            fs.createReadStream(zipFile).pipe(output);
            return new Promise((resolve, reject) => {
                output.on('error', reject);
                output.on('close', resolve);
            });
        });
    }
    cleanDBData() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.dal.cleanCaches();
            this.dal.wotb.resetWoT();
            const files = ['stats', 'cores', 'current', directory.DUNITER_DB_NAME, directory.DUNITER_DB_NAME + '.db', directory.DUNITER_DB_NAME + '.log'];
            const dirs = ['blocks', 'ud_history', 'branches', 'certs', 'txs', 'cores', 'sources', 'links', 'ms', 'identities', 'peers', 'indicators', 'leveldb'];
            return this.resetFiles(files, dirs);
        });
    }
    resetFiles(files, dirs, done = null) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const params = yield this.paramsP;
                const myFS = params.fs;
                const rootPath = params.home;
                for (const fName of files) {
                    // JSON file?
                    const existsJSON = yield myFS.exists(rootPath + '/' + fName + '.json');
                    if (existsJSON) {
                        const theFilePath = rootPath + '/' + fName + '.json';
                        yield myFS.remove(theFilePath);
                        if (yield myFS.exists(theFilePath)) {
                            throw Error('Failed to delete file "' + theFilePath + '"');
                        }
                    }
                    else {
                        // Normal file?
                        const normalFile = path.join(rootPath, fName);
                        const existsFile = yield myFS.exists(normalFile);
                        if (existsFile) {
                            yield myFS.remove(normalFile);
                            if (yield myFS.exists(normalFile)) {
                                throw Error('Failed to delete file "' + normalFile + '"');
                            }
                        }
                    }
                }
                for (const dirName of dirs) {
                    const existsDir = yield myFS.exists(rootPath + '/' + dirName);
                    if (existsDir) {
                        yield myFS.removeTree(rootPath + '/' + dirName);
                        if (yield myFS.exists(rootPath + '/' + dirName)) {
                            throw Error('Failed to delete folder "' + rootPath + '/' + dirName + '"');
                        }
                    }
                }
                done && done();
            }
            catch (e) {
                done && done(e);
                throw e;
            }
        });
    }
    disconnect() {
        return Promise.resolve(this.dal && this.dal.close());
    }
    revert() {
        return this.BlockchainService.revertCurrentBlock();
    }
    revertTo(number) {
        return __awaiter(this, void 0, void 0, function* () {
            const current = yield this.BlockchainService.current();
            for (let i = 0, count = current.number - number; i < count; i++) {
                yield this.BlockchainService.revertCurrentBlock();
            }
            if (current.number <= number) {
                logger.warn('Already reached');
            }
        });
    }
    reapplyTo(number) {
        return __awaiter(this, void 0, void 0, function* () {
            const current = yield this.BlockchainService.current();
            if (current.number == number) {
                logger.warn('Already reached');
            }
            else {
                for (let i = 0, count = number - current.number; i < count; i++) {
                    yield this.BlockchainService.applyNextAvailableFork();
                }
            }
        });
    }
    singleWritePromise(obj) {
        return this.submit(obj);
    }
    writeRaw(raw, type) {
        return __awaiter(this, void 0, void 0, function* () {
            const parser = this.documentsMapping[type] && this.documentsMapping[type].parser;
            const obj = parser.syncWrite(raw, logger);
            return yield this.singleWritePromise(obj);
        });
    }
    /*****************
     * DAEMONIZATION
     ****************/
    /**
     * Get the daemon handle. Eventually give arguments to launch a new daemon.
     * @param overrideCommand The new command to launch.
     * @param insteadOfCmd The current command to be replaced by `overrideCommand` command.
     * @returns {*} The daemon handle.
     */
    getDaemon(overrideCommand, insteadOfCmd) {
        const mainModule = process.argv[1];
        const cwd = path.resolve(mainModule, '../..');
        const argv = this.getCommand(overrideCommand, insteadOfCmd);
        return daemonize.setup({
            main: mainModule,
            name: directory.INSTANCE_NAME,
            pidfile: path.join(directory.INSTANCE_HOME, "app.pid"),
            argv,
            cwd
        });
    }
    /**
     * Return current script full command arguments except the two firsts (which are node executable + js file).
     * If the two optional `cmd` and `insteadOfCmd` parameters are given, replace `insteadOfCmd`'s value by `cmd` in
     * the script arguments.
     *
     *   Ex:
     *     * process.argv: ['/usr/bin/node', '/opt/duniter/sources/bin/duniter', 'restart', '--mdb', 'g1']
     *
     *     Then `getCommand('direct_start', 'restart') will return:
     *
     *     * ['direct_start', '--mdb', 'g1']
     *
     *     This new array is what will be given to a *fork* of current script, resulting in a new process with:
     *
     *     * process.argv: ['/usr/bin/node', '/opt/duniter/sources/bin/duniter', 'direct_start', '--mdb', 'g1']
     *
     * @param cmd
     * @param insteadOfCmd
     * @returns {*}
     */
    getCommand(cmd, insteadOfCmd) {
        if (insteadOfCmd) {
            // Return the same command args, except the command `insteadOfCmd` which is replaced by `cmd`
            return process.argv.slice(2).map((arg) => {
                if (arg == insteadOfCmd) {
                    return cmd;
                }
                else {
                    return arg;
                }
            });
        }
        else {
            // Return the exact same args (generally for stop/status commands)
            return process.argv.slice(2);
        }
    }
    /**
     * Retrieve the last linesQuantity lines from the log file.
     * @param linesQuantity
     */
    getLastLogLines(linesQuantity) {
        return this.dal.getLogContent(linesQuantity);
    }
    /*****************
     * MODULES PLUGS
     ****************/
    /**
     * Default endpoint. To be overriden by a module to specify another endpoint value (for ex. BMA).
     */
    getMainEndpoint() {
        return Promise.resolve('DEFAULT_ENDPOINT');
    }
    /**
     * Default WoT incoming data for new block. To be overriden by a module.
     */
    generatorGetJoinData() {
        return Promise.resolve({});
    }
    /**
     * Default WoT incoming certifications for new block, filtering wrong certs. To be overriden by a module.
     */
    generatorComputeNewCerts() {
        return Promise.resolve({});
    }
    /**
     * Default WoT transforming method for certs => links. To be overriden by a module.
     */
    generatorNewCertsToLinks() {
        return Promise.resolve({});
    }
    /**
     * Default hook on file system plugging. To be overriden by module system.
     */
    onPluggedFSHook() {
        return Promise.resolve({});
    }
    /**
     * Default hook on data reset. To be overriden by module system.
     */
    resetDataHook() {
        return Promise.resolve({});
    }
    /**
     * Default hook on data reset. To be overriden by module system.
     */
    resetConfigHook() {
        return Promise.resolve({});
    }
}
exports.Server = Server;
//# sourceMappingURL=server.js.map