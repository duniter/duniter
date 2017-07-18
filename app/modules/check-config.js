var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const constants = require('../lib/constants');
const wizard = require('../lib/wizard');
const logger = require('../lib/logger').NewLogger('wizard');
module.exports = {
    duniter: {
        cli: [{
                name: 'check-config',
                desc: 'Checks the node\'s configuration',
                onConfiguredExecute: (server) => __awaiter(this, void 0, void 0, function* () {
                    yield server.checkConfig();
                    logger.warn('Configuration seems correct.');
                })
            }]
    }
};
//# sourceMappingURL=check-config.js.map