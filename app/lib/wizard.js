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
const constants = require('./constants');
const async = require('async');
const inquirer = require('inquirer');
const logger = require('./logger').NewLogger('wizard');
class Wizard {
    static configPoW(conf) {
        return doTasks(['pow'], conf);
    }
    static configCurrency(conf) {
        return doTasks(['currency'], conf);
    }
    static configUCP(conf) {
        return doTasks(['parameters'], conf);
    }
}
exports.Wizard = Wizard;
function doTasks(todos, conf) {
    return new Promise((res, rej) => {
        async.forEachSeries(todos, function (task, callback) {
            tasks[task] && tasks[task](conf, callback);
        }, (err) => {
            if (err)
                return rej(err);
            return res();
        });
    });
}
const tasks = {
    currency: function (conf, done) {
        return __awaiter(this, void 0, void 0, function* () {
            const answers = yield inquirer.prompt([{
                    type: "input",
                    name: "currency",
                    message: "Currency name",
                    default: conf.currency,
                    validate: function (input) {
                        return input.match(/^[a-zA-Z0-9-_ ]+$/) ? true : false;
                    }
                }]);
            conf.currency = answers.currency;
            done();
        });
    },
    parameters: function (conf, done) {
        async.waterfall([
            async.apply(simpleFloat, "Universal Dividend %growth", "c", conf),
            async.apply(simpleInteger, "Universal Dividend period (in seconds)", "dt", conf),
            async.apply(simpleInteger, "First Universal Dividend (UD[0]) amount", "ud0", conf),
            async.apply(simpleInteger, "Delay between 2 certifications of a same issuer", "sigPeriod", conf),
            async.apply(simpleInteger, "Maximum stock of valid certifications per member", "sigStock", conf),
            async.apply(simpleInteger, "Maximum age of a non-written certification", "sigWindow", conf),
            async.apply(simpleInteger, "Certification validity duration", "sigValidity", conf),
            async.apply(simpleInteger, "Number of valid certifications required to be a member", "sigQty", conf),
            async.apply(simpleInteger, "Maximum age of a non-written identity", "idtyWindow", conf),
            async.apply(simpleInteger, "Maximum age of a non-written membership", "msWindow", conf),
            async.apply(simpleFloat, "Percentage of sentries to be reached to match WoT distance rule", "xpercent", conf),
            async.apply(simpleInteger, "Membership validity duration", "msValidity", conf),
            async.apply(simpleInteger, "Number of blocks on which is computed median time", "medianTimeBlocks", conf),
            async.apply(simpleInteger, "The average time for writing 1 block (wished time)", "avgGenTime", conf),
            async.apply(simpleInteger, "Frequency, in number of blocks, to wait for changing common difficulty", "dtDiffEval", conf),
            async.apply(simpleFloat, "Weight in percent for previous issuers", "percentRot", conf)
        ], done);
    },
    pow: function (conf, done) {
        async.waterfall([
            function (next) {
                simpleInteger("Start computation of a new block if none received since (seconds)", "powDelay", conf, next);
            }
        ], done);
    }
};
function simpleValue(question, property, defaultValue, conf, validation, done) {
    return __awaiter(this, void 0, void 0, function* () {
        const answers = yield inquirer.prompt([{
                type: "input",
                name: property,
                message: question,
                default: conf[property],
                validate: validation
            }]);
        conf[property] = answers[property];
        done();
    });
}
function simpleInteger(question, property, conf, done) {
    simpleValue(question, property, conf[property], conf, function (input) {
        return input && input.toString().match(/^[0-9]+$/) ? true : false;
    }, done);
}
function simpleFloat(question, property, conf, done) {
    simpleValue(question, property, conf[property], conf, function (input) {
        return input && input.toString().match(/^[0-9]+(\.[0-9]+)?$/) ? true : false;
    }, done);
}
//# sourceMappingURL=wizard.js.map