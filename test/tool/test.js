var should   = require('should');
var assert   = require('assert');
var request  = require('supertest');
var async    = require('async');
var mongoose = require('mongoose');
var fs       = require('fs');
var sha1     = require('sha1');
var _        = require('underscore');

module.exports = {}

module.exports.HTTPTestCase = function (label, params) {
  
  var that = this;

  // Test label
  this.label = label;

  // Task to be launched
  this.task = function (next) {
    params.task(function (err, res) {

      // Test function
      that.test = _.partial(params.test, res);
      next();
    });
  };
  return this;
}

module.exports.tester = function (currency) {

  var app;

  this.create = function (params) {
    return new module.exports.HTTPTestCase(params.label, {
      task: params.task,
      test: params.test
    });
  };

  this.verify = function (label, task, test) {
    return new module.exports.HTTPTestCase(label, {
      task: task,
      test: test
    });
  };

  /**
  * Test that HTTP response code matches given HTTP code.
  **/
  this.expectedHTTPCode = function (code) {
    return function (res) {
      should.exist(res.statusCode);
      res.statusCode.should.equal(code);
    };
  };

  /**
  * Test that given result is a merkle tree matching given root value.
  * @param root The root value of Merkle tree.
  * @param leavesCount The l
  **/
  this.expectedMerkle = function (root, leavesCount) {
    return successToJson(function (json) {
      expectedMerkle(json, root, leavesCount);
    });
  };

  /**
  * Test that given result is a public key matching given fingerprint.
  **/
  this.expectedPubkey = function (fingerprint) {
    return successToJson(function (json) {
      isPubKey(json);
      json.key.fingerprint.should.equal(fingerprint);
    });
  };

  /**
  * Test that given result is a public key matching given fingerprint.
  **/
  this.expectedMembership = function (fingerprint) {
    return successToJson(function (json) {
      isMembership(json);
      json.membership.issuer.should.equal(fingerprint);
    });
  };

  this.doGet = function (url) {
    return function (next) {
      get(url, next);
    };
  };

  this.pksAdd = function (keytext, keysign) {
    return function (done) {
      post('/pks/add', {
        "keytext": keytext,
        "keysign": keysign
      }, done);
    };
  };

  this.join = function (signatory) {
    var Membership = mongoose.model('Membership');
    return function (done) {
      var ms = new Membership({ version: 1, currency: currency, issuer: signatory.fingerprint(), membership: 'JOIN' });
      var raw = ms.getRaw();
      var sig = signatory.sign(raw);
      post ('/ucs/community/members', {
        'membership': raw,
        'signature': sig
      }, done);
    };
  };

  this.app = function (appToSet) {
    app = appToSet;
  };

  function successToJson (subTest) {
    return function (res) {
      should.exist(res.statusCode);
      res.statusCode.should.equal(200);
      should.exist(res.text);
      // jsoning
      var json = null;
      try {
        json = JSON.parse(res.text);
      } catch(ex) {
      }
      should.exist(json);
      subTest(json);
    };
  }

  function get (url, done) {
    request(app)
      .get(url)
      .end(done);
  }

  function post (url, data, done) {
    request(app)
      .post(url)
      .send(data)
      .end(done);
  }

  return this;
};

function expectedMerkle (json, root, leavesCount) {
  isMerkleSimpleResult(json);
  json.root.should.equal(root);
}

function isMerkleSimpleResult (json) {
  isMerkleResult(json);
  json.should.not.have.property('leaf');
  json.should.not.have.property('leaves');
}

function isMerkleLeafResult (json) {
  isMerkleResult(json);
  json.should.have.property('leaf');
  json.should.not.have.property('leaves');
}

function isMerkleLeavesResult (json) {
  isMerkleResult(json);
  json.should.have.property('leaves');
  json.should.not.have.property('leaf');
  _(json.leaves).each(function (leaf) {
    leaf.should.have.property('hash');
    leaf.should.have.property('value');
  });
}

function isMerkleResult (json) {
  json.should.have.property('depth');
  json.should.have.property('nodesCount');
  json.should.have.property('leavesCount');
  json.should.have.property('root');
}

function isPubKey (json) {
  json.should.have.property('signature');
  json.should.have.property('key');
  json.key.should.have.property('email');
  json.key.should.have.property('name');
  json.key.should.have.property('fingerprint');
  json.key.should.have.property('raw');
  json.key.should.not.have.property('_id');
  json.key.raw.should.not.match(/-----/g);
}

function isMembership (json) {
  json.should.have.property('signature');
  json.should.have.property('membership');
  json.membership.should.have.property('version');
  json.membership.should.have.property('currency');
  json.membership.should.have.property('issuer');
  json.membership.should.have.property('membership');
  json.membership.should.have.property('sigDate');
  json.membership.should.have.property('raw');
  json.membership.should.not.have.property('_id');
  json.membership.raw.should.not.match(/-----/g);
}
