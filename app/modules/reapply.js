"use strict";

const co = require('co');

module.exports = {
  duniter: {
    cli: [{
      name: 'reapply-to [number]',
      desc: 'Reapply reverted blocks until block #[number] is reached. EXPERIMENTAL',
      onDatabaseExecute: (server, conf, program, params) => co(function*() {
        const number = params[0];
        const logger = server.logger;
        try {
          yield server.reapplyTo(number);
        } catch (err) {
          logger.error('Error during reapply:', err);
        }
        // Save DB
        if (server) {
          yield server.disconnect();
        }
      })
    }]
  }
}
