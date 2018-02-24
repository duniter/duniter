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

import {CommonConstants} from "../../../lib/common-libs/constants"
export const BMAConstants = {

  BMA_PORTS_START: 10901,
  BMA_PORTS_END: 10999,

  DEFAULT_PORT: 10901,
  IPV4_REGEXP: /^(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])$/,
  IPV6_REGEXP: /^((([0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){6}:[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){5}:([0-9A-Fa-f]{1,4}:)?[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){4}:([0-9A-Fa-f]{1,4}:){0,2}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){3}:([0-9A-Fa-f]{1,4}:){0,3}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){2}:([0-9A-Fa-f]{1,4}:){0,4}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){6}((b((25[0-5])|(1d{2})|(2[0-4]d)|(d{1,2}))b).){3}(b((25[0-5])|(1d{2})|(2[0-4]d)|(d{1,2}))b))|(([0-9A-Fa-f]{1,4}:){0,5}:((b((25[0-5])|(1d{2})|(2[0-4]d)|(d{1,2}))b).){3}(b((25[0-5])|(1d{2})|(2[0-4]d)|(d{1,2}))b))|(::([0-9A-Fa-f]{1,4}:){0,5}((b((25[0-5])|(1d{2})|(2[0-4]d)|(d{1,2}))b).){3}(b((25[0-5])|(1d{2})|(2[0-4]d)|(d{1,2}))b))|([0-9A-Fa-f]{1,4}::([0-9A-Fa-f]{1,4}:){0,5}[0-9A-Fa-f]{1,4})|(::([0-9A-Fa-f]{1,4}:){0,6}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){1,7}:))$/,
  HOST_ONION_REGEX: CommonConstants.HOST_ONION_REGEX,
  PORT_START: 15000,
  UPNP_INTERVAL: 300,
  UPNP_TTL: 600,
  PUBLIC_KEY: /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{43,44}$/,
  SHA256_HASH: /^[A-F0-9]{64}$/,

  ERRORS: {

    // Technical errors
    UNKNOWN:                              { httpCode: 500, uerr: { ucode: 1001, message: "An unknown error occured" }},
    UNHANDLED:                            { httpCode: 500, uerr: { ucode: 1002, message: "An unhandled error occured" }},
    HTTP_LIMITATION:                      { httpCode: 503, uerr: { ucode: 1006, message: "This URI has reached its maximum usage quota. Please retry later." }},
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
    SELF_PEER_NOT_FOUND:                  { httpCode: 404, uerr: { ucode: 2005, message: "Self peering was not found" }},
    NOT_A_MEMBER:                         { httpCode: 400, uerr: { ucode: 2009, message: "Not a member" }},
    NO_CURRENT_BLOCK:                     { httpCode: 404, uerr: { ucode: 2010, message: "No current block" }},
    PEER_NOT_FOUND:                       { httpCode: 404, uerr: { ucode: 2012, message: "Peer not found" }},
    NO_IDTY_MATCHING_PUB_OR_UID:          { httpCode: 404, uerr: { ucode: 2021, message: "No identity matching this pubkey or uid" }},
    TX_NOT_FOUND:                         { httpCode: 400, uerr: { ucode: 2034, message: 'Transaction not found' }}

    // New errors: range 3000-4000
  }
}