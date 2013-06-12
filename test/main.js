
var should = require('should');
var emptyArray = require('../lib/main');

describe('emptyArray', function () {
	describe('with no arguments', function () {
		it('returns an empty array', function () {
			var result = emptyArray();
			result.should.eql([]);
		});
	});
});