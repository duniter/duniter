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

const Table = require('cli-table');

module.exports = {
  duniter: {
    cli: [{
      name: 'dump [what] [name]',
      desc: 'Dumps data of the blockchain.',
      logs: false,
      preventIfRunning: true,

      onDatabaseExecute: async (server:Server, conf:ConfDTO, program:any, params:any) => {
        const what: string = params[0] || ''
        const name: string = params[1] || ''
        switch (what) {

          case 'table':
            let rows: any[]
            switch (name) {
              case 'i_index':
                rows = await server.dal.iindexDAL.findRawWithOrder({}, [['writtenOn', false], ['wotb_id', false]])
                dump(rows, (program.dbgOmitCols || "").split(',').concat('index', 'meta', '$loki', 'writtenOn', 'age'))
                break
              case 'm_index':
                rows = await server.dal.mindexDAL.findRawWithOrder({}, [['writtenOn', false], ['pub', false]])
                dump(rows, ['op','pub','created_on','written_on','expires_on','expired_on','revokes_on','revoked_on','leaving','revocation','chainable_on'])
                break
              case 'c_index':
                rows = await server.dal.cindexDAL.findRawWithOrder({}, [['writtenOn', false], ['issuer', false], ['receiver', false]])
                dump(rows, ['op','issuer','receiver','created_on','written_on','sig','expires_on','expired_on','chainable_on','from_wid','to_wid'])
                break
              case 's_index':
                rows = await server.dal.sindexDAL.findRawWithOrder({}, [['writtenOn', false], ['identifier', false], ['pos', false]])
                dump(rows, ['op','tx','identifier','pos','created_on','written_on','written_time','amount','base','locktime','consumed','conditions'])
                break
              default:
                console.error(`Unknown dump table ${name}`)
                break
            }
            break

          default:
            console.error(`Unknown dump ${what}`)
            break
        }
        // Save DB
        await server.disconnect();
      }
    }]
  }
}

function dump(rows: any[], columns: string[]) {
  // Table columns
  const t = new Table({
    head: columns
  });
  for (const row of rows) {
    t.push(columns.map((c) => {
      if (row[c] === null) {
        return "NULL"
      }
      else if (row[c] === undefined) {
        return 'NULL'
      }
      else if (typeof row[c] === 'boolean') {
        return row[c] ? 1 : 0
      }
      return row[c]
    }));
  }
  try {
    const dumped = t.toString()
    console.log(dumped)
  } catch (e) {
    console.error(e)
  }
}
