var should = require('should');
var assert = require('assert');
var async  = require('async');
var sha1   = require('sha1');
var fs     = require('fs');
var coiner = require('../app/lib/coiner');
var log4js = require('log4js');
var logger = log4js.getLogger('test coins');

logger.setLevel('WARN');

describe('Testing coin distribution algo, we should have ', function(){

  // Power 2 values - simple cases
  testCoinerFor2Power(Math.pow(2, 0), 0);
  testCoinerFor2Power(Math.pow(2, 1), 0);
  testCoinerFor2Power(Math.pow(2, 5), 0);
  testCoinerFor2Power(Math.pow(2, 5), 1);
  testCoinerFor2Power(Math.pow(2, 5), 2);
  testCoinerFor2Power(Math.pow(2, 6), 2);
  testCoinerFor2Power(Math.pow(2, 14), 4);

  // Non-power 2 values
  testCoinerForNon2Power(129, 0);
  testCoinerForNon2Power(16397, 0);
  testCoinerForNon2Power(10, 3, 3);
  testCoinerForNon2Power(300, 3, 3);
  testCoinerForNon2Power(2300300, 3, 25);
  testCoinerForNon2Power(1073741824, 23, 25);

  testCoinsForDividend(1, 0, 0, [1]);
  testCoinsForDividend(2, 0, 0, [2]);
  testCoinsForDividend(3, 0, 0, [3]);
  testCoinsForDividend(4, 0, 0, [4]);
  testCoinsForDividend(5, 0, 0, [5]);
  testCoinsForDividend(6, 0, 0, [6]);
  testCoinsForDividend(7, 0, 0, [7]);
  testCoinsForDividend(8, 0, 0, [6,1]);
  testCoinsForDividend(9, 0, 0, [7,1]);
  testCoinsForDividend(12, 0, 0, [10,1]);
  testCoinsForDividend(16, 0, 0, [8,2,1]);
  testCoinsForDividend(32, 0, 0, [10,3,2,1]);
  testCoinsForDividend(100, 0, 0, [26,7,5,3,1]);
  testCoinsForDividend(150, 0, 0, [28,7,5,3,2,1]);
  testCoinsForDividend(225, 0, 0, [37,12,9,6,3,1]);
});

function testCoinerFor2Power (value, l, sum) {
  it('coins for value 2^' + value + ' = ' + sum + ', limit ' + l, function(){
  logger.info('-----------');
    var computed = 0;
    coiner(value, l).coins.forEach(function(Pn){
      logger.info(Pn);
      Pn.forEach(function(coinPower){
        computed += Math.pow(2, coinPower);
      });
    });
    assert.equal(computed, value);
  });
}

function testCoinerForNon2Power (value, l, p) {
  it('coins for value ' + value + ', limit ' + l, function(){
  logger.info('-----------');
    var computed = 0;
    coiner(value, l, p).coins.forEach(function(Pn){
      logger.info(Pn);
      Pn.forEach(function(coinPower){
        computed += Math.pow(2, coinPower);
      });
    });
    assert.equal(computed, value);
  });
}

function testCoinsForDividend (dividend, l, p, expectedArray) {
  it('coins for dividend ' + dividend + ' should be ' + JSON.stringify(expectedArray), function(){
    var res = coiner(dividend, l, p);
    assert.deepEqual(res.coinList, expectedArray);
  });
}
