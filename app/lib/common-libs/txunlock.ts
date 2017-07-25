"use strict";
import {hashf} from "../common"

let Parser = require("jison").Parser;
let buid = require('../../../app/lib/common-libs/buid').Buid

let grammar = {
  "lex": {
    "rules": [
      ["\\s+",                    "/* skip whitespace */"],
      ["\\&\\&",                  "return 'AND';"],
      ["\\|\\|",                  "return 'OR';"],
      ["\\(",                     "return '(';"],
      ["\\)",                     "return ')';"],
      ["[0-9A-Za-z]{40,64}",      "return 'PARAMETER';"],
      ["[0-9]{1,10}",             "return 'PARAMETER';"],
      ["SIG",                     "return 'SIG';"],
      ["XHX",                     "return 'XHX';"],
      ["CLTV",                    "return 'CLTV';"],
      ["CSV",                     "return 'CSV';"],
      ["$",                       "return 'EOF';"]
    ]
  },

  "operators": [
    ["left", "AND", "OR"]
  ],

  "bnf": {
    "expressions" :[
      [ "e EOF",   "return $1;"  ]
    ],

    "e" :[
      [ "e AND e", "$$ = $1 && $3;" ],
      [ "e OR e",  "$$ = $1 || $3;" ],
      [ "SIG ( e )","$$ = yy.sig($3);"],
      [ "XHX ( e )","$$ = yy.xHx($3);"],
      [ "CLTV ( e )","$$ = yy.cltv($3);"],
      [ "CSV ( e )","$$ = yy.csv($3);"],
      [ "PARAMETER", "$$ = $1;" ],
      [ "( e )",   "$$ = $2;" ]
    ]
  }
};

export function unlock(conditionsStr:string, executions:any, metadata:any) {

  let parser = new Parser(grammar);

  parser.yy = {
    i: 0,
    sig: function (pubkey:string) {
      let sigParam = executions[this.i++];
      return (sigParam && pubkey === sigParam.pubkey && sigParam.sigOK) || false;
    },
    xHx: function(hash:string) {
      let xhxParam = executions[this.i++];
      return hashf(xhxParam) === hash;
    },
    cltv: function(deadline:string) {
      return metadata.currentTime && metadata.currentTime >= parseInt(deadline);
    },
    csv: function(amountToWait:string) {
      return metadata.elapsedTime && metadata.elapsedTime >= parseInt(amountToWait);
    }
  };

  try {
    return parser.parse(conditionsStr);
  } catch(e) {
    return false;
  }
}