"use strict";

const co = require('co');
const _ = require('underscore');
const Block = require('../lib/entity/block');

module.exports = {
  duniter: {
    cli: [{
      name: 'export-bc [upto]',
      desc: 'Exports the whole blockchain as JSON array, up to [upto] block number (excluded).',
      logs: false,
      onDatabaseExecute: (server, conf, program, params) => co(function*() {
        const upto = params[0];
        const logger = server.logger;
        try {
          let CHUNK_SIZE = 500;
          let jsoned = [];
          let current = yield server.dal.getCurrentBlockOrNull();
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
            let blocks = yield server.dal.getBlocksBetween(chunk.start, chunk.to);
            blocks.forEach(function (block) {
              jsoned.push(_(new Block(block).json()).omit('raw'));
            });
          }
          if (!program.nostdout) {
            console.log(JSON.stringify(jsoned, null, "  "));
          }
          yield server.disconnect();
          return jsoned;
        } catch(err) {
          logger.warn(err.message || err);
          yield server.disconnect();
        }
      })
    }]
  }
}
