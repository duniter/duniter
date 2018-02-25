import {unlock} from "../../../../app/lib/common-libs/txunlock"

const assert = require('assert')

describe('Grammar', () => {

  let k1 = "HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd"
  let k2 = "GgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd"
  let k3 = "IgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd"
  let Ha = "CA978112CA1BBDCAFAC231B39A23DC4DA786EFF8147C4E72B9807785AFEE48BB"
  let Hz = "594E519AE499312B29433B7DD8A97FF068DEFCBA9755B6D5D00E84C524D67B06"

  it('SIG should work', () => {
    assert.equal(unlock('SIG(' + k1 + ')', ['SIG(0)'], { sigs: [{ k:k1, ok:true }] }), true)
    assert.equal(unlock('SIG(' + k1 + ')', ['SIG(0)'], { sigs: [{ k:k1, ok:false }] }), null)
    assert.equal(unlock('SIG(' + k1 + ')', ['SIG(0)'], { sigs: [{ k:k2, ok:true }] }), false)
    assert.equal(unlock('SIG(' + k2 + ')', ['SIG(0)'], { sigs: [{ k:k2, ok:true }] }), true)
  })

  it('SIG should work', () => {
    assert.equal(unlock('SIG(' + k1 + ')', ['SIG(0)'], { sigs: [{ k:k1, ok:true }] }), true)
    assert.equal(unlock('SIG(' + k1 + ')', ['SIG(0)'], { sigs: [{ k:k1, ok:false }] }), null)
    assert.equal(unlock('SIG(' + k1 + ')', ['SIG(0)'], { sigs: [{ k:k2, ok:true }] }), false)
    assert.equal(unlock('SIG(' + k2 + ')', ['SIG(0)'], { sigs: [{ k:k2, ok:true }] }), true)
  })

  it('XHX should work', () => {
    assert.equal(unlock('XHX(' + Ha + ')', ['XHX(a)'], { sigs: []}), true)
    assert.equal(unlock('XHX(' + Hz + ')', ['XHX(z)'], { sigs: []}), true)
    assert.equal(unlock('XHX(' + Hz + ')', ['XHX(a)'], { sigs: []}), null)
    assert.equal(unlock('XHX(' + Ha + ')', ['XHX(z)'], { sigs: []}), null)
  })
  
  it('&& keywork should work', () => {
    assert.equal(unlock('SIG(' + k1 + ') && SIG(' + k2 + ')', ['SIG(0)', 'SIG(0)'], { sigs: [{ k:k1, ok:true }, { k:k1, ok:true }] }), false)
    assert.equal(unlock('SIG(' + k1 + ') && SIG(' + k2 + ')', ['SIG(0)', 'SIG(0)'], { sigs: [{ k:k1, ok:true }, { k:k2, ok:true }] }), false)
    assert.equal(unlock('SIG(' + k1 + ') && SIG(' + k2 + ')', ['SIG(0)', 'SIG(1)'], { sigs: [{ k:k1, ok:true }, { k:k3, ok:true }] }), false)
    assert.equal(unlock('SIG(' + k1 + ') && SIG(' + k2 + ')', ['SIG(0)', 'SIG(1)'], { sigs: [{ k:k1, ok:true }, { k:k2, ok:true }] }), true)
  })
  
  it('|| keywork should work', () => {
    assert.equal(unlock('SIG(' + k1 + ') || SIG(' + k2 + ')', ['SIG(0)'], { sigs: [{ k:k1, ok:true }] }), true)
    assert.equal(unlock('SIG(' + k1 + ') || SIG(' + k2 + ')', ['SIG(0)'], { sigs: [{ k:k2, ok:true }] }), true)
    assert.equal(unlock('SIG(' + k1 + ') || SIG(' + k2 + ')', ['SIG(0)', 'SIG(1)'], { sigs: [{ k:k1, ok:true }, { k:k2, ok:true }] }), true)
    assert.equal(unlock('SIG(' + k1 + ') || SIG(' + k2 + ')', ['SIG(0)', 'SIG(1)'], { sigs: [{ k:k1, ok:false }, { k:k2, ok:false }] }), null)
  })
  
  it('|| && keyworks combined should work', () => {
    assert.equal(unlock('SIG(' + k1 + ') || (SIG(' + k1 + ') && SIG(' + k2 + '))', ['SIG(0)','SIG(0)','SIG(1)'], { sigs: [{ k:k1, ok:true }, { k:k2, ok:true }] }), true)
    assert.equal(unlock('SIG(' + k2 + ') || (SIG(' + k1 + ') && SIG(' + k2 + '))', ['SIG(0)','SIG(0)','SIG(1)'], { sigs: [{ k:k1, ok:true }, { k:k1, ok:false }, { k:k2, ok:true }] }), null)
  })
  
  it('SIG XHX functions combined should work', () => {
    assert.equal(unlock('SIG(' + k1 + ') && XHX(' + Ha + ')', ['SIG(0)', 'XHX(a)'], { sigs: [{ k:k1, ok:true }] }), true)
    assert.equal(unlock('SIG(' + k1 + ') && XHX(' + Ha + ')', ['SIG(0)', 'XHX(z)'], { sigs: [{ k:k1, ok:true }] }), null)
    assert.equal(unlock('SIG(' + k1 + ') || XHX(' + Ha + ')', ['SIG(0)', 'XHX(a)'], { sigs: [{ k:k1, ok:true }] }), true)
    assert.equal(unlock('SIG(' + k1 + ') || XHX(' + Ha + ')', ['SIG(0)', 'XHX(z)'], { sigs: [{ k:k1, ok:true }] }), null)
    assert.equal(unlock('SIG(' + k1 + ') || XHX(' + Ha + ')', ['SIG(0)'], { sigs: [{ k:k1, ok:true }] }), true)
    assert.equal(unlock('SIG(' + k1 + ') || XHX(' + Ha + ')', ['SIG(0)', 'XHX(z)'], { sigs: [{ k:k1, ok:false }] }), null)
    assert.equal(unlock('SIG(' + k1 + ') || XHX(' + Ha + ')', ['SIG(0)', 'XHX(a)'], { sigs: [{ k:k1, ok:false }] }), null)
    assert.equal(unlock('SIG(' + k1 + ') || XHX(' + Ha + ')', ['SIG(0)', 'XHX(a)'], { sigs: [{ k:k2, ok:true }] }), true)
  })
  
  it('SIG, XHX, &&, || words combined should work', () => {
    assert.equal(unlock('SIG(' + k1 + ') && XHX(' + Ha + ') || XHX(' + Hz + ')', ['SIG(0)', 'XHX(a)', 'XHX(z)'], { sigs: [{ k:k1, ok:true }] }), true)
    assert.equal(unlock('SIG(' + k1 + ') && XHX(' + Ha + ') || XHX(' + Hz + ')', ['SIG(0)', 'XHX(a)', 'XHX(a)'], { sigs: [{ k:k1, ok:true }] }), true)
    assert.equal(unlock('SIG(' + k1 + ') && XHX(' + Ha + ') || XHX(' + Hz + ')', ['SIG(0)', 'XHX(z)', 'XHX(a)'], { sigs: [{ k:k1, ok:true }] }), true) // The order does not matter
    assert.equal(unlock('SIG(' + k1 + ') && XHX(' + Ha + ') || XHX(' + Hz + ')', ['SIG(0)', 'XHX(a)', 'XHX(a)'], { sigs: [{ k:k1, ok:false }] }), null) // H(z) is false
    assert.equal(unlock('SIG(' + k1 + ') && XHX(' + Ha + ') || XHX(' + Hz + ')', ['SIG(0)', 'XHX(a)', 'XHX(z)'], { sigs: [{ k:k2, ok:true }] }), true) // H(z) is true
    assert.equal(unlock('SIG(' + k1 + ') && XHX(' + Ha + ') || XHX(' + Hz + ')', ['SIG(0)', 'XHX(z)', 'XHX(z)'], { sigs: [{ k:k2, ok:true }] }), true) // H(z) is true
    assert.equal(unlock('(SIG(EA7Dsw39ShZg4SpURsrgMaMqrweJPUFPYHwZA8e92e3D) || XHX(03AC674216F3E15C761EE1A5E255F067953623C8B388B4459E13F978D7C846F4))', ['SIG(0)', 'XHX(1234)'], { sigs: [{ k:k1, ok:true }] }), true)
  })
  
  it('CSV+CLTV+1of2SIG', () => {
    assert.equal(unlock('(SIG(HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd) || SIG(2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc)) && (CSV(10) || CLTV(1500000000))', ['SIG(0)'], { sigs: [{ k:'2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', ok:true }] }, {"currentTime":1499999999,"elapsedTime":9}), false)
    assert.equal(unlock('(SIG(HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd) || SIG(2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc)) && (CSV(10) || CLTV(1500000000))', ['SIG(0)'], { sigs: [{ k:'2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', ok:true }] }, {"currentTime":1499999999,"elapsedTime":10}), true)
    assert.equal(unlock('(SIG(HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd) || SIG(2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc)) && (CSV(10) || CLTV(1500000000))', ['SIG(0)'], { sigs: [{ k:'2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', ok:true }] }, {"currentTime":1499999999,"elapsedTime":9}), false)
    assert.equal(unlock('(SIG(HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd) || SIG(2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc)) && (CSV(10) || CLTV(1500000000))', ['SIG(0)'], { sigs: [{ k:'2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', ok:true }] }, {"currentTime":1500000000,"elapsedTime":9}), true)
  })
  
  it('Wrong syntax should return `null`', () => {
    assert.equal(unlock('XHX(03AC674216F3E15C761EE1A5E255F067953623C8B388B4459E13F978D7C846F4))', [], { sigs: [] }), null)
  })
})
