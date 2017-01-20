"use strict";

const Q = require('q');
const co = require('co');
const es = require('event-stream');
const util = require('util');
const stream = require('stream');
const _ = require('underscore');
const Server = require('./server');
const directory = require('./app/lib/system/directory');
const constants = require('./app/lib/constants');
const wizard = require('./app/lib/wizard');
const logger = require('./app/lib/logger')('duniter');

const configDependency    = require('./app/modules/config');
const wizardDependency    = require('./app/modules/wizard');
const resetDependency     = require('./app/modules/reset');
const checkConfDependency = require('./app/modules/check-config');
const exportBcDependency  = require('./app/modules/export-bc');
const reapplyDependency   = require('./app/modules/reapply');
const revertDependency    = require('./app/modules/revert');
const daemonDependency    = require('./app/modules/daemon');
const pSignalDependency   = require('./app/modules/peersignal');
const proverDependency    = require('duniter-prover');//require('./app/modules/prover');
const routerDependency    = require('./app/modules/router');

const MINIMAL_DEPENDENCIES = [
  { name: 'duniter-config',    required: configDependency }
];

const DEFAULT_DEPENDENCIES = MINIMAL_DEPENDENCIES.concat([
  { name: 'duniter-wizard',    required: wizardDependency },
  { name: 'duniter-reset',     required: resetDependency },
  { name: 'duniter-chkconf',   required: checkConfDependency },
  { name: 'duniter-exportbc',  required: exportBcDependency },
  { name: 'duniter-reapply',   required: reapplyDependency },
  { name: 'duniter-revert',    required: revertDependency },
  { name: 'duniter-daemon',    required: daemonDependency },
  { name: 'duniter-psignal',   required: pSignalDependency },
  { name: 'duniter-router',    required: routerDependency }
]);

const PRODUCTION_DEPENDENCIES = DEFAULT_DEPENDENCIES.concat([
  { name: 'duniter-prover',   required: proverDependency }
]);

module.exports = function (home, memory, overConf) {
  return new Server(home, memory, overConf);
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
  autoStack: (priorityModules) => {
    const pjson = require('./package.json');
    const duniterModules = [];

    // Look for compliant packages
    const prodDeps = Object.keys(pjson.dependencies);
    const devDeps = Object.keys(pjson.devDependencies);
    const duniterDeps = _.filter(prodDeps.concat(devDeps), (dep) => dep.match(/^duniter-/));
    for(const dep of duniterDeps) {
      const required = require(dep);
      if (required.duniter) {
        duniterModules.push({
          name: dep,
          required
        });
      }
    }

    // The final stack
    return new Stack((priorityModules || []).concat(PRODUCTION_DEPENDENCIES).concat(duniterModules));
  }
};

