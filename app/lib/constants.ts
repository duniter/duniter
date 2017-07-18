"use strict";

const common = require('duniter-common')

const UDID2        = "udid2;c;([A-Z-]*);([A-Z-]*);(\\d{4}-\\d{2}-\\d{2});(e\\+\\d{2}\\.\\d{2}(\\+|-)\\d{3}\\.\\d{2});(\\d+)(;?)";
const PUBKEY       = common.constants.FORMATS.PUBKEY
const TIMESTAMP    = common.constants.FORMATS.TIMESTAMP

const IPV4_REGEXP = /^(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])$/;
const IPV6_REGEXP = /^((([0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){6}:[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){5}:([0-9A-Fa-f]{1,4}:)?[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){4}:([0-9A-Fa-f]{1,4}:){0,2}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){3}:([0-9A-Fa-f]{1,4}:){0,3}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){2}:([0-9A-Fa-f]{1,4}:){0,4}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){6}((b((25[0-5])|(1d{2})|(2[0-4]d)|(d{1,2}))b).){3}(b((25[0-5])|(1d{2})|(2[0-4]d)|(d{1,2}))b))|(([0-9A-Fa-f]{1,4}:){0,5}:((b((25[0-5])|(1d{2})|(2[0-4]d)|(d{1,2}))b).){3}(b((25[0-5])|(1d{2})|(2[0-4]d)|(d{1,2}))b))|(::([0-9A-Fa-f]{1,4}:){0,5}((b((25[0-5])|(1d{2})|(2[0-4]d)|(d{1,2}))b).){3}(b((25[0-5])|(1d{2})|(2[0-4]d)|(d{1,2}))b))|([0-9A-Fa-f]{1,4}::([0-9A-Fa-f]{1,4}:){0,5}[0-9A-Fa-f]{1,4})|(::([0-9A-Fa-f]{1,4}:){0,6}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){1,7}:))$/;

