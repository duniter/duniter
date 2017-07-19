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
const cli_1 = require("./app/cli");
const stream = require("stream");
const server_1 = require("./server");
const path = require('path');
const _ = require('underscore');
const directory = require('./app/lib/system/directory');
const constants = require('./app/lib/constants');
const logger = require('./app/lib/logger').NewLogger('duniter');
const configDependency = require('./app/modules/config');
const wizardDependency = require('./app/modules/wizard');
const resetDependency = require('./app/modules/reset');
const checkConfDependency = require('./app/modules/check-config');
const exportBcDependency = require('./app/modules/export-bc');
const reapplyDependency = require('./app/modules/reapply');
const revertDependency = require('./app/modules/revert');
const daemonDependency = require('./app/modules/daemon');
const pSignalDependency = require('./app/modules/peersignal');
const routerDependency = require('./app/modules/router');
const pluginDependency = require('./app/modules/plugin');
const proverDependency = require('./app/modules/prover').ProverDependency;
class Stacks {
    static quickRun(...args) {
        return __awaiter(this, void 0, void 0, function* () {
            const deps = Array.from(args).map((f, index) => {
                const canonicalPath = path.resolve(f);
                return {
                    name: 'duniter-quick-module-' + index,
                    required: require(canonicalPath)
                };
            });
            const stack = Stacks.autoStack(deps);
            let res;
            try {
                res = yield stack.executeStack(Stacks.quickRunGetArgs());
            }
            catch (e) {
                console.error(e);
            }
            Stacks.onRunDone();
            return res;
        });
    }
    static quickRunGetArgs() {
        return process.argv.slice();
    }
    static onRunDone() {
        return Stacks.todoOnRunDone();
    }
    static autoStack(priorityModules) {
        const duniterModules = [];
        let duniterDeps = [];
        try {
            const pjson = require(path.resolve('./package.json'));
            // Look for compliant packages
            const prodDeps = Object.keys(pjson.dependencies || {});
            const devDeps = Object.keys(pjson.devDependencies || {});
            duniterDeps = prodDeps.concat(devDeps);
        }
        catch (e) { }
        for (const dep of duniterDeps) {
            try {
                const required = require(dep);
                if (required.duniter) {
                    duniterModules.push({
                        name: dep,
                        required
                    });
                }
            }
            catch (e) { }
        }
        // The final stack
        return new Stack((priorityModules || []).concat(PRODUCTION_DEPENDENCIES).concat(duniterModules));
    }
}
Stacks.todoOnRunDone = () => process.exit();
const MINIMAL_DEPENDENCIES = [
    { name: 'duniter-config', required: configDependency }
];
const DEFAULT_DEPENDENCIES = MINIMAL_DEPENDENCIES.concat([
    { name: 'duniter-wizard', required: wizardDependency },
    { name: 'duniter-reset', required: resetDependency },
    { name: 'duniter-chkconf', required: checkConfDependency },
    { name: 'duniter-exportbc', required: exportBcDependency },
    { name: 'duniter-reapply', required: reapplyDependency },
    { name: 'duniter-revert', required: revertDependency },
    { name: 'duniter-daemon', required: daemonDependency },
    { name: 'duniter-psignal', required: pSignalDependency },
    { name: 'duniter-router', required: routerDependency },
    { name: 'duniter-plugin', required: pluginDependency },
    { name: 'duniter-prover', required: proverDependency }
]);
const PRODUCTION_DEPENDENCIES = DEFAULT_DEPENDENCIES.concat([]);
module.exports = function (home, memory, overConf) {
    return new server_1.Server(home, memory, overConf);
};
module.exports.statics = {
    logger: logger,
    /**
     * Creates a new stack with minimal registrations only.
     */
    minimalStack: () => new Stack(MINIMAL_DEPENDENCIES),
    /**
     * Creates a new stack with core registrations only.
     */
    simpleStack: () => new Stack(DEFAULT_DEPENDENCIES),
    /**
     * Creates a new stack pre-registered with compliant modules found in package.json
     */
    autoStack: (...args) => {
        return Stacks.autoStack.apply(null, args);
    },
    quickRun: (path) => {
        return Stacks.quickRun(path);
    },
    setOnRunDone: (f) => {
        return Stacks.todoOnRunDone = f;
    }
};
class Stack {
    constructor(dependencies) {
        this.dependencies = dependencies;
        this.definitions = [];
        this.streams = {
            input: [],
            process: [],
            output: [],
            neutral: []
        };
        this.cli = cli_1.ExecuteCommand();
        this.configLoadingCallbacks = [];
        this.configBeforeSaveCallbacks = [];
        this.resetDataHooks = [];
        this.resetConfigHooks = [];
        this.INPUT = new InputStream();
        this.PROCESS = new ProcessStream();
        this.loaded = {};
        this.wizardTasks = {};
        // We register the initial dependencies right now. Others can be added thereafter.
        for (const dep of dependencies) {
            this.registerDependency(dep.required, dep.name);
        }
    }
    // Part of modules API
    getModule(name) {
        return this.loaded[name];
    }
    registerDependency(requiredObject, name) {
        if (name && this.loaded[name]) {
            // Do not try to load it twice
            return;
        }
        this.loaded[name] = requiredObject;
        const def = requiredObject.duniter;
        this.definitions.push(def);
        for (const opt of (def.cliOptions || [])) {
            this.cli.addOption(opt.value, opt.desc, opt.parser);
        }
        for (const command of (def.cli || [])) {
            this.cli.addCommand({
                name: command.name,
                desc: command.desc
            }, (...args) => this.processCommand.apply(this, [command].concat(args)));
        }
        /**
         * Configuration injection
         * -----------------------
         */
        if (def.config) {
            if (def.config.onLoading) {
                this.configLoadingCallbacks.push(def.config.onLoading);
            }
            // Before the configuration is saved, the module can make some injection/cleaning
            if (def.config.beforeSave) {
                this.configBeforeSaveCallbacks.push(def.config.beforeSave);
            }
        }
        /**
         * Reset data/config injection
         * -----------------------
         */
        if (def.onReset) {
            if (def.onReset.data) {
                this.resetDataHooks.push(def.onReset.data);
            }
            // Before the configuration is saved, the module can make some injection/cleaning
            if (def.onReset.config) {
                this.resetConfigHooks.push(def.onReset.config);
            }
        }
        /**
         * Wizard injection
         * -----------------------
         */
        if (def.wizard) {
            const tasks = Object.keys(def.wizard);
            for (const name of tasks) {
                this.wizardTasks[name] = def.wizard[name];
            }
        }
    }
    ;
    processCommand(...args) {
        return __awaiter(this, void 0, void 0, function* () {
            const command = args[0];
            const program = args[1];
            const params = args.slice(2);
            params.pop(); // Don't need the command argument
            const dbName = program.mdb;
            const dbHome = program.home;
            const home = directory.getHome(dbName, dbHome);
            if (command.logs === false) {
                logger.mute();
            }
            // Add log files for this instance (non-memory instances only)
            if (!program.memory) {
                logger.addHomeLogs(home, program.loglevel);
            }
            const server = new server_1.Server(home, program.memory === true, commandLineConf(program));
            // If ever the process gets interrupted
            let isSaving = false;
            process.on('SIGINT', () => __awaiter(this, void 0, void 0, function* () {
                if (!isSaving) {
                    isSaving = true;
                    // Save DB
                    try {
                        yield server.disconnect();
                        process.exit();
                    }
                    catch (e) {
                        logger.error(e);
                        process.exit(3);
                    }
                }
            }));
            // Config or Data reset hooks
            server.resetDataHook = () => __awaiter(this, void 0, void 0, function* () {
                for (const callback of this.resetDataHooks) {
                    yield callback(server.conf, program, logger, server.dal.confDAL);
                }
            });
            server.resetConfigHook = () => __awaiter(this, void 0, void 0, function* () {
                for (const callback of this.resetConfigHooks) {
                    yield callback(server.conf, program, logger, server.dal.confDAL);
                }
            });
            // Initialize server (db connection, ...)
            try {
                server.onPluggedFSHook = () => __awaiter(this, void 0, void 0, function* () {
                    // Register the configuration hook for loading phase (overrides the loaded data)
                    server.dal.loadConfHook = (conf) => __awaiter(this, void 0, void 0, function* () {
                        // Loading injection
                        for (const callback of this.configLoadingCallbacks) {
                            yield callback(conf, program, logger, server.dal.confDAL);
                        }
                    });
                    // Register the configuration hook for saving phase (overrides the saved data)
                    server.dal.saveConfHook = (conf) => __awaiter(this, void 0, void 0, function* () {
                        const clonedConf = _.clone(conf);
                        for (const callback of this.configBeforeSaveCallbacks) {
                            yield callback(clonedConf, program, logger, server.dal.confDAL);
                        }
                        return clonedConf;
                    });
                });
                yield server.plugFileSystem();
                const conf = yield server.loadConf();
                // Eventually change the log level
                // Add log files for this instance (non-memory instances only)
                if (!program.memory) {
                    logger.addHomeLogs(home, conf.loglevel);
                }
                // Auto-configuration default
                yield configure(program, server, server.conf || {});
                // Autosave conf
                try {
                    yield server.dal.saveConf(conf);
                    logger.debug("Configuration saved.");
                }
                catch (e) {
                    logger.error("Configuration could not be saved: " + e);
                    throw Error(e);
                }
                const daemon = server.getDaemon();
                if (command.preventIfRunning && daemon.status()) {
                    throw 'Your node is currently running. Please stop it and relaunch your command.';
                }
                // First possible class of commands: post-config
                if (command.onConfiguredExecute) {
                    return yield command.onConfiguredExecute(server, conf, program, params, this.wizardTasks, this);
                }
                // Second possible class of commands: post-service
                yield server.initDAL(conf);
                /**
                 * Service injection
                 * -----------------
                 */
                for (const def of this.definitions) {
                    if (def.service) {
                        // To feed data coming from some I/O (network, disk, other module, ...)
                        if (def.service.input) {
                            this.streams.input.push(def.service.input(server, conf, logger));
                        }
                        // To handle data this has been submitted by INPUT stream
                        if (def.service.process) {
                            this.streams.process.push(def.service.process(server, conf, logger));
                        }
                        // To handle data this has been validated by PROCESS stream
                        if (def.service.output) {
                            this.streams.output.push(def.service.output(server, conf, logger));
                        }
                        // Special service which does not stream anything particular (ex.: piloting the `server` object)
                        if (def.service.neutral) {
                            this.streams.neutral.push(def.service.neutral(server, conf, logger));
                        }
                    }
                }
                // All inputs write to global INPUT stream
                for (const module of this.streams.input)
                    module.pipe(this.INPUT);
                // All processes read from global INPUT stream
                for (const module of this.streams.process)
                    this.INPUT.pipe(module);
                // All processes write to global PROCESS stream
                for (const module of this.streams.process)
                    module.pipe(this.PROCESS);
                // All ouputs read from global PROCESS stream
                for (const module of this.streams.output)
                    this.PROCESS.pipe(module);
                return yield command.onDatabaseExecute(server, conf, program, params, 
                // Start services and streaming between them
                () => __awaiter(this, void 0, void 0, function* () {
                    const modules = this.streams.input.concat(this.streams.process).concat(this.streams.output).concat(this.streams.neutral);
                    yield Promise.all(modules.map((module) => module.startService()));
                }), 
                // Stop services and streaming between them
                () => __awaiter(this, void 0, void 0, function* () {
                    const modules = this.streams.input.concat(this.streams.process).concat(this.streams.output).concat(this.streams.neutral);
                    // Any streaming module must implement a `stopService` method
                    yield Promise.all(modules.map((module) => module.stopService()));
                    // // Stop reading inputs
                    // for (const module of streams.input) module.unpipe();
                    // Stop reading from global INPUT
                    // INPUT.unpipe();
                    // for (const module of streams.process) module.unpipe();
                    // // Stop reading from global PROCESS
                    // PROCESS.unpipe();
                }), this);
            }
            catch (e) {
                server.disconnect();
                throw e;
            }
        });
    }
    executeStack(argv) {
        // Trace these errors
        process.on('unhandledRejection', (reason) => {
            logger.error('Unhandled rejection: ' + reason);
            logger.error(reason);
        });
        // Executes the command
        return this.cli.execute(argv);
    }
}
function commandLineConf(program, conf = {}) {
    conf = conf || {};
    conf.sync = conf.sync || {};
    const cli = {
        currency: program.currency,
        cpu: program.cpu,
        server: {
            port: program.port,
        },
        db: {
            mport: program.mport,
            mdb: program.mdb,
            home: program.home
        },
        logs: {
            http: program.httplogs,
            nohttp: program.nohttplogs
        },
        endpoints: [],
        rmEndpoints: [],
        isolate: program.isolate,
        forksize: program.forksize,
        nofork: program.nofork,
        timeout: program.timeout
    };
    // Update conf
    if (cli.currency)
        conf.currency = cli.currency;
    if (cli.server.port)
        conf.port = cli.server.port;
    if (cli.cpu)
        conf.cpu = Math.max(0.01, Math.min(1.0, cli.cpu));
    if (cli.logs.http)
        conf.httplogs = true;
    if (cli.logs.nohttp)
        conf.httplogs = false;
    if (cli.db.mport)
        conf.mport = cli.db.mport;
    if (cli.db.home)
        conf.home = cli.db.home;
    if (cli.db.mdb)
        conf.mdb = cli.db.mdb;
    if (cli.isolate)
        conf.isolate = cli.isolate;
    if (cli.timeout)
        conf.timeout = cli.timeout;
    if (cli.forksize != null)
        conf.forksize = cli.forksize;
    return conf;
}
function configure(program, server, conf) {
    return __awaiter(this, void 0, void 0, function* () {
        if (typeof server == "string" || typeof conf == "string") {
            throw constants.ERRORS.CLI_CALLERR_CONFIG;
        }
        // Try to add an endpoint if provided
        if (program.addep) {
            if (conf.endpoints.indexOf(program.addep) === -1) {
                conf.endpoints.push(program.addep);
            }
            // Remove it from "to be removed" list
            const indexInRemove = conf.rmEndpoints.indexOf(program.addep);
            if (indexInRemove !== -1) {
                conf.rmEndpoints.splice(indexInRemove, 1);
            }
        }
        // Try to remove an endpoint if provided
        if (program.remep) {
            if (conf.rmEndpoints.indexOf(program.remep) === -1) {
                conf.rmEndpoints.push(program.remep);
            }
            // Remove it from "to be added" list
            const indexInToAdd = conf.endpoints.indexOf(program.remep);
            if (indexInToAdd !== -1) {
                conf.endpoints.splice(indexInToAdd, 1);
            }
        }
    });
}
/**
 * InputStream is a special stream this filters what passes in.
 * Only DUP-like documents should be treated by the processing tools, to avoid JSON injection and save CPU cycles.
 * @constructor
 */
class InputStream extends stream.Transform {
    constructor() {
        super({ objectMode: true });
    }
    _write(str, enc, done) {
        if (typeof str === 'string') {
            // Keep only strings
            const matches = str.match(/Type: (.*)\n/);
            if (matches && matches[1].match(/(Block|Membership|Identity|Certification|Transaction|Peer)/)) {
                const type = matches[1].toLowerCase();
                this.push({ type, doc: str });
            }
        }
        done && done();
    }
    ;
}
class ProcessStream extends stream.Transform {
    constructor() {
        super({ objectMode: true });
    }
    _write(obj, enc, done) {
        // Never close the stream
        if (obj !== undefined && obj !== null) {
            this.push(obj);
        }
        done && done();
    }
    ;
}
//# sourceMappingURL=index.js.map