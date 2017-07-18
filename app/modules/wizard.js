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
const wizard = require('../lib/wizard');
const logger = require('../lib/logger').NewLogger('wizard');
module.exports = {
    duniter: {
        wizard: {
            // The wizard itself also defines its personal tasks
            'currency': (conf) => wizard().configCurrency(conf),
            'pow': (conf) => wizard().configPoW(conf),
            'parameters': (conf) => wizard().configUCP(conf)
        },
        cli: [{
                name: 'wizard [key|network|network-reconfigure|currency|pow|parameters]',
                desc: 'Launch the configuration wizard.',
                onConfiguredExecute: (server, conf, program, params, wizardTasks) => __awaiter(this, void 0, void 0, function* () {
                    const step = params[0];
                    const tasks = step ? [wizardTasks[step]] : _.values(wizardTasks);
                    for (const task of tasks) {
                        if (!task) {
                            throw 'Unknown task';
                        }
                        yield task(conf);
                    }
                    // Check config
                    yield server.checkConfig();
                    yield server.dal.saveConf(conf);
                    logger.debug("Configuration saved.");
                })
            }]
    }
};
//# sourceMappingURL=wizard.js.map