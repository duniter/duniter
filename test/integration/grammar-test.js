"use strict";

var unlock    = require('../../app/lib/txunlock');

describe('Grammar', () => {

  let k1 = "HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd";
  let k2 = "GgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd";
  let Ha = "CA978112CA1BBDCAFAC231B39A23DC4DA786EFF8147C4E72B9807785AFEE48BB";
  let Hz = "594E519AE499312B29433B7DD8A97FF068DEFCBA9755B6D5D00E84C524D67B06";

  it('SIG should work', () => {

    unlock('SIG(' + k1 + ')', [{ pubkey: k1, sigOK: true }]).should.equal(true);
    unlock('SIG(' + k1 + ')', [{ pubkey: k1, sigOK: false }]).should.equal(false);
    unlock('SIG(' + k1 + ')', [{ pubkey: k2, sigOK: false }]).should.equal(false);
    unlock('SIG(' + k1 + ')', [{ pubkey: k2, sigOK: true }]).should.equal(false);
  });

  it('XHX should work', () => {

    unlock('XHX(' + Ha + ')', ['a']).should.equal(true);
    unlock('XHX(' + Hz + ')', ['z']).should.equal(true);
    unlock('XHX(' + Hz + ')', ['a']).should.equal(false);
    unlock('XHX(' + Ha + ')', ['z']).should.equal(false);
  });

  it('&& keywork should work', () => {

    unlock('SIG(' + k1 + ') && SIG(' + k2 + ')', [{ pubkey: k1, sigOK: true }, { pubkey: k1, sigOK: true }]).should.equal(false);
    unlock('SIG(' + k1 + ') && SIG(' + k2 + ')', [{ pubkey: k1, sigOK: true }, { pubkey: k2, sigOK: false }]).should.equal(false);
    unlock('SIG(' + k1 + ') && SIG(' + k2 + ')', [{ pubkey: k1, sigOK: true }, { pubkey: k2, sigOK: true }]).should.equal(true);
  });

  it('|| keywork should work', () => {

    unlock('SIG(' + k1 + ') || SIG(' + k2 + ')', [{ pubkey: k1, sigOK: true }, { pubkey: k2, sigOK: true }]).should.equal(true);
    unlock('SIG(' + k1 + ') || SIG(' + k2 + ')', [{ pubkey: k1, sigOK: false }, { pubkey: k2, sigOK: true }]).should.equal(true);
    unlock('SIG(' + k1 + ') || SIG(' + k2 + ')', [{ pubkey: k1, sigOK: true }, { pubkey: k2, sigOK: false }]).should.equal(true);
    unlock('SIG(' + k1 + ') || SIG(' + k2 + ')', [{ pubkey: k1, sigOK: false }, { pubkey: k2, sigOK: false }]).should.equal(false);
  });

  it('|| && keyworks combined should work', () => {

    unlock('SIG(' + k1 + ') || (SIG(' + k1 + ') && SIG(' + k2 + '))', [{ pubkey: k1, sigOK: true },{ pubkey: k1, sigOK: true },{ pubkey: k2, sigOK: true }]).should.equal(true);
    unlock('SIG(' + k2 + ') || (SIG(' + k1 + ') && SIG(' + k2 + '))', [{ pubkey: k2, sigOK: false },{ pubkey: k1, sigOK: true },{ pubkey: k2, sigOK: false }]).should.equal(false);
  });

  it('SIG XHX functions combined should work', () => {

    unlock('SIG(' + k1 + ') && XHX(' + Ha + ')', [{ pubkey: k1, sigOK: true },'a']).should.equal(true);
    unlock('SIG(' + k1 + ') && XHX(' + Ha + ')', [{ pubkey: k1, sigOK: true },'z']).should.equal(false);
    unlock('SIG(' + k1 + ') || XHX(' + Ha + ')', [{ pubkey: k1, sigOK: true },'a']).should.equal(true);
    unlock('SIG(' + k1 + ') || XHX(' + Ha + ')', [{ pubkey: k1, sigOK: true },'z']).should.equal(true);
    unlock('SIG(' + k1 + ') || XHX(' + Ha + ')', [{ pubkey: k1, sigOK: false },'z']).should.equal(false);
    unlock('SIG(' + k1 + ') || XHX(' + Ha + ')', [{ pubkey: k1, sigOK: false },'a']).should.equal(true);
  });

  it('SIG, XHX, &&, || words combined should work', () => {

    unlock('SIG(' + k1 + ') && XHX(' + Ha + ') || XHX(' + Hz + ')', [{ pubkey: k1, sigOK: true },'a','z']).should.equal(true);
    unlock('SIG(' + k1 + ') && XHX(' + Ha + ') || XHX(' + Hz + ')', [{ pubkey: k1, sigOK: true },'a','a']).should.equal(true);
    unlock('SIG(' + k1 + ') && XHX(' + Ha + ') || XHX(' + Hz + ')', [{ pubkey: k1, sigOK: true },'z','a']).should.equal(false);
    unlock('SIG(' + k1 + ') && XHX(' + Ha + ') || XHX(' + Hz + ')', [{ pubkey: k1, sigOK: false },'a','a']).should.equal(false);
    unlock('SIG(' + k1 + ') && XHX(' + Ha + ') || XHX(' + Hz + ')', [{ pubkey: k1, sigOK: false },'a','z']).should.equal(true);
    unlock('SIG(' + k1 + ') && XHX(' + Ha + ') || XHX(' + Hz + ')', [{ pubkey: k1, sigOK: false },'z','z']).should.equal(true);
  });
});
