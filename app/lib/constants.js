"use strict";

const CURRENCY     = "[a-zA-Z0-9-_ ]{2,50}";
const UDID2        = "udid2;c;([A-Z-]*);([A-Z-]*);(\\d{4}-\\d{2}-\\d{2});(e\\+\\d{2}\\.\\d{2}(\\+|-)\\d{3}\\.\\d{2});(\\d+)(;?)";
const USER_ID      = "[A-Za-z0-9_-]{2,100}";
const BASE58       = "[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+";
const PUBKEY       = "[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{43,44}";
const TIMESTAMP    = "[1-9][0-9]{0,18}";
const POSITIVE_INT = "[1-9][0-9]{0,18}";
const DIVIDEND     = "[1-9][0-9]{0,5}";
const ZERO_OR_POSITIVE_INT = "0|[1-9][0-9]{0,18}";
const INTEGER      = "(0|[1-9]\\d{0,18})";
const RELATIVE_INTEGER = "(0|-?[1-9]\\d{0,18})";
const FLOAT        = "\\d+\.\\d+";
const BOOLEAN      = "[01]";
const SIGNATURE    = "[A-Za-z0-9+\\/=]{87,88}";
const FINGERPRINT  = "[A-F0-9]{64}";
const COMMENT      = "[ a-zA-Z0-9-_:/;*\\[\\]()?!^\\+=@&~#{}|\\\\<>%.]{0,255}";
const UNLOCK       = "(SIG\\(" + INTEGER + "\\)|XHX\\(" + INTEGER + "\\))";
const CONDITIONS   = "(&&|\\|\\|| |[()]|(SIG\\([0-9a-zA-Z]{43,44}\\)|(XHX\\([A-F0-9]{64}\\))))*";
//const CONDITIONS   = "(&&|\|\|| |[()]|(SIG\\(\\da-zA-Z\\))|(XHX\\(" + FINGERPRINT + "\\)))*";
const BLOCK_UID    = INTEGER + "-" + FINGERPRINT;
const META_TS      = "META:TS:" + BLOCK_UID;

const BMA_REGEXP  = /^BASIC_MERKLED_API( ([a-z_][a-z0-9-_.]*))?( ([0-9.]+))?( ([0-9a-f:]+))?( ([0-9]+))$/;
const IPV4_REGEXP = /^(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])$/;
const IPV6_REGEXP = /^((([0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){6}:[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){5}:([0-9A-Fa-f]{1,4}:)?[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){4}:([0-9A-Fa-f]{1,4}:){0,2}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){3}:([0-9A-Fa-f]{1,4}:){0,3}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){2}:([0-9A-Fa-f]{1,4}:){0,4}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){6}((b((25[0-5])|(1d{2})|(2[0-4]d)|(d{1,2}))b).){3}(b((25[0-5])|(1d{2})|(2[0-4]d)|(d{1,2}))b))|(([0-9A-Fa-f]{1,4}:){0,5}:((b((25[0-5])|(1d{2})|(2[0-4]d)|(d{1,2}))b).){3}(b((25[0-5])|(1d{2})|(2[0-4]d)|(d{1,2}))b))|(::([0-9A-Fa-f]{1,4}:){0,5}((b((25[0-5])|(1d{2})|(2[0-4]d)|(d{1,2}))b).){3}(b((25[0-5])|(1d{2})|(2[0-4]d)|(d{1,2}))b))|([0-9A-Fa-f]{1,4}::([0-9A-Fa-f]{1,4}:){0,5}[0-9A-Fa-f]{1,4})|(::([0-9A-Fa-f]{1,4}:){0,6}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){1,7}:))$/;

const MAXIMUM_LEN_OF_COMPACT_TX = 100;

