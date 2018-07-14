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

import {Server} from "../../server"

const constants = require('../lib/constants');
const wizard = require('../lib/wizard');

module.exports = {
  duniter: {

    cli: [{
      name: 'check-config',
      desc: 'Checks the node\'s configuration',

      onConfiguredExecute: async (server:Server) => {
        await server.checkConfig()
        const logger = require('../lib/logger').NewLogger('wizard')
        logger.warn('Configuration seems correct.');
      }
    }]
  }
}
