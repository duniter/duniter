import {CommonConstants} from "../../../lib/common-libs/constants"
import {GenericParser} from "./GenericParser"
import {rawer} from "../../../lib/common-libs/index"

export class TransactionParser extends GenericParser {

  constructor() {
    super([
      {prop: "version",    regexp: /Version: (.*)/},
      {prop: "currency",   regexp: /Currency: (.*)/},
      {prop: "issuers",    regexp: /Issuers:\n([\s\S]*)Inputs/, parser: extractIssuers },
      {prop: "inputs",     regexp: /Inputs:\n([\s\S]*)Unlocks/, parser: extractInputs },
      {prop: "unlocks",    regexp: /Unlocks:\n([\s\S]*)Outputs/,parser: extractUnlocks },
      {prop: "outputs",    regexp: /Outputs:\n([\s\S]*)/,       parser: extractOutputs },
      {prop: "comment",    regexp: CommonConstants.TRANSACTION.COMMENT },
      {prop: "locktime",   regexp: CommonConstants.TRANSACTION.LOCKTIME },
      {prop: "blockstamp", regexp: CommonConstants.TRANSACTION.BLOCKSTAMP },
      {prop: "signatures", regexp: /Outputs:\n([\s\S]*)/,       parser: extractSignatures }
    ], rawer.getTransaction)
  }

  _clean(obj:any) {
    obj.comment = obj.comment || "";
    obj.locktime = parseInt(obj.locktime) || 0;
    obj.signatures.push(obj.signature);
    const compactSize = 2 // Header + blockstamp
      + obj.issuers.length
      + obj.inputs.length
      + obj.unlocks.length
      + obj.outputs.length
      + (obj.comment ? 1 : 0)
      + obj.signatures;
    if (compactSize > 100) {
      throw 'A transaction has a maximum size of 100 lines';
    }
  }

  _verify(obj:any) {
    let err = null;
    const codes = {
      'BAD_VERSION': 150,
      'NO_BLOCKSTAMP': 151
    };
    if(!err){
      // Version
      if(!obj.version || !obj.version.match(CommonConstants.DOCUMENTS_TRANSACTION_VERSION_REGEXP))
        err = {code: codes.BAD_VERSION, message: "Version unknown"};
      // Blockstamp
      if(!obj.blockstamp || !obj.blockstamp.match(CommonConstants.BLOCKSTAMP_REGEXP))
        err = {code: codes.BAD_VERSION, message: "Blockstamp is required"};
    }
    return err && err.message;
  }
}

function extractIssuers(raw:string) {
  const issuers = [];
  const lines = raw.split(/\n/);
  for (const line of lines) {
    if (line.match(CommonConstants.TRANSACTION.SENDER)) {
      issuers.push(line);
    } else {
      // Not a pubkey, stop reading
      break;
    }
  }
  return issuers;
}

function extractInputs(raw:string) {
  const inputs = [];
  const lines = raw.split(/\n/);
  for (const line of lines) {
    if (line.match(CommonConstants.TRANSACTION.SOURCE_V3)) {
      inputs.push(line);
    } else {
      // Not a transaction input, stop reading
      break;
    }
  }
  return inputs;
}

function extractUnlocks(raw:string) {
  const unlocks = [];
  const lines = raw.split(/\n/);
  for (const line of lines) {
    if (line.match(CommonConstants.TRANSACTION.UNLOCK)) {
      unlocks.push(line);
    } else {
      // Not a transaction unlock, stop reading
      break;
    }
  }
  return unlocks;
}

function extractOutputs(raw:string) {
  const outputs = [];
  const lines = raw.split(/\n/);
  for (const line of lines) {
    if (line.match(CommonConstants.TRANSACTION.TARGET)) {
      outputs.push(line);
    } else {
      // Not a transaction input, stop reading
      break;
    }
  }
  return outputs;
}

function extractSignatures(raw:string) {
  const signatures = [];
  const lines = raw.split(/\n/);
  for (const line of lines) {
    if (line.match(CommonConstants.SIG)) {
      signatures.push(line);
    }
  }
  return signatures;
}