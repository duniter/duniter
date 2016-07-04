"use strict";
var should = require('should');
var _ = require('underscore');
var co = require('co');
var Q = require('q');
var Block = require('../../app/lib/entity/block');

describe('Entities', () => {

    it('testing Block', () => {
        let block = new Block({ dividend: 2 });
        block.should.have.property("dividend").equal(2);
    });
});
