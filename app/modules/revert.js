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
module.exports = {
    duniter: {
        cli: [{
                name: 'revert [count]',
                desc: 'Revert (undo + remove) the top [count] blocks from the blockchain. EXPERIMENTAL',
                preventIfRunning: true,
                onDatabaseExecute: (server, conf, program, params) => __awaiter(this, void 0, void 0, function* () {
                    const count = params[0];
                    const logger = server.logger;
                    try {
                        for (let i = 0; i < count; i++) {
                            yield server.revert();
                        }
                    }
                    catch (err) {
                        logger.error('Error during revert:', err);
                    }
                    // Save DB
                    yield server.disconnect();
                })
            }, {
                name: 'revert-to [number]',
                desc: 'Revert (undo + remove) top blockchain blocks until block #[number] is reached. EXPERIMENTAL',
                onDatabaseExecute: (server, conf, program, params) => __awaiter(this, void 0, void 0, function* () {
                    const number = params[0];
                    const logger = server.logger;
                    try {
                        yield server.revertTo(number);
                    }
                    catch (err) {
                        logger.error('Error during revert:', err);
                    }
                    // Save DB
                    if (server) {
                        yield server.disconnect();
                    }
                })
            }]
    }
};
//# sourceMappingURL=revert.js.map