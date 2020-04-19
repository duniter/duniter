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

export const ProverConstants = {
  CORES_MAXIMUM_USE_IN_PARALLEL: 8,

  MINIMAL_ZEROS_TO_SHOW_IN_LOGS: 3,

  POW_MINIMAL_TO_SHOW: 2,
  DEFAULT_CPU: 0.6,
  DEFAULT_PEER_ID: 1,
  MIN_PEER_ID: 1,
  MAX_PEER_ID: 899, // Due to MAX_SAFE_INTEGER = 9007199254740991 (16 digits, and we use 11 digits for the nonce + 2 digits for core number => 3 digits for the peer, must be below 900)

  NONCE_RANGE: 1000 * 1000 * 1000 * 100,

  POW_MAXIMUM_ACCEPTABLE_HANDICAP: 64,
  POW_NB_PAUSES_PER_ROUND: 10,

  // When to trigger the PoW process again if no PoW is triggered for a while. In milliseconds.
  POW_SECURITY_RETRY_DELAY: 10 * 60 * 1000,
};
