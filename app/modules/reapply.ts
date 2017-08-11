"use strict";
import {ConfDTO} from "../lib/dto/ConfDTO"

module.exports = {
  duniter: {
    cli: [{
      name: 'reapply-to [number]',
      desc: 'Reapply reverted blocks until block #[number] is reached. EXPERIMENTAL',
      preventIfRunning: true,
      onDatabaseExecute: async (server:any, conf:ConfDTO, program:any, params:any) => {
        const number = params[0];
        const logger = server.logger;
        try {
          await server.reapplyTo(number);
        } catch (err) {
          logger.error('Error during reapply:', err);
        }
        // Save DB
        if (server) {
          await server.disconnect();
        }
      }
    }]
  }
}