module.exports = {

  TIME_TO_TURN_ON_BRG_107: 1498860000,

  ERROR: {

    PEER: {
      UNKNOWN_REFERENCE_BLOCK: 'Unknown reference block of peer'
    },

    BLOCK: {
      NO_CURRENT_BLOCK: 'No current block'
    }
  },

  ERRORS: {

    // Technical errors
    UNKNOWN:                              { httpCode: 500, uerr: { ucode: 1001, message: "An unknown error occured" }},
    UNHANDLED:                            { httpCode: 500, uerr: { ucode: 1002, message: "An unhandled error occured" }},
    SIGNATURE_DOES_NOT_MATCH:             { httpCode: 400, uerr: { ucode: 1003, message: "Signature does not match" }},
    ALREADY_UP_TO_DATE:                   { httpCode: 400, uerr: { ucode: 1004, message: "Already up-to-date" }},
    WRONG_DOCUMENT:                       common.constants.ERRORS.WRONG_DOCUMENT,
    SANDBOX_FOR_IDENTITY_IS_FULL:         { httpCode: 503, uerr: { ucode: 1007, message: "The identities' sandbox is full. Please retry with another document or retry later." }},
    SANDBOX_FOR_CERT_IS_FULL:             { httpCode: 503, uerr: { ucode: 1008, message: "The certifications' sandbox is full. Please retry with another document or retry later." }},
    SANDBOX_FOR_MEMERSHIP_IS_FULL:        { httpCode: 503, uerr: { ucode: 1009, message: "The memberships' sandbox is full. Please retry with another document or retry later." }},
    SANDBOX_FOR_TRANSACTION_IS_FULL:      { httpCode: 503, uerr: { ucode: 1010, message: "The transactions' sandbox is full. Please retry with another document or retry later." }},
    NO_POTENTIAL_FORK_AS_NEXT:            { httpCode: 503, uerr: { ucode: 1011, message: "No fork block exists in the database as a potential next block." }},
    INCONSISTENT_DB_MULTI_TXS_SAME_HASH:  { httpCode: 503, uerr: { ucode: 1012, message: "Several transactions written with the same hash." }},
    CLI_CALLERR_RESET:                    { httpCode: 503, uerr: { ucode: 1013, message: "Bad command: usage is `reset config`, `reset data`, `reset peers`, `reset stats` or `reset all`" }},
    CLI_CALLERR_CONFIG:                   { httpCode: 503, uerr: { ucode: 1014, message: "Bad command: usage is `config`." }},

    // Business errors
    NO_MATCHING_IDENTITY:                 { httpCode: 404, uerr: { ucode: 2001, message: "No matching identity" }},
    UID_ALREADY_USED:                     { httpCode: 400, uerr: { ucode: 2002, message: "UID already used in the blockchain" }},
    PUBKEY_ALREADY_USED:                  { httpCode: 400, uerr: { ucode: 2003, message: "Pubkey already used in the blockchain" }},
    NO_MEMBER_MATCHING_PUB_OR_UID:        { httpCode: 404, uerr: { ucode: 2004, message: "No member matching this pubkey or uid" }},
    WRONG_SIGNATURE_MEMBERSHIP:           { httpCode: 400, uerr: { ucode: 2006, message: "wrong signature for membership" }},
    ALREADY_RECEIVED_MEMBERSHIP:          { httpCode: 400, uerr: { ucode: 2007, message: "Already received membership" }},
    MEMBERSHIP_A_NON_MEMBER_CANNOT_LEAVE: { httpCode: 400, uerr: { ucode: 2008, message: "A non-member cannot leave" }},
    NOT_A_MEMBER:                         { httpCode: 400, uerr: { ucode: 2009, message: "Not a member" }},
    BLOCK_NOT_FOUND:                      { httpCode: 404, uerr: { ucode: 2011, message: "Block not found" }},
    WRONG_UNLOCKER:                       common.constants.ERRORS.WRONG_UNLOCKER,
    LOCKTIME_PREVENT:                     common.constants.ERRORS.LOCKTIME_PREVENT,
    SOURCE_ALREADY_CONSUMED:              common.constants.ERRORS.SOURCE_ALREADY_CONSUMED,
    WRONG_AMOUNTS:                        common.constants.ERRORS.WRONG_AMOUNTS,
    WRONG_OUTPUT_BASE:                    common.constants.ERRORS.WRONG_OUTPUT_BASE,
    CANNOT_ROOT_BLOCK_NO_MEMBERS:         common.constants.ERRORS.CANNOT_ROOT_BLOCK_NO_MEMBERS,
    IDENTITY_WRONGLY_SIGNED:              common.constants.ERRORS.IDENTITY_WRONGLY_SIGNED,
    TOO_OLD_IDENTITY:                     common.constants.ERRORS.TOO_OLD_IDENTITY,
    NO_IDTY_MATCHING_PUB_OR_UID:          { httpCode: 404, uerr: { ucode: 2021, message: "No identity matching this pubkey or uid" }},
    NEWER_PEER_DOCUMENT_AVAILABLE:        { httpCode: 409, uerr: { ucode: 2022, message: "A newer peer document is available" }},
    PEER_DOCUMENT_ALREADY_KNOWN:          { httpCode: 400, uerr: { ucode: 2023, message: "Peer document already known" }},
    TX_INPUTS_OUTPUTS_NOT_EQUAL:          common.constants.ERRORS.TX_INPUTS_OUTPUTS_NOT_EQUAL,
    TX_OUTPUT_SUM_NOT_EQUALS_PREV_DELTAS: common.constants.ERRORS.TX_OUTPUT_SUM_NOT_EQUALS_PREV_DELTAS,
    BLOCKSTAMP_DOES_NOT_MATCH_A_BLOCK:    common.constants.ERRORS.BLOCKSTAMP_DOES_NOT_MATCH_A_BLOCK,
    A_TRANSACTION_HAS_A_MAX_SIZE:         common.constants.ERRORS.A_TRANSACTION_HAS_A_MAX_SIZE,
    BLOCK_ALREADY_PROCESSED:              { httpCode: 400, uerr: { ucode: 2028, message: 'Already processed' }},
    TOO_OLD_MEMBERSHIP:                   common.constants.ERRORS.TOO_OLD_MEMBERSHIP,
    TX_ALREADY_PROCESSED:                 { httpCode: 400, uerr: { ucode: 2030, message: "Transaction already processed" }},
    A_MORE_RECENT_MEMBERSHIP_EXISTS:      { httpCode: 400, uerr: { ucode: 2031, message: "A more recent membership already exists" }},
    MAXIMUM_LEN_OF_OUTPUT:                common.constants.ERRORS.MAXIMUM_LEN_OF_OUTPUT,
    MAXIMUM_LEN_OF_UNLOCK:                common.constants.ERRORS.MAXIMUM_LEN_OF_UNLOCK
  },

  DEBUG: {
    LONG_DAL_PROCESS: 50
  },

  BMA_REGEXP: common.constants.BMA_REGEXP,
  IPV4_REGEXP: IPV4_REGEXP,
  IPV6_REGEXP: IPV6_REGEXP,

  TIMESTAMP: exact(TIMESTAMP),
  UDID2_FORMAT: exact(UDID2),
  PUBLIC_KEY: exact(PUBKEY),

  DOCUMENTS_VERSION: common.constants.DOCUMENTS_VERSION,
  BLOCK_GENERATED_VERSION: common.constants.BLOCK_GENERATED_VERSION,
  LAST_VERSION_FOR_TX: 10,
  TRANSACTION_VERSION: common.constants.TRANSACTION_VERSION,

  REVOCATION_FACTOR: common.constants.REVOCATION_FACTOR, // This is protocol fixed value
  FIRST_UNIT_BASE: 0,

  PEER: common.constants.PEER,
  NETWORK: {
    MAX_MEMBERS_TO_FORWARD_TO_FOR_SELF_DOCUMENTS: 10,
    MAX_NON_MEMBERS_TO_FORWARD_TO_FOR_SELF_DOCUMENTS: 6,
    MAX_NON_MEMBERS_TO_FORWARD_TO: 4,
    MAX_MEMBERS_TO_FORWARD_TO: 6,
    MAX_CONCURRENT_POST: 3,
    DEFAULT_TIMEOUT: 10 * 1000, // 10 seconds
    SYNC: {
      MAX: 20
    },
    STATUS_INTERVAL: {
      UPDATE: 2, // Every X blocks
      MAX: 20 // MAX Y blocks
    }
  },
  PROOF_OF_WORK: {
    EVALUATION: 1000,
    UPPER_BOUND: common.constants.PROOF_OF_WORK.UPPER_BOUND.slice()
  },

  DEFAULT_CURRENCY_NAME: "no_currency",

  CONTRACT: {
    DEFAULT: {
      C: 0.007376575,
      DT: 30.4375 * 24 * 3600,
      DT_REEVAL: 30.4375 * 24 * 3600,
      UD0: 100,
      STEPMAX: 3,
      SIGDELAY: 3600 * 24 * 365 * 5,
      SIGPERIOD: 0, // Instant
      MSPERIOD: 0, // Instant
      SIGSTOCK: 40,
      SIGWINDOW: 3600 * 24 * 7, // a week
      SIGVALIDITY: 3600 * 24 * 365,
      MSVALIDITY: 3600 * 24 * 365,
      SIGQTY: 5,
      X_PERCENT: 0.9,
      PERCENTROT: 2 / 3,
      BLOCKSROT: 20,
      POWDELAY: 0,
      AVGGENTIME: 16 * 60,
      DTDIFFEVAL: 10,
      MEDIANTIMEBLOCKS: 20,
      IDTYWINDOW: 3600 * 24 * 7, // a week
      MSWINDOW: 3600 * 24 * 7 // a week
    },

    DSEN_P: 1.2 // dSen proportional factor
  },

  BRANCHES: {
    DEFAULT_WINDOW_SIZE: 100
  },

  INVALIDATE_CORE_CACHE: true,
  WITH_SIGNATURES_AND_POW: true,

  NO_FORK_ALLOWED: false,

  SAFE_FACTOR: 3,
  BLOCKS_COLLECT_THRESHOLD: 30, // Blocks to collect from memory and persist

  MUTE_LOGS_DURING_UNIT_TESTS: true,

  SANDBOX_SIZE_TRANSACTIONS: 200,
  SANDBOX_SIZE_IDENTITIES: 5000,
  SANDBOX_SIZE_CERTIFICATIONS: 12,
  SANDBOX_SIZE_MEMBERSHIPS: 5000,

  CURRENT_BLOCK_CACHE_DURATION: 10 * 1000, // 30 seconds

  // With `logs` command, the number of tail lines to show
  NB_INITIAL_LINES_TO_SHOW: 100
};

function exact (regexpContent:string) {
  return new RegExp("^" + regexpContent + "$");
}
