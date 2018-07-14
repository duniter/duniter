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

import {PeerDTO} from "../../../../app/lib/dto/PeerDTO"
import {parsers} from "../../../../app/lib/common-libs/parsers/index"

const should   = require('should');
const assert   = require('assert');

const rawPeer = "" +
  "Version: 10\n" +
  "Type: Peer\n" +
  "Currency: beta_brousouf\n" +
  "PublicKey: 3Z7w5g4gC9oxwEbATnmK2UFgGWhLZPmZQb5dRxvNrXDu\n" +
  "Block: 0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855\n" +
  "Endpoints:\n" +
  "BASIC_MERKLED_API duniter.twiced.fr 88.163.127.43 9101\n" +
  "OTHER_PROTOCOL 88.163.127.43 9102\n" +
  "bvuKzc6+cGWMGC8FIkZHN8kdQhaRL/MK60KYyw5vJqkKEgxXbygQHAzfoojeSY4gPKIu4FggBkR1HndSEm2FAQ==\n";

describe('Peer', function(){

  describe('of some key', function(){

    let pr:any

    before(function(done) {
      pr = PeerDTO.fromJSONObject(parsers.parsePeer.syncWrite(rawPeer))
      done();
    });

    it('should be version 10', function(){
      assert.equal(pr.version, 10);
    });

    it('should have beta_brousoufs currency name', function(){
      assert.equal(pr.currency, 'beta_brousouf');
    });

    it('should have public key', function(){
      assert.equal(pr.pubkey, '3Z7w5g4gC9oxwEbATnmK2UFgGWhLZPmZQb5dRxvNrXDu');
    });

    it('should have 2 endpoints', function(){
      assert.equal(pr.endpoints.length, 2);
    });

    it('should have DNS', function(){
      assert.equal(pr.getDns(), 'duniter.twiced.fr');
    });

    it('should have IPv4', function(){
      should.exist(pr.getIPv4());
      assert.equal(pr.getIPv4(), "88.163.127.43");
    });

    it('should have no IPv6 address', function(){
      should.not.exist(pr.getIPv6());
    });

    it('should have port 9101', function(){
      assert.equal(pr.getPort(), 9101);
    });
  });
});
