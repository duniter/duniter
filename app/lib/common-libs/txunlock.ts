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

import { hashf } from "../common";
import { evalParams } from "../rules/global_rules";
import { TxSignatureResult } from "../dto/TransactionDTO";

let Parser = require("jison").Parser;

let grammar = {
  lex: {
    rules: [
      ["\\s+", "/* skip whitespace */"],
      ["\\&\\&", "return 'AND';"],
      ["\\|\\|", "return 'OR';"],
      ["\\(", "return '(';"],
      ["\\)", "return ')';"],
      ["[0-9A-Za-z]{40,64}", "return 'PARAMETER';"],
      ["[0-9]{1,10}", "return 'PARAMETER';"],
      ["SIG", "return 'SIG';"],
      ["XHX", "return 'XHX';"],
      ["CLTV", "return 'CLTV';"],
      ["CSV", "return 'CSV';"],
      ["$", "return 'EOF';"],
    ],
  },

  operators: [["left", "AND", "OR"]],

  bnf: {
    expressions: [["e EOF", "return $1;"]],

    e: [
      ["e AND e", "$$ = $1 && $3;"],
      ["e OR e", "$$ = $1 || $3;"],
      ["SIG ( e )", "$$ = yy.sig($3);"],
      ["XHX ( e )", "$$ = yy.xHx($3);"],
      ["CLTV ( e )", "$$ = yy.cltv($3);"],
      ["CSV ( e )", "$$ = yy.csv($3);"],
      ["PARAMETER", "$$ = $1;"],
      ["( e )", "$$ = $2;"],
    ],
  },
};

export interface UnlockMetadata {
  currentTime?: number;
  elapsedTime?: number;
}

export function unlock(
  conditionsStr: string,
  unlockParams: string[],
  sigResult: TxSignatureResult,
  metadata?: UnlockMetadata
): boolean | null {
  const params = evalParams(unlockParams, conditionsStr, sigResult);
  let parser = new Parser(grammar);
  let nbFunctions = 0;

  parser.yy = {
    i: 0,
    sig: function (pubkey: string) {
      // Counting functions
      nbFunctions++;
      // Make the test
      let success = false;
      let i = 0;
      while (!success && i < params.length) {
        const p = params[i];
        success =
          p.successful && p.funcName === "SIG" && p.parameter === pubkey;
        i++;
      }
      return success;
    },
    xHx: function (hash: string) {
      // Counting functions
      nbFunctions++;
      // Make the test
      let success = false;
      let i = 0;
      while (!success && i < params.length) {
        const p = params[i];
        success =
          p.successful && p.funcName === "XHX" && hashf(p.parameter) === hash;
        i++;
      }
      return success;
    },
    cltv: function (deadline: string) {
      // Counting functions
      nbFunctions++;
      // Make the test
      return (
        metadata &&
        metadata.currentTime &&
        metadata.currentTime >= parseInt(deadline)
      );
    },
    csv: function (amountToWait: string) {
      // Counting functions
      nbFunctions++;
      // Make the test
      return (
        metadata &&
        metadata.elapsedTime &&
        metadata.elapsedTime >= parseInt(amountToWait)
      );
    },
  };

  try {
    const areAllValidParameters = params.reduce(
      (success, p) => success && !!p.successful,
      true
    );
    if (!areAllValidParameters) {
      throw "All parameters must be successful";
    }
    const unlocked = parser.parse(conditionsStr);
    if (unlockParams.length > nbFunctions) {
      throw "There must be at most as much params as function calls";
    }
    return unlocked;
  } catch (e) {
    return null;
  }
}

export function checkGrammar(conditionsStr: string): boolean | null {
  let parser = new Parser(grammar);

  parser.yy = {
    i: 0,
    sig: () => true,
    xHx: () => true,
    cltv: () => true,
    csv: () => true,
  };

  try {
    return parser.parse(conditionsStr);
  } catch (e) {
    return null;
  }
}
