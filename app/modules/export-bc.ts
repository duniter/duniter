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
import {BlockDTO} from "../lib/dto/BlockDTO"

module.exports = {
  duniter: {
    cli: [{
      name: 'export-bc [upto]',
      desc: 'Exports the whole blockchain as JSON array, up to [upto] block number (excluded).',
      logs: false,
      onDatabaseExecute: async (server:Server, conf:ConfDTO, program:any, params:any) => {
        const upto = params[0];
        const logger = server.logger;
        try {
          let CHUNK_SIZE = 500;
          let jsoned:any = [];
          let current = await server.dal.getCurrentBlockOrNull();
          let lastNumber = current ? current.number + 1 : -1;
          if (upto !== undefined && upto.match(/\d+/)) {
            lastNumber = Math.min(parseInt(upto), lastNumber);
          }
          let chunksCount = Math.floor(lastNumber / CHUNK_SIZE);
          let chunks = [];
          // Max-size chunks
          for (let i = 0, len = chunksCount; i < len; i++) {
            chunks.push({start: i * CHUNK_SIZE, to: i * CHUNK_SIZE + CHUNK_SIZE - 1});
          }
          // A last chunk
          if (lastNumber > chunksCount * CHUNK_SIZE) {
            chunks.push({start: chunksCount * CHUNK_SIZE, to: lastNumber});
          }
          for (const chunk of chunks) {
            let blocks = await server.dal.getBlocksBetween(chunk.start, chunk.to);
            blocks.forEach(function (block:any) {
              jsoned.push(BlockDTO.fromJSONObject(block).json())
            });
          }
          if (!program.nostdout) {
            console.log(JSON.stringify(jsoned, null, "  "));
          }
          await server.disconnect();
          return jsoned;
        } catch(err) {
          logger.warn(err.message || err);
          await server.disconnect();
        }
      }
    }]
  }
}