module.exports = {

  ENTITY_TRANSACTION: 'transaction',
  ENTITY_BLOCK: 'block',
  ENTITY_MEMBERSHIP: 'membership',
  ENTITY_PEER: 'peer',
  ENTITY_IDENTITY: 'identity',
  ENTITY_CERTIFICATION: 'certification',
  ENTITY_REVOCATION: 'revocation',

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
    WRONG_DOCUMENT:                       { httpCode: 400, uerr: { ucode: 1005, message: "Document has unkown fields or wrong line ending format" }},
    HTTP_LIMITATION:                      { httpCode: 503, uerr: { ucode: 1006, message: "This URI has reached its maximum usage quota. Please retry later." }},
    SANDBOX_FOR_IDENTITY_IS_FULL:         { httpCode: 503, uerr: { ucode: 1007, message: "The identities' sandbox is full. Please retry with another document or retry later." }},
    SANDBOX_FOR_CERT_IS_FULL:             { httpCode: 503, uerr: { ucode: 1008, message: "The certifications' sandbox is full. Please retry with another document or retry later." }},
    SANDBOX_FOR_MEMERSHIP_IS_FULL:        { httpCode: 503, uerr: { ucode: 1009, message: "The memberships' sandbox is full. Please retry with another document or retry later." }},
    SANDBOX_FOR_TRANSACTION_IS_FULL:      { httpCode: 503, uerr: { ucode: 1010, message: "The transactions' sandbox is full. Please retry with another document or retry later." }},

    HTTP_PARAM_PUBKEY_REQUIRED:           { httpCode: 400, uerr: { ucode: 1101, message: "Parameter `pubkey` is required" }},
    HTTP_PARAM_IDENTITY_REQUIRED:         { httpCode: 400, uerr: { ucode: 1102, message: "Parameter `identity` is required" }},
    HTTP_PARAM_PEER_REQUIRED:             { httpCode: 400, uerr: { ucode: 1103, message: "Requires a peer" }},
    HTTP_PARAM_BLOCK_REQUIRED:            { httpCode: 400, uerr: { ucode: 1104, message: "Requires a block" }},
    HTTP_PARAM_MEMBERSHIP_REQUIRED:       { httpCode: 400, uerr: { ucode: 1105, message: "Requires a membership" }},
    HTTP_PARAM_TX_REQUIRED:               { httpCode: 400, uerr: { ucode: 1106, message: "Requires a transaction" }},
    HTTP_PARAM_SIG_REQUIRED:              { httpCode: 400, uerr: { ucode: 1107, message: "Parameter `sig` is required" }},
    HTTP_PARAM_CERT_REQUIRED:             { httpCode: 400, uerr: { ucode: 1108, message: "Parameter `cert` is required" }},
    HTTP_PARAM_REVOCATION_REQUIRED:       { httpCode: 400, uerr: { ucode: 1109, message: "Parameter `revocation` is required" }},
    HTTP_PARAM_CONF_REQUIRED:             { httpCode: 400, uerr: { ucode: 1110, message: "Parameter `conf` is required" }},
    HTTP_PARAM_CPU_REQUIRED:              { httpCode: 400, uerr: { ucode: 1111, message: "Parameter `cpu` is required" }},

    // Business errors
    NO_MATCHING_IDENTITY:                 { httpCode: 404, uerr: { ucode: 2001, message: "No matching identity" }},
    UID_ALREADY_USED:                     { httpCode: 400, uerr: { ucode: 2002, message: "UID already used in the blockchain" }},
    PUBKEY_ALREADY_USED:                  { httpCode: 400, uerr: { ucode: 2003, message: "Pubkey already used in the blockchain" }},
    NO_MEMBER_MATCHING_PUB_OR_UID:        { httpCode: 404, uerr: { ucode: 2004, message: "No member matching this pubkey or uid" }},
    SELF_PEER_NOT_FOUND:                  { httpCode: 404, uerr: { ucode: 2005, message: "Self peering was not found" }},
    WRONG_SIGNATURE_MEMBERSHIP:           { httpCode: 400, uerr: { ucode: 2006, message: "wrong signature for membership" }},
    ALREADY_RECEIVED_MEMBERSHIP:          { httpCode: 400, uerr: { ucode: 2007, message: "Already received membership" }},
    MEMBERSHIP_A_NON_MEMBER_CANNOT_LEAVE: { httpCode: 400, uerr: { ucode: 2008, message: "A non-member cannot leave" }},
    NOT_A_MEMBER:                         { httpCode: 400, uerr: { ucode: 2009, message: "Not a member" }},
    NO_CURRENT_BLOCK:                     { httpCode: 404, uerr: { ucode: 2010, message: "No current block" }},
    BLOCK_NOT_FOUND:                      { httpCode: 404, uerr: { ucode: 2011, message: "Block not found" }},
    PEER_NOT_FOUND:                       { httpCode: 404, uerr: { ucode: 2012, message: "Peer not found" }},
    WRONG_UNLOCKER:                       { httpCode: 400, uerr: { ucode: 2013, message: "Wrong unlocker in transaction" }},
    LOCKTIME_PREVENT:                     { httpCode: 400, uerr: { ucode: 2014, message: "Locktime not elapsed yet" }},
    SOURCE_ALREADY_CONSUMED:              { httpCode: 400, uerr: { ucode: 2015, message: "Source already consumed" }},
    WRONG_AMOUNTS:                        { httpCode: 400, uerr: { ucode: 2016, message: "Sum of inputs must equal sum of outputs" }},
    WRONG_OUTPUT_BASE:                    { httpCode: 400, uerr: { ucode: 2017, message: "Wrong unit base for outputs" }},
    CANNOT_ROOT_BLOCK_NO_MEMBERS:         { httpCode: 400, uerr: { ucode: 2018, message: "Wrong new block: cannot make a root block without members" }},
    IDENTITY_WRONGLY_SIGNED:              { httpCode: 400, uerr: { ucode: 2019, message: "Weird, the signature is wrong and in the database." }},
    TOO_OLD_IDENTITY:                     { httpCode: 400, uerr: { ucode: 2020, message: "Identity has expired and cannot be written in the blockchain anymore." }},
    NO_IDTY_MATCHING_PUB_OR_UID:          { httpCode: 404, uerr: { ucode: 2021, message: "No identity matching this pubkey or uid" }},
    NEWER_PEER_DOCUMENT_AVAILABLE:        { httpCode: 409, uerr: { ucode: 2022, message: "A newer peer document is available" }},
    PEER_DOCUMENT_ALREADY_KNOWN:          { httpCode: 400, uerr: { ucode: 2023, message: "Peer document already known" }},
    TX_INPUTS_OUTPUTS_NOT_EQUAL:          { httpCode: 400, uerr: { ucode: 2024, message: "Transaction inputs sum must equal outputs sum" }},
    TX_OUTPUT_SUM_NOT_EQUALS_PREV_DELTAS: { httpCode: 400, uerr: { ucode: 2025, message: "Transaction output base amount does not equal previous base deltas" }},
    BLOCKSTAMP_DOES_NOT_MATCH_A_BLOCK:    { httpCode: 400, uerr: { ucode: 2026, message: "Blockstamp does not match a block" }},
    A_TRANSACTION_HAS_A_MAX_SIZE:         { httpCode: 400, uerr: { ucode: 2027, message: 'A transaction has a maximum size of ' + MAXIMUM_LEN_OF_COMPACT_TX + ' lines' }}
  },

  DEBUG: {
    LONG_DAL_PROCESS: 50
  },

  BMA_REGEXP: BMA_REGEXP,
  IPV4_REGEXP: IPV4_REGEXP,
  IPV6_REGEXP: IPV6_REGEXP,

  SALT: exact(".+"),
  PASSWORD: exact(".*"),

  INTEGER: /^\d+$/,
  FINGERPRINT: exact(FINGERPRINT),
  TIMESTAMP: exact(TIMESTAMP),
  USER_ID: exact(USER_ID), // Any format, by default
  UDID2_FORMAT: exact(UDID2),
  BASE58: exact(BASE58),
  PUBLIC_KEY: exact(PUBKEY),
  SIG: exact(SIGNATURE),
  BLOCK_UID: exact(BLOCK_UID),

  DOCUMENTS_VERSION_REGEXP: /^2$/,
  DOCUMENTS_BLOCK_VERSION_REGEXP: /^(2|3|4)$/,
  DOCUMENTS_TRANSACTION_VERSION_REGEXP: /^(2|3)$/,
  DOCUMENTS_VERSION: 2,
  BLOCK_GENERATED_VERSION: 3,

  REVOCATION_FACTOR: 2, // This is protocol fixed value
  NB_DIGITS_UD: 6,      // This is protocol fixed value
  FIRST_UNIT_BASE: 0,

  TRANSACTION_EXPIRY_DELAY: 3600 * 24 * 7,

  CERT: {
    SELF: {
      UID: exact("UID:" + USER_ID),
      META: exact(META_TS)
    },
    REVOKE: exact("UID:REVOKE"),
    OTHER: {
      META: exact(META_TS),
      INLINE: exact(PUBKEY + ":" + PUBKEY + ":" + INTEGER + ":" + SIGNATURE)
    }
  },
  IDENTITY: {
    INLINE: exact(PUBKEY + ":" + SIGNATURE + ":" + BLOCK_UID + ":" + USER_ID),
    IDTY_TYPE:      find('Type: (Identity)'),
    IDTY_UID:       find('UniqueID: (' + USER_ID + ')')
  },
  DOCUMENTS: {
    DOC_VERSION:    find('Version: (2)'),
    DOC_CURRENCY:   find('Currency: (' + CURRENCY + ')'),
    DOC_ISSUER:     find('Issuer: (' + PUBKEY + ')'),
    TIMESTAMP:      find('Timestamp: (' + BLOCK_UID + ')')
  },
  CERTIFICATION: {
    CERT_TYPE:      find('Type: (Certification)'),
    IDTY_ISSUER:    find('IdtyIssuer: (' + PUBKEY + ')'),
    IDTY_UID:       find('IdtyUniqueID: (' + USER_ID + ')'),
    IDTY_TIMESTAMP: find('IdtyTimestamp: (' + BLOCK_UID + ')'),
    IDTY_SIG:       find('IdtySignature: (' + SIGNATURE + ')'),
    CERT_TIMESTAMP: find('CertTimestamp: (' + BLOCK_UID + ')')
  },
  REVOCATION: {
    REVOC_TYPE:      find('Type: (Certification)'),
    IDTY_ISSUER:     find('IdtyIssuer: (' + PUBKEY + ')'),
    IDTY_UID:        find('IdtyUniqueID: (' + USER_ID + ')'),
    IDTY_TIMESTAMP:  find('IdtyTimestamp: (' + BLOCK_UID + ')'),
    IDTY_SIG:        find('IdtySignature: (' + SIGNATURE + ')')
  },
  MEMBERSHIP: {
    BLOCK:      find('Block: (' + BLOCK_UID + ')'),
    VERSION:    find('Version: (2)'),
    CURRENCY:   find('Currency: (' + CURRENCY + ')'),
    ISSUER:     find('Issuer: (' + PUBKEY + ')'),
    MEMBERSHIP: find('Membership: (IN|OUT)'),
    USERID:     find('UserID: (' + USER_ID + ')'),
    CERTTS:     find('CertTS: (' + BLOCK_UID + ')')
  },
  BLOCK: {
    NONCE:       find("Nonce: (" + ZERO_OR_POSITIVE_INT + ")"),
    VERSION:     find("Version: (2|3|4)"),
    TYPE:        find("Type: (Block)"),
    CURRENCY:    find("Currency: (" + CURRENCY + ")"),
    BNUMBER:     find("Number: (" + ZERO_OR_POSITIVE_INT + ")"),
    POWMIN:      find("PoWMin: (" + ZERO_OR_POSITIVE_INT + ")"),
    TIME:        find("Time: (" + TIMESTAMP + ")"),
    MEDIAN_TIME: find("MedianTime: (" + TIMESTAMP + ")"),
    UD:          find("UniversalDividend: (" + DIVIDEND + ")"),
    UNIT_BASE:   find("UnitBase: (" + INTEGER + ")"),
    PREV_HASH:   find("PreviousHash: (" + FINGERPRINT + ")"),
    PREV_ISSUER: find("PreviousIssuer: (" + PUBKEY + ")"),
    MEMBERS_COUNT:find("MembersCount: (" + ZERO_OR_POSITIVE_INT + ")"),
    BLOCK_ISSUER:find('Issuer: (' + PUBKEY + ')'),
    BLOCK_ISSUERS_FRAME:find('IssuersFrame: (' + INTEGER + ')'),
    BLOCK_ISSUERS_FRAME_VAR:find('IssuersFrameVar: (' + RELATIVE_INTEGER + ')'),
    DIFFERENT_ISSUERS_COUNT:find('DifferentIssuersCount: (' + INTEGER + ')'),
    PARAMETERS:  find("Parameters: (" + FLOAT + ":" + INTEGER + ":" + INTEGER + ":" + INTEGER + ":" + INTEGER + ":" + INTEGER + ":" + INTEGER + ":" + INTEGER + ":" + INTEGER + ":" + INTEGER + ":" + FLOAT + ":" + INTEGER + ":" + INTEGER + ":" + INTEGER + ":" + INTEGER + ":" + INTEGER + ":" + INTEGER + ":" + FLOAT + ")"),
    JOINER:   exact(PUBKEY + ":" + SIGNATURE + ":" + BLOCK_UID + ":" + BLOCK_UID + ":" + USER_ID),
    ACTIVE:   exact(PUBKEY + ":" + SIGNATURE + ":" + BLOCK_UID + ":" + BLOCK_UID + ":" + USER_ID),
    LEAVER:   exact(PUBKEY + ":" + SIGNATURE + ":" + BLOCK_UID + ":" + BLOCK_UID + ":" + USER_ID),
    REVOCATION: exact(PUBKEY + ":" + SIGNATURE),
    EXCLUDED: exact(PUBKEY),
    INNER_HASH: find("InnerHash: (" + FINGERPRINT + ")"),
    SPECIAL_HASH: 'E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855',
    SPECIAL_BLOCK: '0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855'
  },
  TRANSACTION: {
    HEADER:  exact("TX:" + POSITIVE_INT + ":" + INTEGER + ":" + INTEGER + ":" + INTEGER + ":" + INTEGER + ":" + BOOLEAN + ":" + INTEGER),
    SENDER:  exact(PUBKEY),
    SOURCE:  exact("(T:" + FINGERPRINT + ":" + INTEGER + "|D:" + PUBKEY + ":" + POSITIVE_INT + ")"),
    SOURCE_V3:  exact("(" + POSITIVE_INT + ":" + INTEGER + ":T:" + FINGERPRINT + ":" + INTEGER + "|" + POSITIVE_INT + ":" + INTEGER + ":D:" + PUBKEY + ":" + POSITIVE_INT + ")"),
    UNLOCK:  exact(INTEGER + ":" + UNLOCK + "( (" + UNLOCK + "))*"),
    TARGET:  exact(POSITIVE_INT + ":" + INTEGER + ":" + CONDITIONS),
    BLOCKSTAMP:find('Blockstamp: (' + BLOCK_UID + ')'),
    COMMENT: find("Comment: (" + COMMENT + ")"),
    LOCKTIME:find("Locktime: (" + INTEGER + ")"),
    INLINE_COMMENT: exact(COMMENT)
  },
  PEER: {
    BLOCK: find("Block: (" + INTEGER + "-" + FINGERPRINT + ")"),
    SPECIAL_BLOCK: '0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855'
  },
  STATUS: {
    BLOCK: find("Block: (" + INTEGER + "-" + FINGERPRINT + ")"),
    SPECIAL_BLOCK: '0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855'
  },
  NETWORK: {
    MAX_MEMBERS_TO_FORWARD_TO_FOR_SELF_DOCUMENTS: 10,
    MAX_NON_MEMBERS_TO_FORWARD_TO_FOR_SELF_DOCUMENTS: 6,
    MAX_NON_MEMBERS_TO_FORWARD_TO: 4,
    MAX_MEMBERS_TO_FORWARD_TO: 6,
    COUNT_FOR_ENOUGH_PEERS: 4,
    MAX_CONCURRENT_POST: 3,
    DEFAULT_TIMEOUT: 10 * 1000, // 10 seconds
    SYNC_LONG_TIMEOUT: 30 * 1000, // 30 seconds
    DEFAULT_PORT: 8999,
    PORT: {
      START: 15000
    },
    UPNP: {
      INTERVAL: 300,
      TTL: 600
    },
    SYNC: {
      MAX: 20
    },
    STATUS_INTERVAL: {
      UPDATE: 2, // Every X blocks
      MAX: 20 // MAX Y blocks
    },
    SYNC_PEERS_INTERVAL: 3, // Every 3 block average generation time
    SYNC_BLOCK_INTERVAL: 2, // Every 2 block average generation time
    TEST_PEERS_INTERVAL: 10 // In seconds
  },
  PROOF_OF_WORK: {
    MINIMAL_TO_SHOW: 2,
    MINIMAL_TO_SHOW_IN_LOGS: 3,
    EVALUATION: 1000,
    UPPER_BOUND: [
      '9A-F',
      '9A-E',
      '9A-D',
      '9A-C',
      '9A-B',
      '9A',
      '9',
      '8',
      '7',
      '6',
      '5',
      '4',
      '3',
      '2',
      '1',
      '1' // In case remainder 15 happens for some reason
    ]
  },

  DURATIONS: {
    TEN_SECONDS: 10,
    A_MINUTE: 60,
    TEN_MINUTES: 600,
    AN_HOUR: 3600,
    A_DAY: 3600 * 24,
    A_WEEK: 3600 * 24 * 7,
    A_MONTH: (3600 * 24 * 365.25) / 12
  },

  DEFAULT_CPU: 0.6,

  CONTRACT: {
    DEFAULT: {
      C: 0.007376575,
      DT: 30.4375 * 24 * 3600,
      UD0: 100,
      STEPMAX: 3,
      SIGDELAY: 3600 * 24 * 365 * 5,
      SIGPERIOD: 0, // Instant
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

  CRYPTO: {
    DEFAULT_KEYPAIR: {
      pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
      sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
    }
  },

  BRANCHES: {
    DEFAULT_WINDOW_SIZE: 100,
    SWITCH_ON_BRANCH_AHEAD_BY_X_MINUTES: 30
  },

  INVALIDATE_CORE_CACHE: true,
  WITH_SIGNATURES_AND_POW: true,

  WEBMIN_LOGS_CACHE: 2000,

  NO_FORK_ALLOWED: false,
  FORK_ALLOWED: true,

  MEMORY_CLEAN_INTERVAL: 60 * 60, // hourly
  SAFE_FACTOR: 3,
  BLOCKS_COLLECT_THRESHOLD: 30, // Blocks to collect from memory and persist

  MUTE_LOGS_DURING_UNIT_TESTS: true,

  SANDBOX_SIZE_TRANSACTIONS: 200,
  SANDBOX_SIZE_IDENTITIES: 100,
  SANDBOX_SIZE_CERTIFICATIONS: 300,
  SANDBOX_SIZE_MEMBERSHIPS: 200,

  MAXIMUM_LEN_OF_COMPACT_TX: MAXIMUM_LEN_OF_COMPACT_TX,
  MAX_NUMBER_OF_PEERS_FOR_PULLING: 10,

  CURRENT_BLOCK_CACHE_DURATION: 10 * 1000, // 30 seconds
  CORES_MAXIMUM_USE_IN_PARALLEL: 8, // For more cores, we need to use a better PoW synchronization algorithm

  ENGINE_IDLE_INTERVAL: 5000,

  // When to trigger the PoW process again if no PoW is triggered for a while. In milliseconds.
  POW_SECURITY_RETRY_DELAY: 10 * 60 * 1000,

  POW_DIFFICULTY_RANGE_RATIO_V3: Math.sqrt(1.066),
  POW_DIFFICULTY_RANGE_RATIO_V4: 1.189
};

function exact (regexpContent) {
  return new RegExp("^" + regexpContent + "$");
}

function find (regexpContent) {
  return new RegExp(regexpContent);
}