function Stack(dependencies) {

  const that = this;
  const cli = require('./app/cli')();
  const configLoadingCallbacks = [];
  const configBeforeSaveCallbacks = [];
  const INPUT = new InputStream();
  const PROCESS = new ProcessStream();
  const loaded = {};
  const wizardTasks = {};

  const definitions = [];
  const streams = {
    input: [],
    process: [],
    output: [],
    neutral: []
  };

  this.registerDependency = (requiredObject, name) => {
    if (name && loaded[name]) {
      // Do not try to load it twice
      return;
    }
    loaded[name] = true;
    const def = requiredObject.duniter;
    definitions.push(def);
    for (const opt of (def.cliOptions || [])) {
      cli.addOption(opt.value, opt.desc, opt.parser);
    }
    for (const command of (def.cli || [])) {
      cli.addCommand({
        name: command.name,
        desc: command.desc
      }, (...args) => that.processCommand.apply(null, [command].concat(args)));
    }

    /**
     * Configuration injection
     * -----------------------
     */
    if (def.config) {
      if (def.config.onLoading) {
        configLoadingCallbacks.push(def.config.onLoading);
      }
      // Before the configuration is saved, the module can make some injection/cleaning
      if (def.config.beforeSave) {
        configBeforeSaveCallbacks.push(def.config.beforeSave);
      }
    }

    /**
     * Wizard injection
     * -----------------------
     */
    if (def.wizard) {
      const tasks = Object.keys(def.wizard);
      for (const name of tasks) {
        wizardTasks[name] = def.wizard[name];
      }
    }
  };

  this.processCommand = (...args) => co(function*() {
    const command = args[0];
    const program = args[1];
    const params  = args.slice(2);
    params.pop(); // Don't need the command argument

    const dbName = program.mdb;
    const dbHome = program.home;
    const home = directory.getHome(dbName, dbHome);

    if (command.logs === false) {
      logger.mute();
    }

    // Add log files for this instance
    logger.addHomeLogs(home);

    const server = new Server(home, program.memory === true, commandLineConf(program));

    // If ever the process gets interrupted
    let isSaving = false;
    process.on('SIGINT', () => {
      co(function*() {
        if (!isSaving) {
          isSaving = true;
          // Save DB
          try {
            yield server.disconnect();
            process.exit();
          } catch (e) {
            logger.error(e);
            process.exit(3);
          }
        }
      });
    });

    // Initialize server (db connection, ...)
    try {
      yield server.plugFileSystem();

      // Register the configuration hook for loading phase (overrides the loaded data)
      server.dal.loadConfHook = (conf) => co(function*() {
        // Loading injection
        for (const callback of configLoadingCallbacks) {
          yield callback(conf, program, logger);
        }
      });

      // Register the configuration hook for saving phase (overrides the saved data)
      server.dal.saveConfHook = (conf) => co(function*() {
        const clonedConf = _.clone(conf);
        for (const callback of configBeforeSaveCallbacks) {
          yield callback(clonedConf, program, logger);
        }
        return clonedConf;
      });

      const conf = yield server.loadConf();
      // Auto-configuration default
      yield configure(program, server, server.conf || {});
      // Autosave conf
      try {
        yield server.dal.saveConf(conf);
        logger.debug("Configuration saved.");
      } catch (e) {
        logger.error("Configuration could not be saved: " + e);
        throw Error(e);
      }
      // First possible class of commands: post-config
      if (command.onConfiguredExecute) {
        return yield command.onConfiguredExecute(server, conf, program, params, wizardTasks);
      }
      // Second possible class of commands: post-service
      yield server.initDAL();

      /**
       * Service injection
       * -----------------
       */
      for (const def of definitions) {
        if (def.service) {
          // To feed data coming from some I/O (network, disk, other module, ...)
          if (def.service.input) {
            streams.input.push(def.service.input(server, conf, logger));
          }
          // To handle data that has been submitted by INPUT stream
          if (def.service.process) {
            streams.process.push(def.service.process(server, conf, logger));
          }
          // To handle data that has been validated by PROCESS stream
          if (def.service.output) {
            streams.output.push(def.service.output(server, conf, logger));
          }
          // Special service which does not stream anything particular (ex.: piloting the `server` object)
          if (def.service.neutral) {
            streams.neutral.push(def.service.neutral(server, conf, logger));
          }
        }
      }
      // All inputs write to global INPUT stream
      for (const module of streams.input) module.pipe(INPUT);
      // All processes read from global INPUT stream
      for (const module of streams.process) INPUT.pipe(module);
      // All processes write to global PROCESS stream
      for (const module of streams.process) module.pipe(PROCESS);
      // All ouputs read from global PROCESS stream
      for (const module of streams.output) PROCESS.pipe(module);

      return yield command.onDatabaseExecute(server, conf, program, params,

        // Start services and streaming between them
        () => co(function*() {
          // Any streaming module must implement a `startService` method
          for (const m of streams.input) {
            yield m.startService();
          }
          const modules = [].concat(streams.process).concat(streams.output).concat(streams.neutral);
          yield modules.map(module => module.startService());
        }),

        // Stop services and streaming between them
        () => co(function*() {
          const modules = streams.input.concat(streams.process).concat(streams.output);
          // Any streaming module must implement a `stopService` method
          yield modules.map(module => module.stopService());
          // // Stop reading inputs
          // for (const module of streams.input) module.unpipe();
          // Stop reading from global INPUT
          // INPUT.unpipe();
          // for (const module of streams.process) module.unpipe();
          // // Stop reading from global PROCESS
          // PROCESS.unpipe();
        }));
    } catch (e) {
      server.disconnect();
      throw e;
    }
  });

  this.executeStack = (argv) => {

    // Trace these errors
    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled rejection: ' + reason);
      logger.error(reason);
    });

    // Executes the command
    return cli.execute(argv);
  };

  // We register the initial dependencies right now. Others can be added thereafter.
  for (const dep of dependencies) {
    that.registerDependency(dep.required, dep.name);
  }
}

function commandLineConf(program, conf) {

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
  if (cli.currency)                         conf.currency = cli.currency;
  if (cli.server.port)                      conf.port = cli.server.port;
  if (cli.cpu)                              conf.cpu = Math.max(0.01, Math.min(1.0, cli.cpu));
  if (cli.logs.http)                        conf.httplogs = true;
  if (cli.logs.nohttp)                      conf.httplogs = false;
  if (cli.db.mport)                         conf.mport = cli.db.mport;
  if (cli.db.home)                          conf.home = cli.db.home;
  if (cli.db.mdb)                           conf.mdb = cli.db.mdb;
  if (cli.isolate)                          conf.isolate = cli.isolate;
  if (cli.timeout)                          conf.timeout = cli.timeout;
  if (cli.forksize != null)                 conf.forksize = cli.forksize;

  return conf;
}

function configure(program, server, conf) {
  return co(function *() {
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
 * InputStream is a special stream that filters what passes in.
 * Only DUP-like documents should be treated by the processing tools, to avoid JSON injection and save CPU cycles.
 * @constructor
 */
function InputStream() {

  const that = this;

  stream.Transform.call(this, { objectMode: true });

  this._write = function (str, enc, done) {
    if (typeof str === 'string') {
      // Keep only strings
      const matches = str.match(/Type: (.*)\n/);
      if (matches && matches[1].match(/(Block|Membership|Identity|Certification|Transaction|Peer)/)) {
        const type = matches[1].toLowerCase();
        that.push({ type, doc: str });
      }
    }
    done && done();
  };
}

function ProcessStream() {

  const that = this;

  stream.Transform.call(this, { objectMode: true });

  this._write = function (obj, enc, done) {
    // Never close the stream
    if (obj !== undefined && obj !== null) {
      that.push(obj);
    }
    done && done();
  };
}

util.inherits(InputStream, stream.Transform);
util.inherits(ProcessStream, stream.Transform);
