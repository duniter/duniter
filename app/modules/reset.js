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
const constants = require('../lib/constants');
const wizard = require('../lib/wizard');
const logger = require('../lib/logger').NewLogger('wizard');
module.exports = {
    duniter: {
        cli: [{
                name: 'reset [config|data|peers|tx|stats|all]',
                desc: 'Reset configuration, data, peers, transactions or everything in the database',
                preventIfRunning: true,
                onConfiguredExecute: (server, conf, program, params) => __awaiter(this, void 0, void 0, function* () {
                    const type = params[0];
                    if (type === 'peers') {
                        // Needs the DAL plugged
                        yield server.initDAL();
                    }
                    switch (type) {
                        case 'data':
                            yield server.resetData();
                            logger.warn('Data successfully reseted.');
                            break;
                        case 'peers':
                            yield server.resetPeers();
                            logger.warn('Peers successfully reseted.');
                            break;
                        case 'stats':
                            yield server.resetStats();
                            logger.warn('Stats successfully reseted.');
                            break;
                        case 'config':
                            yield server.resetConf();
                            logger.warn('Configuration successfully reseted.');
                            break;
                        case 'all':
                            yield server.resetAll();
                            logger.warn('Data & Configuration successfully reseted.');
                            break;
                        default:
                            throw constants.ERRORS.CLI_CALLERR_RESET;
                    }
                })
            }]
    }
};
//# sourceMappingURL=reset.js.map