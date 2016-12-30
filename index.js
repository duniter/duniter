"use strict";

const co = require('co');
const _ = require('underscore');
const Server = require('./server');
const logger = require('./app/lib/logger')('duniter');

module.exports = function (dbConf, overConf) {
  return new Server(dbConf, overConf);
};

module.exports.statics = {

  logger: logger,

  /**************
   * Duniter used by its Command Line Interface
   * @param onService A callback for external usage when Duniter server is ready
   */
  cli: (onService) => {

    const cli = require('./app/cli');

    // Specific errors handling
    process.on('uncaughtException', (err) => {
      // Dunno why this specific exception is not caught
      if (err.code !== "EADDRNOTAVAIL" && err.code !== "EINVAL") {
        logger.error(err);
        process.exit(1);
      }
    });

    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled rejection: ' + reason);
    });

    return co(function*() {
      try {
        // Prepare the command
        const command = cli(process.argv);
        // If ever the process gets interrupted
        process.on('SIGINT', () => {
          co(function*() {
            yield command.closeCommand();
            process.exit();
          });
        });
        // Executes the command
        yield command.execute(onService);
        process.exit();
      } catch (e) {
        logger.error(e);
        process.exit(1);
      }
    });

  },

  autoStack: () => {

    const cli = require('./app/cli');
    const stack = {

      registerDependency: (requiredObject) => {
        for (const command of (requiredObject.duniter.cli || [])) {
          cli.addCommand({ name: command.name, desc: command.desc }, command.requires, command.promiseCallback);
        }
      },

      executeStack: () => {

        // Specific errors handling
        process.on('uncaughtException', (err) => {
          // Dunno why this specific exception is not caught
          if (err.code !== "EADDRNOTAVAIL" && err.code !== "EINVAL") {
            logger.error(err);
            process.exit(1);
          }
        });

        process.on('unhandledRejection', (reason) => {
          logger.error('Unhandled rejection: ' + reason);
        });

        return co(function*() {
          try {
            // Prepare the command
            const command = cli(process.argv);
            // If ever the process gets interrupted
            process.on('SIGINT', () => {
              co(function*() {
                yield command.closeCommand();
                process.exit();
              });
            });
            // Executes the command
            yield command.execute();
            process.exit();
          } catch (e) {
            logger.error(e);
            process.exit(1);
          }
        });
      }
    };

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

    for (const duniterModule of duniterModules) {
      stack.registerDependency(duniterModule.required);
    }

    return stack;
  }
};
