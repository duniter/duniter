"use strict";
const co        = require('co');
const constants = require('./constants');
const network   = require('./system/network');
const async     = require('async');
const inquirer  = require('inquirer');
const logger    = require('./logger')('wizard');

module.exports = function () {
  return new Wizard();
};

function Wizard () {

  this.configPoW = function (conf, program, logger, done) {
    doTasks(['pow'], conf, done);
  };

  this.configCurrency = function (conf, program, logger, done) {
    doTasks(['currency'], conf, done);
  };

  this.configUCP = function (conf, program, logger, done) {
    doTasks(['parameters'], conf, done);
  };
}

function doTasks (todos, conf, done) {
  async.forEachSeries(todos, function(task, callback){
    tasks[task] && tasks[task](conf, callback);
  }, done);
}

const tasks = {

  currency: function (conf, done) {
    async.waterfall([
      function (next){
        inquirer.prompt([{
          type: "input",
          name: "currency",
          message: "Currency name",
          default: conf.currency,
          validate: function (input) {
            return input.match(/^[a-zA-Z0-9-_ ]+$/) ? true : false;
          }
        }], function (answers) {
          conf.currency = answers.currency;
          next();
        });
      }
    ], done);
  },

  parameters: function (conf, done) {
    async.waterfall([
      async.apply(simpleFloat,   "Universal Dividend %growth",                                             "c", conf),
      async.apply(simpleInteger, "Universal Dividend period (in seconds)",                                 "dt", conf),
      async.apply(simpleInteger, "First Universal Dividend (UD[0]) amount",                                "ud0", conf),
      async.apply(simpleInteger, "Delay between 2 certifications of a same issuer",                        "sigPeriod", conf),
      async.apply(simpleInteger, "Maximum stock of valid certifications per member",                       "sigStock", conf),
      async.apply(simpleInteger, "Maximum age of a non-written certification",                             "sigWindow", conf),
      async.apply(simpleInteger, "Certification validity duration",                                        "sigValidity", conf),
      async.apply(simpleInteger, "Number of valid certifications required to be a member",                 "sigQty", conf),
      async.apply(simpleInteger, "Maximum age of a non-written identity",                                  "idtyWindow", conf),
      async.apply(simpleInteger, "Maximum age of a non-written membership",                                "msWindow", conf),
      async.apply(simpleFloat,   "Percentage of sentries to be reached to match WoT distance rule",        "xpercent", conf),
      async.apply(simpleInteger, "Membership validity duration",                                           "msValidity", conf),
      async.apply(simpleInteger, "Number of blocks on which is computed median time",                      "medianTimeBlocks", conf),
      async.apply(simpleInteger, "The average time for writing 1 block (wished time)",                     "avgGenTime", conf),
      async.apply(simpleInteger, "Frequency, in number of blocks, to wait for changing common difficulty", "dtDiffEval", conf),
      async.apply(simpleFloat,   "Weight in percent for previous issuers",                                 "percentRot", conf)
    ], done);
  },

  pow: function (conf, done) {
    async.waterfall([
      function (next){
        simpleInteger("Start computation of a new block if none received since (seconds)", "powDelay", conf, next);
      }
    ], done);
  }
};

function simpleValue (question, property, defaultValue, conf, validation, done) {
  inquirer.prompt([{
    type: "input",
    name: property,
    message: question,
    default: conf[property],
    validate: validation
  }], function (answers) {
    conf[property] = answers[property];
    done();
  });
}

function simpleInteger (question, property, conf, done) {
  simpleValue(question, property, conf[property], conf, function (input) {
    return input && input.toString().match(/^[0-9]+$/) ? true : false;
  }, done);
}

function simpleFloat (question, property, conf, done) {
  simpleValue(question, property, conf[property], conf, function (input) {
    return input && input.toString().match(/^[0-9]+(\.[0-9]+)?$/) ? true : false;
  }, done);
}
