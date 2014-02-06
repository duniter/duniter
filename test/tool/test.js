var should    = require('should');
var assert    = require('assert');
var request   = require('supertest');
var async     = require('async');
var fs        = require('fs');
var sha1      = require('sha1');
var _         = require('underscore');

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

module.exports.tester = function () {

  var app;

  this.create = function (params) {
    return new module.exports.HTTPTestCase(params.label, {
      task: params.task,
      test: params.test
    });
  };

  /**
  * Test that given result is a merkle tree matching given root value.
  * @param root The root value of Merkle tree.
  * @param leavesCount The l
  **/
  this.expectMerkle = function (root, leavesCount) {
    return function (res) {
      // Basic testing
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
      // Real test
      expectMerkle(json, root, leavesCount);
    };
  };

  this.doGet = function (url) {
    return function (next) {
      get(url, next);
    };
  };

  this.pksAdd = function (keytext, keysign, done) {
    post('/pks/add', {
      "keytext": keytext,
      "keysign": keysign
    }, done);
  };

  this.app = function (appToSet) {
    app = appToSet;
  };

  function get (url, done) {
    request(app)
      .get(url)
      .end(done);
  }

  function post (url, data, done) {
    request(app)
      .post(url)
      .send(data)
      .end(onHttpResult(url, done));
  }

  return this;
};

function expectMerkle (json, root, leavesCount) {
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
