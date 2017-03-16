"use strict";

let Parser = require("jison").Parser;
let ucp = require('duniter-common').buid;

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

let logger = require('../logger')('unlock');

module.exports = function unlock(conditionsStr, executions, metadata) {

  let parser = new Parser(grammar);

  parser.yy = {
    i: 0,
    sig: function (pubkey) {
      let sigParam = executions[this.i++];
      return (sigParam && pubkey === sigParam.pubkey && sigParam.sigOK) || false;
    },
    xHx: function(hash) {
      let xhxParam = executions[this.i++];
      return ucp.format.hashf(xhxParam) === hash;
    },
    cltv: function(deadline) {
      return metadata.currentTime && metadata.currentTime >= parseInt(deadline);
    },
    csv: function(amountToWait) {
      return metadata.elapsedTime && metadata.elapsedTime >= parseInt(amountToWait);
    }
  };

  try {
    return parser.parse(conditionsStr);
  } catch(e) {
    logger.error(e);
    return false;
  }
};
