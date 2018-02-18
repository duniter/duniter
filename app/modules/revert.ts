// Source file from duniter: Crypto-currency software to manage libre currency such as Ğ1
// Copyright (C) 2018  Cedric Moreau <cem.moreau@gmail.com>
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.

import {ConfDTO} from "../lib/dto/ConfDTO"
import {Server} from "../../server"

module.exports = {
  duniter: {
    cli: [{
      name: 'revert [count]',
      desc: 'Revert (undo + remove) the top [count] blocks from the blockchain. EXPERIMENTAL',
      preventIfRunning: true,

      onDatabaseExecute: async (server:Server, conf:ConfDTO, program:any, params:any) => {
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
      onDatabaseExecute: async (server:Server, conf:ConfDTO, program:any, params:any) => {
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
