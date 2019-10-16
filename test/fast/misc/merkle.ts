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

import {MerkleDTO} from "../../../app/lib/dto/MerkleDTO"

const should = require('should');
const assert = require('assert');

describe("Merkle ['a', 'b', 'c', 'd', 'e']", function(){

  const m = new MerkleDTO() as any
  m.initialize(['a', 'b', 'c', 'd', 'e']);

  it('should have root 16E6BEB3E080910740A2923D6091618CAA9968AEAD8A52D187D725D199548E2C', function(){
    assert.equal(m.levels[0], '16E6BEB3E080910740A2923D6091618CAA9968AEAD8A52D187D725D199548E2C');
  });

  it('should have level 1,0 AB4587D9F4AD6990E0BF4A1C5A836C78CCE881C2B7C4287C0A7DA15B47B8CF1F', function(){
    assert.equal(m.levels[1][0], 'AB4587D9F4AD6990E0BF4A1C5A836C78CCE881C2B7C4287C0A7DA15B47B8CF1F');
  });

  it('should have level 1,1 3F79BB7B435B05321651DAEFD374CDC681DC06FAA65E374E38337B88CA046DEA', function(){
    assert.equal(m.levels[1][1], '3F79BB7B435B05321651DAEFD374CDC681DC06FAA65E374E38337B88CA046DEA');
  });

  it('should have 4 levels', function(){
    assert.equal(m.levels.length, 4);
  });

  it('should have depth: 3', function(){
    assert.equal(m.depth, 3);
  });

  it('should have 6 nodes', function(){
    assert.equal(m.nodes, 6);
  });

  it('should have 5 leaves', function(){
    assert.equal(m.leaves().length, 5);
  });
});

describe("Merkle []", function(){

  const m = new MerkleDTO() as any
  m.initialize([]);

  it('should have root empty', function(){
    assert.equal(m.levels[0], '');
  });

  it('should have 1 levels', function(){
    assert.equal(m.levels.length, 1);
  });

  it('should have depth: 0', function(){
    assert.equal(m.depth, 0);
  });

  it('should have 0 nodes', function(){
    assert.equal(m.nodes, 0);
  });

  it('should have 0 leaves', function(){
    assert.equal(m.leaves().length, 0);
  });
});
