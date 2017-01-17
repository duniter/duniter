"use strict";

const co = require('co');

module.exports = {
  duniter: {
    cli: [{
      name: 'revert [count]',
      desc: 'Revert (undo + remove) the top [count] blocks from the blockchain. EXPERIMENTAL',
      onDatabaseExecute: (server, conf, program, params) => co(function*() {
        const count = params[0];
        const logger = server.logger;
        try {
          for (let i = 0; i < count; i++) {
            yield server.revert();
          }
        } catch (err) {
          logger.error('Error during revert:', err);
        }
        // Save DB
        yield server.disconnect();
      })
    },{
      name: 'revert-to [number]',
      desc: 'Revert (undo + remove) top blockchain blocks until block #[number] is reached. EXPERIMENTAL',
      onDatabaseExecute: (server, conf, program, params) => co(function*() {
        const number = params[0];
        const logger = server.logger;
        try {
          yield server.revertTo(number);
        } catch (err) {
          logger.error('Error during revert:', err);
        }
        // Save DB
        if (server) {
          yield server.disconnect();
        }
      })
    }]
  }
}
