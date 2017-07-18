"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const _ = require('underscore');
const Block = require('../lib/entity/block');
module.exports = {
    duniter: {
        cli: [{
                name: 'export-bc [upto]',
                desc: 'Exports the whole blockchain as JSON array, up to [upto] block number (excluded).',
                logs: false,
                onDatabaseExecute: (server, conf, program, params) => __awaiter(this, void 0, void 0, function* () {
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
                            chunks.push({ start: i * CHUNK_SIZE, to: i * CHUNK_SIZE + CHUNK_SIZE - 1 });
                        }
                        // A last chunk
                        if (lastNumber > chunksCount * CHUNK_SIZE) {
                            chunks.push({ start: chunksCount * CHUNK_SIZE, to: lastNumber });
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
                    }
                    catch (err) {
                        logger.warn(err.message || err);
                        yield server.disconnect();
                    }
                })
            }]
    }
};
//# sourceMappingURL=export-bc.js.map