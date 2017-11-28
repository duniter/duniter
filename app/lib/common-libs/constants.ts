"use strict";

const CURRENCY     = "[a-zA-Z0-9-_ ]{2,50}"
const BASE58       = "[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+"
const PUBKEY       = "[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{43,44}"
const SIGNATURE    = "[A-Za-z0-9+\\/=]{87,88}"
const USER_ID      = "[A-Za-z0-9_-]{2,100}"
const INTEGER      = "(0|[1-9]\\d{0,18})"
const FINGERPRINT  = "[A-F0-9]{64}"
const BLOCK_VERSION = "(10)"
const TX_VERSION   = "(10)"
const DIVIDEND     = "[1-9][0-9]{0,5}"
const ZERO_OR_POSITIVE_INT = "0|[1-9][0-9]{0,18}"
const BLOCK_UID    = "(" + ZERO_OR_POSITIVE_INT + ")-" + FINGERPRINT
const RELATIVE_INTEGER = "(0|-?[1-9]\\d{0,18})"
const FLOAT        = "\\d+\.\\d+"
const POSITIVE_INT = "[1-9][0-9]{0,18}"
const TIMESTAMP    = "[1-9][0-9]{0,18}"
const BOOLEAN      = "[01]"
const WS2PID       = "[0-9a-f]{8}"
const SOFTWARE     = "[a-z0-9._-]{2,15}"
const SOFT_VERSION = "[0-9a-z._-]{2,15}"
const POW_PREFIX   = "([1-9]|[1-9][0-9]|[1-8][0-9][0-9])" // 1-899
const SPECIAL_BLOCK = '0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855'
const META_TS      = "META:TS:" + BLOCK_UID
const COMMENT      = "[ a-zA-Z0-9-_:/;*\\[\\]()?!^\\+=@&~#{}|\\\\<>%.]{0,255}"
const CLTV_INTEGER = "([0-9]{1,10})";
const CSV_INTEGER  = "([0-9]{1,8})";
const XUNLOCK      = "[a-zA-Z0-9]{1,64}";
const UNLOCK       = "(SIG\\(" + INTEGER + "\\)|XHX\\(" + XUNLOCK + "\\))"
const CONDITIONS   = "(&&|\\|\\|| |[()]|(SIG\\(" + PUBKEY + "\\)|(XHX\\([A-F0-9]{64}\\)|CLTV\\(" + CLTV_INTEGER + "\\)|CSV\\(" + CSV_INTEGER + "\\))))*"

const BMA_REGEXP  = /^BASIC_MERKLED_API( ([a-z_][a-z0-9-_.]*))?( ([0-9.]+))?( ([0-9a-f:]+))?( ([0-9]+))$/
const BMATOR_REGEXP = /^BMATOR( ([a-z0-9]{16})\.onion)( ([0-9.]+))?( ([0-9a-f:]+))?( ([0-9]+))$/
const WS2P_REGEXP = /^WS2P (?:[1-9][0-9]* )?([a-f0-9]{8}) ([a-z_][a-z0-9-_.]*|[0-9.]+|[0-9a-f:]+) ([0-9]+)(?: (.+))?$/
const WS2PTOR_REGEXP = /^WS2PTOR (?:[1-9][0-9]* )?([a-f0-9]{8}) ([a-z0-9-_.]*|[0-9.]+|[0-9a-f:]+.onion) ([0-9]+)(?: (.+))?$/
const WS_FULL_ADDRESS_ONION_REGEX = /^(?:wss?:\/\/)(?:www\.)?([0-9a-z]{16}\.onion)(:[0-9]+)?$/
const IPV4_REGEXP = /^(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])$/;
const IPV6_REGEXP = /^((([0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){6}:[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){5}:([0-9A-Fa-f]{1,4}:)?[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){4}:([0-9A-Fa-f]{1,4}:){0,2}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){3}:([0-9A-Fa-f]{1,4}:){0,3}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){2}:([0-9A-Fa-f]{1,4}:){0,4}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){6}((b((25[0-5])|(1d{2})|(2[0-4]d)|(d{1,2}))b).){3}(b((25[0-5])|(1d{2})|(2[0-4]d)|(d{1,2}))b))|(([0-9A-Fa-f]{1,4}:){0,5}:((b((25[0-5])|(1d{2})|(2[0-4]d)|(d{1,2}))b).){3}(b((25[0-5])|(1d{2})|(2[0-4]d)|(d{1,2}))b))|(::([0-9A-Fa-f]{1,4}:){0,5}((b((25[0-5])|(1d{2})|(2[0-4]d)|(d{1,2}))b).){3}(b((25[0-5])|(1d{2})|(2[0-4]d)|(d{1,2}))b))|([0-9A-Fa-f]{1,4}::([0-9A-Fa-f]{1,4}:){0,5}[0-9A-Fa-f]{1,4})|(::([0-9A-Fa-f]{1,4}:){0,6}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){1,7}:))$/;
const HOST_ONION_REGEX = /^(?:www\.)?([0-9a-z]{16}\.onion)$/

