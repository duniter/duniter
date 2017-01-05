"use strict";
const util          = require('util');
const GenericParser = require('./GenericParser');
const Block         = require('../../entity/block');
const hashf         = require('../../ucp/hashf');
const rawer         = require('../../ucp/rawer');
const constants     = require('../../constants');

module.exports = BlockParser;

function BlockParser (onError) {

  const captures = [
    {prop: "version",         regexp: constants.BLOCK.VERSION},
    {prop: "type",            regexp: constants.BLOCK.TYPE},
    {prop: "currency",        regexp: constants.BLOCK.CURRENCY},
    {prop: "number",          regexp: constants.BLOCK.BNUMBER},
    {prop: "powMin",          regexp: constants.BLOCK.POWMIN},
    {prop: "time",            regexp: constants.BLOCK.TIME},
    {prop: "medianTime",      regexp: constants.BLOCK.MEDIAN_TIME},
    {prop: "dividend",        regexp: constants.BLOCK.UD},
    {prop: "unitbase",        regexp: constants.BLOCK.UNIT_BASE},
    {prop: "issuer",          regexp: constants.BLOCK.BLOCK_ISSUER},
    {prop: "issuersFrame",    regexp: constants.BLOCK.BLOCK_ISSUERS_FRAME},
    {prop: "issuersFrameVar", regexp: constants.BLOCK.BLOCK_ISSUERS_FRAME_VAR},
    {prop: "issuersCount",    regexp: constants.BLOCK.DIFFERENT_ISSUERS_COUNT},
    {prop: "parameters",      regexp: constants.BLOCK.PARAMETERS},
    {prop: "previousHash",    regexp: constants.BLOCK.PREV_HASH},
    {prop: "previousIssuer",  regexp: constants.BLOCK.PREV_ISSUER},
    {prop: "membersCount",    regexp: constants.BLOCK.MEMBERS_COUNT},
    {prop: "identities",      regexp: /Identities:\n([\s\S]*)Joiners/,          parser: splitAndMatch('\n', constants.IDENTITY.INLINE)},
    {prop: "joiners",         regexp: /Joiners:\n([\s\S]*)Actives/,             parser: splitAndMatch('\n', constants.BLOCK.JOINER)},
    {prop: "actives",         regexp: /Actives:\n([\s\S]*)Leavers/,             parser: splitAndMatch('\n', constants.BLOCK.ACTIVE)},
    {prop: "leavers",         regexp: /Leavers:\n([\s\S]*)Excluded/,            parser: splitAndMatch('\n', constants.BLOCK.LEAVER)},
    {prop: "revoked",         regexp: /Revoked:\n([\s\S]*)Excluded/,            parser: splitAndMatch('\n', constants.BLOCK.REVOCATION)},
    {prop: "excluded",        regexp: /Excluded:\n([\s\S]*)Certifications/,     parser: splitAndMatch('\n', constants.PUBLIC_KEY)},
    {prop: "certifications",  regexp: /Certifications:\n([\s\S]*)Transactions/, parser: splitAndMatch('\n', constants.CERT.OTHER.INLINE)},
    {prop: "transactions",    regexp: /Transactions:\n([\s\S]*)/,               parser: extractTransactions},
    {prop: "inner_hash",      regexp: constants.BLOCK.INNER_HASH},
    {prop: "nonce",           regexp: constants.BLOCK.NONCE}
  ];
  const multilineFields = [];
  GenericParser.call(this, captures, multilineFields, rawer.getBlock, onError);

  this._clean = (obj) => {
    obj.documentType = 'block';
    obj.identities = obj.identities || [];
    obj.joiners = obj.joiners || [];
    obj.actives = obj.actives || [];
    obj.leavers = obj.leavers || [];
    obj.revoked = obj.revoked || [];
    obj.excluded = obj.excluded || [];
    obj.certifications = obj.certifications || [];
    obj.transactions = obj.transactions || [];
    obj.version = obj.version || '';
    obj.type = obj.type || '';
    obj.hash = hashf(require('../../ucp/rawer').getBlockInnerHashAndNonceWithSignature(obj)).toUpperCase();
    obj.inner_hash = obj.inner_hash || '';
    obj.currency = obj.currency || '';
    obj.nonce = obj.nonce || '';
    obj.number = obj.number || '';
    obj.time = obj.time || '';
    obj.medianTime = obj.medianTime || '';
    obj.dividend = obj.dividend || null;
    obj.unitbase = obj.unitbase || '';
    obj.issuer = obj.issuer || '';
    obj.parameters = obj.parameters || '';
    obj.previousHash = obj.previousHash || '';
    obj.previousIssuer = obj.previousIssuer || '';
    obj.membersCount = obj.membersCount || '';
    obj.transactions.map((tx) => {
      tx.currency = obj.currency;
      tx.hash = hashf(rawer.getTransaction(tx)).toUpperCase();
    });
    obj.len = Block.statics.getLen(obj);
  };

  this._verify = (obj) => {
    let err = null;
    const codes = {
      'BAD_VERSION': 150,
      'BAD_CURRENCY': 151,
      'BAD_NUMBER': 152,
      'BAD_TYPE': 153,
      'BAD_NONCE': 154,
      'BAD_RECIPIENT_OF_NONTRANSFERT': 155,
      'BAD_PREV_HASH_PRESENT': 156,
      'BAD_PREV_HASH_ABSENT': 157,
      'BAD_PREV_ISSUER_PRESENT': 158,
      'BAD_PREV_ISSUER_ABSENT': 159,
      'BAD_DIVIDEND': 160,
      'BAD_TIME': 161,
      'BAD_MEDIAN_TIME': 162,
      'BAD_INNER_HASH': 163,
      'BAD_MEMBERS_COUNT': 164,
      'BAD_UNITBASE': 165
    };
    if(!err){
      // Version
      if(!obj.version || !obj.version.match(constants.DOCUMENTS_BLOCK_VERSION_REGEXP))
        err = {code: codes.BAD_VERSION, message: "Version unknown"};
    }
    if(!err){
      // Type
      if(!obj.type || !obj.type.match(/^Block$/))
        err = {code: codes.BAD_TYPE, message: "Not a Block type"};
    }
    if(!err){
      // Nonce
      if(!obj.nonce || !obj.nonce.match(constants.INTEGER))
        err = {code: codes.BAD_NONCE, message: "Nonce must be an integer value"};
    }
    if(!err){
      // Number
      if(!obj.number || !obj.number.match(constants.INTEGER))
        err = {code: codes.BAD_NUMBER, message: "Incorrect Number field"};
    }
    if(!err){
      // Time
      if(!obj.time || !obj.time.match(constants.INTEGER))
        err = {code: codes.BAD_TIME, message: "Time must be an integer"};
    }
    if(!err){
      // MedianTime
      if(!obj.medianTime || !obj.medianTime.match(constants.INTEGER))
        err = {code: codes.BAD_MEDIAN_TIME, message: "MedianTime must be an integer"};
    }
    if(!err){
      if(obj.dividend && !obj.dividend.match(constants.INTEGER))
        err = {code: codes.BAD_DIVIDEND, message: "Incorrect UniversalDividend field"};
    }
    if(!err){
      if(obj.unitbase && !obj.unitbase.match(constants.INTEGER))
        err = {code: codes.BAD_UNITBASE, message: "Incorrect UnitBase field"};
    }
    if(!err){
      if(!obj.issuer || !obj.issuer.match(constants.BASE58))
        err = {code: codes.BAD_ISSUER, message: "Incorrect Issuer field"};
    }
    if(!err){
      // MembersCount
      if(!obj.nonce || !obj.nonce.match(constants.INTEGER))
        err = {code: codes.BAD_MEMBERS_COUNT, message: "MembersCount must be an integer value"};
    }
    if(!err){
      // InnerHash
      if(!obj.inner_hash || !obj.inner_hash.match(constants.FINGERPRINT))
        err = {code: codes.BAD_INNER_HASH, message: "InnerHash must be a hash value"};
    }
    return err && err.message;
  };
}

