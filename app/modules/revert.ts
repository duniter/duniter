import {ConfDTO} from "../lib/dto/ConfDTO"
module.exports = {
  duniter: {
    cli: [{
      name: 'revert [count]',
      desc: 'Revert (undo + remove) the top [count] blocks from the blockchain. EXPERIMENTAL',
      preventIfRunning: true,

      onDatabaseExecute: async (server:any, conf:ConfDTO, program:any, params:any) => {
        const count = params[0];
        const logger = server.logger;
        try {
          for (let i = 0; i < count; i++) {
            await server.revert();
          }
        } catch (err) {
          logger.error('Error during revert:', err);
        }
        // Save DB
        await server.disconnect();
      }
    },{
      name: 'revert-to [number]',
      desc: 'Revert (undo + remove) top blockchain blocks until block #[number] is reached. EXPERIMENTAL',
      onDatabaseExecute: async (server:any, conf:ConfDTO, program:any, params:any) => {
        const number = params[0];
        const logger = server.logger;
        try {
          await server.revertTo(number);
        } catch (err) {
          logger.error('Error during revert:', err);
        }
        // Save DB
        if (server) {
          await server.disconnect();
        }
      }
    }]
  }
}
