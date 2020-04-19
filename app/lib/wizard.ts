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

import { ConfDTO } from "./dto/ConfDTO";

const constants = require("./constants");
const async = require("async");
const inquirer = require("inquirer");
const logger = require("./logger").NewLogger("wizard");

export class Wizard {
  static configPoW(conf: ConfDTO) {
    return doTasks(["pow"], conf);
  }

  static configCurrency(conf: ConfDTO) {
    return doTasks(["currency"], conf);
  }

  static configUCP(conf: ConfDTO) {
    return doTasks(["parameters"], conf);
  }
}

function doTasks(todos: string[], conf: ConfDTO) {
  return new Promise((res, rej) => {
    async.forEachSeries(
      todos,
      function (task: any, callback: any) {
        tasks[task] && tasks[task](conf, callback);
      },
      (err: any) => {
        if (err) return rej(err);
        return res();
      }
    );
  });
}

const tasks: any = {
  currency: async function (conf: ConfDTO, done: any) {
    const answers = await inquirer.prompt([
      {
        type: "input",
        name: "currency",
        message: "Currency name",
        default: conf.currency,
        validate: function (input: string) {
          return input.match(/^[a-zA-Z0-9-_ ]+$/) ? true : false;
        },
      },
    ]);
    conf.currency = answers.currency;
    done();
  },

  parameters: function (conf: ConfDTO, done: any) {
    async.waterfall(
      [
        async.apply(simpleFloat, "Universal Dividend %growth", "c", conf),
        async.apply(
          simpleInteger,
          "Universal Dividend period (in seconds)",
          "dt",
          conf
        ),
        async.apply(
          simpleInteger,
          "First Universal Dividend (UD[0]) amount",
          "ud0",
          conf
        ),
        async.apply(
          simpleInteger,
          "Delay between 2 certifications of a same issuer",
          "sigPeriod",
          conf
        ),
        async.apply(
          simpleInteger,
          "Maximum stock of valid certifications per member",
          "sigStock",
          conf
        ),
        async.apply(
          simpleInteger,
          "Maximum age of a non-written certification",
          "sigWindow",
          conf
        ),
        async.apply(
          simpleInteger,
          "Certification validity duration",
          "sigValidity",
          conf
        ),
        async.apply(
          simpleInteger,
          "Number of valid certifications required to be a member",
          "sigQty",
          conf
        ),
        async.apply(
          simpleInteger,
          "Maximum age of a non-written identity",
          "idtyWindow",
          conf
        ),
        async.apply(
          simpleInteger,
          "Maximum age of a non-written membership",
          "msWindow",
          conf
        ),
        async.apply(
          simpleFloat,
          "Percentage of sentries to be reached to match WoT distance rule",
          "xpercent",
          conf
        ),
        async.apply(
          simpleInteger,
          "Membership validity duration",
          "msValidity",
          conf
        ),
        async.apply(
          simpleInteger,
          "Number of blocks on which is computed median time",
          "medianTimeBlocks",
          conf
        ),
        async.apply(
          simpleInteger,
          "The average time for writing 1 block (wished time)",
          "avgGenTime",
          conf
        ),
        async.apply(
          simpleInteger,
          "Frequency, in number of blocks, to wait for changing common difficulty",
          "dtDiffEval",
          conf
        ),
        async.apply(
          simpleFloat,
          "Weight in percent for previous issuers",
          "percentRot",
          conf
        ),
      ],
      done
    );
  },

  pow: function (conf: ConfDTO, done: any) {
    async.waterfall(
      [
        function (next: any) {
          simpleInteger(
            "Start computation of a new block if none received since (seconds)",
            "powDelay",
            conf,
            next
          );
        },
      ],
      done
    );
  },
};

async function simpleValue(
  question: string,
  property: string,
  defaultValue: any,
  conf: any,
  validation: any,
  done: any
) {
  const answers = await inquirer.prompt([
    {
      type: "input",
      name: property,
      message: question,
      default: conf[property],
      validate: validation,
    },
  ]);
  conf[property] = answers[property];
  done();
}

function simpleInteger(
  question: string,
  property: string,
  conf: any,
  done: any
) {
  simpleValue(
    question,
    property,
    conf[property],
    conf,
    function (input: string) {
      return input && input.toString().match(/^[0-9]+$/) ? true : false;
    },
    done
  );
}

function simpleFloat(question: string, property: string, conf: any, done: any) {
  simpleValue(
    question,
    property,
    conf[property],
    conf,
    function (input: string) {
      return input && input.toString().match(/^[0-9]+(\.[0-9]+)?$/)
        ? true
        : false;
    },
    done
  );
}