const MAXIMUM_LEN_OF_COMPACT_TX = 100
const MAXIMUM_LEN_OF_OUTPUT = 2000
const MAXIMUM_LEN_OF_UNLOCK = MAXIMUM_LEN_OF_OUTPUT

export enum DuniterDocument {
  ENTITY_NULL,
  ENTITY_BLOCK,
  ENTITY_IDENTITY,
  ENTITY_CERTIFICATION,
  ENTITY_MEMBERSHIP,
  ENTITY_REVOCATION,
  ENTITY_TRANSACTION,
  ENTITY_PEER
}

export const duniterDocument2str = (type:DuniterDocument) => {
  switch (type) {
    case DuniterDocument.ENTITY_BLOCK: return "block"
    case DuniterDocument.ENTITY_IDENTITY: return "identity"
    case DuniterDocument.ENTITY_CERTIFICATION: return "certification"
    case DuniterDocument.ENTITY_REVOCATION: return "revocation"
    case DuniterDocument.ENTITY_MEMBERSHIP: return "membership"
    case DuniterDocument.ENTITY_TRANSACTION: return "transaction"
    case DuniterDocument.ENTITY_PEER: return "peer"
    default:
      return ""
  }
}

export const CommonConstants = {

  FORMATS: {
    CURRENCY,
    PUBKEY,
    INTEGER,
    BLOCKSTAMP: BLOCK_UID,
    FINGERPRINT,
    TIMESTAMP,
    WS2PID,
    SOFTWARE,
    SOFT_VERSION,
    POW_PREFIX,
    ZERO_OR_POSITIVE_INT
  },

  BLOCK_GENERATED_VERSION: 10,
  LAST_VERSION_FOR_TX: 10,
  TRANSACTION_VERSION: 10,
  DOCUMENTS_VERSION: 10,
  TRANSACTION_MAX_TRIES: 10,

  SWITCH_ON_BRANCH_AHEAD_BY_X_BLOCKS: 3,

  BMA_REGEXP,
  BMATOR_REGEXP,
  WS2P_REGEXP,
  WS2PTOR_REGEXP,
  WS_FULL_ADDRESS_ONION_REGEX,
  IPV4_REGEXP,
  IPV6_REGEXP,
  HOST_ONION_REGEX,
  PUBLIC_KEY: exact(PUBKEY),
  INTEGER: /^\d+$/,
  BASE58: exact(BASE58),
  FINGERPRINT: exact(FINGERPRINT),
  SIG: exact(SIGNATURE),
  BLOCK_UID: exact(BLOCK_UID),
  USER_ID: exact(USER_ID), // Any format, by default

  DOCUMENTS_VERSION_REGEXP: /^10$/,
  BLOCKSTAMP_REGEXP: new RegExp("^" + BLOCK_UID + "$"),
  DOCUMENTS_BLOCK_VERSION_REGEXP: new RegExp("^" + BLOCK_VERSION + "$"),
  DOCUMENTS_TRANSACTION_VERSION_REGEXP: /^(10)$/,
  SPECIAL_BLOCK,
  SPECIAL_HASH: 'E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855',
  MAXIMUM_LEN_OF_COMPACT_TX,
  MAXIMUM_LEN_OF_OUTPUT,
  MAXIMUM_LEN_OF_UNLOCK,

  POW_TURN_DURATION_PC: 100,
  POW_TURN_DURATION_ARM: 500,

  PROOF_OF_WORK: {
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

  DocumentError: "documentError",

  ERRORS: {
    // Technical errors
    WRONG_DOCUMENT:                       { httpCode: 400, uerr: { ucode: 1005, message: "Document has unkown fields or wrong line ending format" }},
    DOCUMENT_BEING_TREATED:               { httpCode: 400, uerr: { ucode: 1015, message: "Document already under treatment" }},

    // Business errors
    WRONG_UNLOCKER:                       { httpCode: 400, uerr: { ucode: 2013, message: "Wrong unlocker in transaction" }},
    LOCKTIME_PREVENT:                     { httpCode: 400, uerr: { ucode: 2014, message: "Locktime not elapsed yet" }},
    SOURCE_ALREADY_CONSUMED:              { httpCode: 400, uerr: { ucode: 2015, message: "Source already consumed" }},
    WRONG_AMOUNTS:                        { httpCode: 400, uerr: { ucode: 2016, message: "Sum of inputs must equal sum of outputs" }},
    WRONG_OUTPUT_BASE:                    { httpCode: 400, uerr: { ucode: 2017, message: "Wrong unit base for outputs" }},
    CANNOT_ROOT_BLOCK_NO_MEMBERS:         { httpCode: 400, uerr: { ucode: 2018, message: "Wrong new block: cannot make a root block without members" }},
    IDENTITY_WRONGLY_SIGNED:              { httpCode: 400, uerr: { ucode: 2019, message: "Weird, the signature is wrong and in the database." }},
    TOO_OLD_IDENTITY:                     { httpCode: 400, uerr: { ucode: 2020, message: "Identity has expired and cannot be written in the blockchain anymore." }},
    NEWER_PEER_DOCUMENT_AVAILABLE:        { httpCode: 409, uerr: { ucode: 2022, message: "A newer peer document is available" }},
    PEER_DOCUMENT_ALREADY_KNOWN:          { httpCode: 400, uerr: { ucode: 2023, message: "Peer document already known" }},
    TX_INPUTS_OUTPUTS_NOT_EQUAL:          { httpCode: 400, uerr: { ucode: 2024, message: "Transaction inputs sum must equal outputs sum" }},
    TX_OUTPUT_SUM_NOT_EQUALS_PREV_DELTAS: { httpCode: 400, uerr: { ucode: 2025, message: "Transaction output base amount does not equal previous base deltas" }},
    BLOCKSTAMP_DOES_NOT_MATCH_A_BLOCK:    { httpCode: 400, uerr: { ucode: 2026, message: "Blockstamp does not match a block" }},
    A_TRANSACTION_HAS_A_MAX_SIZE:         { httpCode: 400, uerr: { ucode: 2027, message: 'A transaction has a maximum size of ' + MAXIMUM_LEN_OF_COMPACT_TX + ' lines' }},
    TOO_OLD_MEMBERSHIP:                   { httpCode: 400, uerr: { ucode: 2029, message: "Too old membership." }},
    MAXIMUM_LEN_OF_OUTPUT:                { httpCode: 400, uerr: { ucode: 2032, message: 'A transaction output has a maximum size of ' + MAXIMUM_LEN_OF_OUTPUT + ' characters' }},
    MAXIMUM_LEN_OF_UNLOCK:                { httpCode: 400, uerr: { ucode: 2033, message: 'A transaction unlock has a maximum size of ' + MAXIMUM_LEN_OF_UNLOCK + ' characters' }},
    WRONG_CURRENCY:                       { httpCode: 400, uerr: { ucode: 2500, message: 'Wrong currency' }},
    WRONG_POW:                            { httpCode: 400, uerr: { ucode: 2501, message: 'Wrong proof-of-work' }},
    OUT_OF_FORK_WINDOW:                   { httpCode: 400, uerr: { ucode: 2501, message: 'Out of fork window' }},

    WRONG_SIGNATURE_FOR_CERT:             { httpCode: 400, uerr: { ucode: 3000, message: 'Wrong signature for certification' }},
  },

  // INDEXES
  M_INDEX: 'MINDEX',
  I_INDEX: 'IINDEX',
  S_INDEX: 'SINDEX',
  C_INDEX: 'CINDEX',
  IDX_CREATE: 'CREATE',
  IDX_UPDATE: 'UPDATE',

  // Protocol fixed values
  NB_DIGITS_UD: 4,
  REVOCATION_FACTOR: 2,
  TX_WINDOW: 3600 * 24 * 7,
  POW_DIFFICULTY_RANGE_RATIO: 1.189, // deduced from Hexadecimal relation between 2 chars ~= 16^(1/16)
  ACCOUNT_MINIMUM_CURRENT_BASED_AMOUNT: 100,


  DOCUMENTS: {
    DOC_VERSION:    find('Version: (10)'),
    DOC_CURRENCY:   find('Currency: (' + CURRENCY + ')'),
    DOC_ISSUER:     find('Issuer: (' + PUBKEY + ')'),
    TIMESTAMP:      find('Timestamp: (' + BLOCK_UID + ')')
  },
  IDENTITY: {
    INLINE: exact(PUBKEY + ":" + SIGNATURE + ":" + BLOCK_UID + ":" + USER_ID),
    IDTY_TYPE:      find('Type: (Identity)'),
    IDTY_UID:       find('UniqueID: (' + USER_ID + ')')
  },
  BLOCK: {
    NONCE:       find("Nonce: (" + ZERO_OR_POSITIVE_INT + ")"),
    VERSION:     find("Version: " + BLOCK_VERSION),
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
    PARAMETERS:  find("Parameters: (" + FLOAT + ":" + INTEGER + ":" + INTEGER + ":" + INTEGER + ":" + INTEGER + ":" + INTEGER + ":" + INTEGER + ":" + INTEGER + ":" + INTEGER + ":" + INTEGER + ":" + FLOAT + ":" + INTEGER + ":" + INTEGER + ":" + INTEGER + ":" + INTEGER + ":" + INTEGER + ":" + FLOAT + ":" + INTEGER + ":" + INTEGER + ":" + INTEGER + ")"),
    JOINER:   exact(PUBKEY + ":" + SIGNATURE + ":" + BLOCK_UID + ":" + BLOCK_UID + ":" + USER_ID),
    ACTIVE:   exact(PUBKEY + ":" + SIGNATURE + ":" + BLOCK_UID + ":" + BLOCK_UID + ":" + USER_ID),
    LEAVER:   exact(PUBKEY + ":" + SIGNATURE + ":" + BLOCK_UID + ":" + BLOCK_UID + ":" + USER_ID),
    REVOCATION: exact(PUBKEY + ":" + SIGNATURE),
    EXCLUDED: exact(PUBKEY),
    INNER_HASH: find("InnerHash: (" + FINGERPRINT + ")"),
    SPECIAL_HASH: 'E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855',
    SPECIAL_BLOCK
  },
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
    VERSION:    find('Version: (10)'),
    CURRENCY:   find('Currency: (' + CURRENCY + ')'),
    ISSUER:     find('Issuer: (' + PUBKEY + ')'),
    MEMBERSHIP: find('Membership: (IN|OUT)'),
    USERID:     find('UserID: (' + USER_ID + ')'),
    CERTTS:     find('CertTS: (' + BLOCK_UID + ')')
  },
  TRANSACTION: {
    HEADER:  exact("TX:" + TX_VERSION + ":" + INTEGER + ":" + INTEGER + ":" + INTEGER + ":" + INTEGER + ":" + BOOLEAN + ":" + INTEGER),
    SENDER:  exact(PUBKEY),
    SOURCE_V3:  exact("(" + POSITIVE_INT + ":" + INTEGER + ":T:" + FINGERPRINT + ":" + INTEGER + "|" + POSITIVE_INT + ":" + INTEGER + ":D:" + PUBKEY + ":" + POSITIVE_INT + ")"),
    UNLOCK:  exact(INTEGER + ":" + UNLOCK + "( (" + UNLOCK + "))*"),
    TARGET:  exact(POSITIVE_INT + ":" + INTEGER + ":" + CONDITIONS),
    BLOCKSTAMP:find('Blockstamp: (' + BLOCK_UID + ')'),
    COMMENT: find("Comment: (" + COMMENT + ")"),
    LOCKTIME:find("Locktime: (" + INTEGER + ")"),
    INLINE_COMMENT: exact(COMMENT),
    OUTPUT_CONDITION: exact(CONDITIONS)
  },
  PEER: {
    BLOCK: find("Block: (" + INTEGER + "-" + FINGERPRINT + ")"),
    SPECIAL_BLOCK
  },
}

function exact (regexpContent:string) {
  return new RegExp("^" + regexpContent + "$");
}

function find (regexpContent:string) {
  return new RegExp(regexpContent);
}
