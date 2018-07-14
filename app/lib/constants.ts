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

"use strict";
import {CommonConstants} from "./common-libs/constants"
import {OtherConstants} from "./other_constants"
import {ProverConstants} from '../modules/prover/lib/constants';

const UDID2        = "udid2;c;([A-Z-]*);([A-Z-]*);(\\d{4}-\\d{2}-\\d{2});(e\\+\\d{2}\\.\\d{2}(\\+|-)\\d{3}\\.\\d{2});(\\d+)(;?)";
const PUBKEY       = CommonConstants.FORMATS.PUBKEY
const TIMESTAMP    = CommonConstants.FORMATS.TIMESTAMP

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
    WRONG_DOCUMENT:                       CommonConstants.ERRORS.WRONG_DOCUMENT,
    SANDBOX_FOR_IDENTITY_IS_FULL:         { httpCode: 503, uerr: { ucode: 1007, message: "The identities' sandbox is full. Please retry with another document or retry later." }},
    SANDBOX_FOR_CERT_IS_FULL:             { httpCode: 503, uerr: { ucode: 1008, message: "The certifications' sandbox is full. Please retry with another document or retry later." }},
    SANDBOX_FOR_MEMERSHIP_IS_FULL:        { httpCode: 503, uerr: { ucode: 1009, message: "The memberships' sandbox is full. Please retry with another document or retry later." }},
    SANDBOX_FOR_TRANSACTION_IS_FULL:      { httpCode: 503, uerr: { ucode: 1010, message: "The transactions' sandbox is full. Please retry with another document or retry later." }},
    NO_POTENTIAL_FORK_AS_NEXT:            { httpCode: 503, uerr: { ucode: 1011, message: "No fork block exists in the database as a potential next block." }},
    INCONSISTENT_DB_MULTI_TXS_SAME_HASH:  { httpCode: 503, uerr: { ucode: 1012, message: "Several transactions written with the same hash." }},
    CLI_CALLERR_RESET:                    { httpCode: 503, uerr: { ucode: 1013, message: "Bad command: usage is `reset config`, `reset data`, `reset peers`, `reset stats` or `reset all`" }},
    CLI_CALLERR_CONFIG:                   { httpCode: 503, uerr: { ucode: 1014, message: "Bad command: usage is `config`." }},
    CLI_CALLERR_WS2P:                     { httpCode: 503, uerr: { ucode: 1014, message: "Bad command: usage is `ws2p [subcmd]`." }},

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
    WRONG_UNLOCKER:                       CommonConstants.ERRORS.WRONG_UNLOCKER,
    LOCKTIME_PREVENT:                     CommonConstants.ERRORS.LOCKTIME_PREVENT,
    SOURCE_ALREADY_CONSUMED:              CommonConstants.ERRORS.SOURCE_ALREADY_CONSUMED,
    WRONG_AMOUNTS:                        CommonConstants.ERRORS.WRONG_AMOUNTS,
    WRONG_OUTPUT_BASE:                    CommonConstants.ERRORS.WRONG_OUTPUT_BASE,
    CANNOT_ROOT_BLOCK_NO_MEMBERS:         CommonConstants.ERRORS.CANNOT_ROOT_BLOCK_NO_MEMBERS,
    IDENTITY_WRONGLY_SIGNED:              CommonConstants.ERRORS.IDENTITY_WRONGLY_SIGNED,
    TOO_OLD_IDENTITY:                     CommonConstants.ERRORS.TOO_OLD_IDENTITY,
    NO_IDTY_MATCHING_PUB_OR_UID:          { httpCode: 404, uerr: { ucode: 2021, message: "No identity matching this pubkey or uid" }},
    NEWER_PEER_DOCUMENT_AVAILABLE:        CommonConstants.ERRORS.NEWER_PEER_DOCUMENT_AVAILABLE,
    PEER_DOCUMENT_ALREADY_KNOWN:          CommonConstants.ERRORS.PEER_DOCUMENT_ALREADY_KNOWN,
    TX_INPUTS_OUTPUTS_NOT_EQUAL:          CommonConstants.ERRORS.TX_INPUTS_OUTPUTS_NOT_EQUAL,
    TX_OUTPUT_SUM_NOT_EQUALS_PREV_DELTAS: CommonConstants.ERRORS.TX_OUTPUT_SUM_NOT_EQUALS_PREV_DELTAS,
    BLOCKSTAMP_DOES_NOT_MATCH_A_BLOCK:    CommonConstants.ERRORS.BLOCKSTAMP_DOES_NOT_MATCH_A_BLOCK,
    A_TRANSACTION_HAS_A_MAX_SIZE:         CommonConstants.ERRORS.A_TRANSACTION_HAS_A_MAX_SIZE,
    BLOCK_ALREADY_PROCESSED:              { httpCode: 400, uerr: { ucode: 2028, message: 'Already processed' }},
    TOO_OLD_MEMBERSHIP:                   CommonConstants.ERRORS.TOO_OLD_MEMBERSHIP,
    TX_ALREADY_PROCESSED:                 { httpCode: 400, uerr: { ucode: 2030, message: "Transaction already processed" }},
    A_MORE_RECENT_MEMBERSHIP_EXISTS:      { httpCode: 400, uerr: { ucode: 2031, message: "A more recent membership already exists" }},
    MAXIMUM_LEN_OF_OUTPUT:                CommonConstants.ERRORS.MAXIMUM_LEN_OF_OUTPUT,
    MAXIMUM_LEN_OF_UNLOCK:                CommonConstants.ERRORS.MAXIMUM_LEN_OF_UNLOCK
  },

  DEBUG: {
    LONG_DAL_PROCESS: 50
  },

  BMA_REGEXP: CommonConstants.BMA_REGEXP,
  IPV4_REGEXP: CommonConstants.IPV4_REGEXP,
  IPV6_REGEXP: CommonConstants.IPV6_REGEXP,

  TIMESTAMP: exact(TIMESTAMP),
  UDID2_FORMAT: exact(UDID2),
  PUBLIC_KEY: exact(PUBKEY),

  DOCUMENTS_VERSION: CommonConstants.DOCUMENTS_VERSION,
  BLOCK_GENERATED_VERSION: CommonConstants.BLOCK_GENERATED_VERSION,
  LAST_VERSION_FOR_TX: 10,
  TRANSACTION_VERSION: CommonConstants.TRANSACTION_VERSION,

  REVOCATION_FACTOR: CommonConstants.REVOCATION_FACTOR, // This is protocol fixed value
  FIRST_UNIT_BASE: 0,

  PEER: CommonConstants.PEER,

  CURRENT_DB_VERSION: 26,

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
    },
    ONION_ENDPOINT_REGEX: new RegExp('(?:https?:\/\/)?(?:www)?(\S*?\.onion)(\/[-\w]*)*')
  },
  PROOF_OF_WORK: {
    EVALUATION: 1000,
    UPPER_BOUND: CommonConstants.PROOF_OF_WORK.UPPER_BOUND.slice(),
    DEFAULT: {
      CPU: ProverConstants.DEFAULT_CPU,
      PREFIX: ProverConstants.DEFAULT_PEER_ID
    }
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

  MUTE_LOGS_DURING_UNIT_TESTS: OtherConstants.MUTE_LOGS_DURING_UNIT_TESTS,

  SANDBOX_SIZE_TRANSACTIONS: 200,
  SANDBOX_SIZE_IDENTITIES: 5000,
  SANDBOX_SIZE_CERTIFICATIONS: 12,
  SANDBOX_SIZE_MEMBERSHIPS: 5000,

  // With `logs` command, the number of tail lines to show
  NB_INITIAL_LINES_TO_SHOW: 100
};

function exact (regexpContent:string) {
  return new RegExp("^" + regexpContent + "$");
}
