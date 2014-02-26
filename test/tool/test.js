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
  var ttlQueue = function (minTimeInMs) {
    var last = new Date().getTime();

    return async.queue(function (task, callback) {
      now = new Date().getTime();
      var past = now - last;
      var wait = past > minTimeInMs ? 0 : minTimeInMs - past;
      // console.log("QUEUE: waiting...");
      setTimeout(function () {
        last = new Date().getTime();
        // console.log("QUEUE: running task (waited " + wait + "ms/" + minTimeInMs + "ms)");
        task(callback);
      }, wait);
    }, 1);
  };

  var queueOfMsVt = ttlQueue(1000);
  var queueOfVotes = ttlQueue(1000);

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

  this.delay = function (delayInMilliseconds) {
    return new module.exports.HTTPTestCase('Waiting ' + delayInMilliseconds + 'ms', {
      task: function (done) {
        console.log('Waiting ' + delayInMilliseconds + 'ms..');
        setTimeout(done, delayInMilliseconds);
      },
      test: function () {
        (true).should.be.ok;
      }
    });
  };

  this.job = function (jobFunc) {
    return new module.exports.HTTPTestCase('Making some between tests task', {
      task: function (done) {
        jobFunc(done);
      },
      test: function () {
        (true).should.be.ok;
      }
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
  * Test that given result is a membership matching given fingerprint.
  **/
  this.expectedMembership = function (fingerprint) {
    return successToJson(function (json) {
      isMembership(json);
      json.membership.issuer.should.equal(fingerprint);
    });
  };

  /**
  * Test that given result is a voting document matching given voting key.
  **/
  this.expectedVoting = function (votingKey) {
    return successToJson(function (json) {
      isVoting(json);
      json.voting.votingKey.should.equal(votingKey);
    });
  };

  /**
  * Test that given result is an amendment matching given properties.
  **/
  this.expectedAmendment = function (properties) {
    return successToJson(function (json) {
      isAmendment(json);
      checkProperties(properties || {}, json);
    });
  };

  /**
  * Test that given result is a signed transaction matching given properties.
  **/
  this.expectedSignedTransaction = function (properties) {
    return successToJson(function (json) {
      json.should.have.property('signature');
      json.should.have.property('raw');
      json.should.have.property('transaction');
      isTransaction(json.transaction);
      checkProperties(properties || {}, json.transaction);
    });
  };

  /**
  * Test that given result is a signed amendment matching given properties.
  **/
  this.expectedSignedAmendment = function (properties) {
    return successToJson(function (json) {
      json.should.have.property('signature');
      json.should.have.property('amendment');
      isAmendment(json.amendment);
      checkProperties(properties, json.amendment);
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

  this.setVoter = function (signatory, fingerprint) {
    var Voting = mongoose.model('Voting');
    return function (done) {
      queueOfMsVt.push(function (cb) {
        var ms = new Voting({ version: 1, currency: currency, issuer: signatory.fingerprint(), votingKey: fingerprint || signatory.fingerprint() });
        var raw = ms.getRaw();
        var sig = signatory.sign(raw);
        post ('/ucs/community/voters', {
          'voting': raw,
          'signature': sig
        }, cb);
      }, done);
    };
  };

  this.join = function (signatory) {
    var Membership = mongoose.model('Membership');
    return function (done) {
      queueOfMsVt.push(function (cb) {
        var ms = new Membership({ version: 1, currency: currency, issuer: signatory.fingerprint(), membership: 'JOIN' });
        var raw = ms.getRaw();
        var sig = signatory.sign(raw);
        post ('/ucs/community/members', {
          'membership': raw,
          'signature': sig
        }, cb);
      }, done);
    };
  };

  this.actualize = function (signatory) {
    var Membership = mongoose.model('Membership');
    return function (done) {
      queueOfMsVt.push(function (cb) {
        var ms = new Membership({ version: 1, currency: currency, issuer: signatory.fingerprint(), membership: 'ACTUALIZE' });
        var raw = ms.getRaw();
        var sig = signatory.sign(raw);
        post ('/ucs/community/members', {
          'membership': raw,
          'signature': sig
        }, cb);
      }, done);
    };
  };

  this.leave = function (signatory) {
    var Membership = mongoose.model('Membership');
    return function (done) {
      queueOfMsVt.push(function (cb) {
        var ms = new Membership({ version: 1, currency: currency, issuer: signatory.fingerprint(), membership: 'LEAVE' });
        var raw = ms.getRaw();
        var sig = signatory.sign(raw);
        post ('/ucs/community/members', {
          'membership': raw,
          'signature': sig
        }, cb);
      }, done);
    };
  };

  this.selfVote = function (number) {
    return function (done) {
      queueOfVotes.push(function (cb) {
        get ('/ucs/amendment/'+ number + '/vote', cb);
      }, done);
    };
  };

  this.vote = function (signatory) {
    return function (done) {
      queueOfVotes.push(function (cb) {
        async.waterfall([
          function (next){
            get ('/ucs/amendment', next);
          },
          function (res, next){
            var json = JSON.parse(res.text);
            var sig = signatory.sign(json.raw);
            post('/hdc/amendments/votes', {
              'amendment': json.raw,
              'signature': sig
            }, next);
          },
        ], cb);
      }, done);
    };
  };

  this.voteCurrent = function (signatory) {
    return function (done) {
      async.waterfall([
        function (next){
          get ('/hdc/amendments/current', next);
        },
        function (res, next){
          var json = JSON.parse(res.text);
          var sig = signatory.sign(json.raw);
          post('/hdc/amendments/votes', {
            'amendment': json.raw,
            'signature': sig
          }, next);
        },
      ], done);
    };
  };

  this.app = function (appToSet) {
    app = appToSet;
  };

  this.get = function (url, done) {
    get(url, done);
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

function checkProperties (properties, obj) {
  _(properties).keys().forEach(function(key){
    obj.should.have.property(key);
    if (properties[key] != null) {
      if (properties[key] instanceof Array) {
        // Must be both Arrays with exact same values
        obj[key].should.be.an.Array;
        obj[key].should.have.length(properties[key].length);
        obj[key].forEach(function(value, index){
          value.should.equal(properties[key][index]);
        });
      }
      else obj.should.have.property(key, properties[key]);
    }
    else should.not.exist(obj[key]);
  });
}

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

function isVoting (json) {
  json.should.have.property('signature');
  json.should.have.property('voting');
  json.voting.should.have.property('version');
  json.voting.should.have.property('currency');
  json.voting.should.have.property('issuer');
  json.voting.should.have.property('votingKey');
  json.voting.should.have.property('sigDate');
  json.voting.should.have.property('raw');
  json.voting.should.not.have.property('_id');
  json.voting.raw.should.not.match(/-----/g);
}

function isAmendment (json) {
  var mandatories = [
    "version",
    "currency",
    "generated",
    "number",
    "votersRoot",
    "votersCount",
    "votersChanges",
    "membersRoot",
    "membersCount",
    "membersChanges",
    "raw"
  ];
  json.should.have.properties(mandatories);
  mandatories.forEach(function(prop){
    should.exist(json[prop]);
  });
  var optional = [
    "dividend",
    "coinMinPower",
    "previousHash"
  ];
  json.should.have.properties(optional);
  if (json.number > 0) {
    json.should.have.property('previousHash');
  }
  // Numbers
  json.version.should.be.a.Number.and.not.be.below(1);
  json.generated.should.be.a.Number.and.not.be.below(0);
  json.number.should.be.a.Number.and.not.be.below(0);
  if (json.dividend) {
    json.dividend.should.be.a.Number.and.be.above(0);
  }
  if (json.coinMinimalPower) {
    json.coinMinimalPower.should.be.a.Number.and.be.above(0);
  }
  json.membersCount.should.be.a.Number.and.not.be.below(0);
  json.votersCount.should.be.a.Number.and.not.be.below(0);
  // Strings
  json.currency.should.be.a.String.and.not.be.empty;
  if (json.previousHash) {
    json.previousHash.should.be.a.String.and.match(/^[A-Z0-9]{40}$/);
  }
  if (json.membersCount > 0) {
    json.membersRoot.should.be.a.String.and.match(/^[A-Z0-9]{40}$/);
  } else {
    json.membersRoot.should.be.a.String.and.be.empty;
  }
  if (json.votersCount > 0) {
    json.votersRoot.should.be.a.String.and.match(/^[A-Z0-9]{40}$/);
  } else {
    json.votersRoot.should.be.a.String.and.be.empty;
  }
  json.membersChanges.should.be.an.Array;
  json.membersChanges.forEach(function(change){
    change.should.match(/^(\+|-)[A-Z0-9]{40}$/);
  });
  json.votersChanges.should.be.an.Array;
  json.votersChanges.forEach(function(change){
    change.should.match(/^(\+|-)[A-Z0-9]{40}$/);
  });
}

function isTransaction (json) {
  var mandatories = [
    "version",
    "currency",
    "sender",
    "number",
    "recipient",
    "type",
    "coins",
    "comment"
  ];
  json.should.have.properties(mandatories);
  mandatories.forEach(function(prop){
    should.exist(json[prop]);
  });
  var optional = [
    "previousHash"
  ];
  json.should.have.properties(optional);
  if (json.number > 0) {
    json.should.have.property('previousHash');
  }
  // Numbers
  json.version.should.be.a.Number.and.not.be.below(1);
  json.number.should.be.a.Number.and.not.be.below(0);
  // Strings
  json.currency.should.be.a.String.and.not.be.empty;
  json.type.should.be.a.String.and.not.be.empty.and.match(/^(ISSUANCE|CHANGE|TRANSFER)$/);
  if (json.previousHash) {
    json.previousHash.should.be.a.String.and.match(/^[A-Z0-9]{40}$/);
  }
  json.coins.should.be.an.Array;
  json.coins.forEach(function(coin){
    coin.should.have.property("id");
    coin.should.have.property("transaction_id");
    coin.id.should.match(/^([A-Z\d]{40}-\d+-\d-\d+-(A|C)-\d+)$/);
    coin.transaction_id.should.match(/^([A-Z\d]{40}-\d+)?$/);
  });
}