function splitAndMatch (separator, regexp) {
  return function (raw) {
    const lines = raw.split(new RegExp(separator));
    const kept = [];
    lines.forEach(function(line){
      if (line.match(regexp))
        kept.push(line);
    });
    return kept;
  };
}

function extractTransactions(raw, obj) {
  const regexps = {
    "issuers": constants.TRANSACTION.SENDER,
    "inputs": constants.TRANSACTION.SOURCE_V3,
    "unlocks": constants.TRANSACTION.UNLOCK,
    "outputs": constants.TRANSACTION.TARGET,
    "comments": constants.TRANSACTION.INLINE_COMMENT,
    "signatures": constants.SIG
  };
  const transactions = [];
  const lines = raw.split(/\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // On each header
    if (line.match(constants.TRANSACTION.HEADER)) {
      // Parse the transaction
      const currentTX = { raw: line + '\n' };
      const sp = line.split(':');
      const version = parseInt(sp[1]);
      const nbIssuers = parseInt(sp[2]);
      const nbInputs = parseInt(sp[3]);
      const nbUnlocks = parseInt(sp[4]);
      const nbOutputs = parseInt(sp[5]);
      const hasComment = parseInt(sp[6]);
      const start = 2;
      currentTX.version = version;
      currentTX.blockstamp = lines[i + 1];
      currentTX.raw += currentTX.blockstamp + '\n';
      currentTX.locktime = parseInt(sp[7]);
      const linesToExtract = {
        issuers: {
          start: start,
          end: (start - 1) + nbIssuers
        },
        inputs: {
          start: start + nbIssuers,
          end: (start - 1) + nbIssuers + nbInputs
        },
        unlocks: {
          start: start + nbIssuers + nbInputs,
          end: (start - 1) + nbIssuers + nbInputs + nbUnlocks
        },
        outputs: {
          start: start + nbIssuers + nbInputs + nbUnlocks,
          end: (start - 1) + nbIssuers + nbInputs + nbUnlocks + nbOutputs
        },
        comments: {
          start: start + nbIssuers + nbInputs + nbUnlocks + nbOutputs,
          end: (start - 1) + nbIssuers + nbInputs + nbUnlocks + nbOutputs + hasComment
        },
        signatures: {
          start: start + nbIssuers + nbInputs + nbUnlocks + nbOutputs + hasComment,
          end: (start - 1) + 2 * nbIssuers + nbInputs + nbUnlocks + nbOutputs + hasComment
        }
      };
      ['issuers', 'inputs', 'unlocks', 'outputs', 'comments', 'signatures'].forEach((prop) => {
        currentTX[prop] = currentTX[prop] || [];
        for (let j = linesToExtract[prop].start; j <= linesToExtract[prop].end; j++) {
          const line = lines[i + j];
          if (line.match(regexps[prop])) {
            currentTX.raw += line + '\n';
            currentTX[prop].push(line);
          }
        }
      });
      // Comment
      if (hasComment) {
        currentTX.comment = currentTX.comments[0];
      } else {
        currentTX.comment = '';
      }
      currentTX.hash = hashf(rawer.getTransaction(currentTX)).toUpperCase();
      // Add to txs array
      transactions.push(currentTX);
      i = i + 1 + 2 * nbIssuers + nbInputs + nbUnlocks + nbOutputs + hasComment;
    } else {
      // Not a transaction header, stop reading
      i = lines.length;
    }
  }
  return transactions;
}

util.inherits(BlockParser, GenericParser);
