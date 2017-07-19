"use strict";
let should = require('should');
let BlockDTO = require('../../app/lib/dto/BlockDTO').BlockDTO

describe('Entities', () => {

  it('testing Block', () => {
    let block = BlockDTO.fromJSONObject({ dividend: 2 });
    block.should.have.property("dividend").equal(2);
  });
});
