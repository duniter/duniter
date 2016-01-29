"use strict";
var user   = require('./../tools/user');
var co = require('co');

module.exports = function(node1) {

  var cat = user('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, node1);
  var tac = user('tac', { pub: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', sec: '2HuRLWgKgED1bVio1tdpeXrf7zuUszv1yPHDsDj7kcMC4rVSN9RC58ogjtKNfTbH1eFz7rn38U1PywNs3m6Q7UxE'}, node1);
  var tic = user('tic', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, node1);
  var toc = user('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, node1);

  return [
    function(done) {
      return co(function *() {
        // Self certifications
        yield cat.selfCertP();
        yield tac.selfCertP();
        yield tic.selfCertP();
        yield toc.selfCertP();
        yield cat.certP(tac);
        yield cat.certP(tic);
        yield cat.certP(toc);
        yield tac.certP(cat);
        yield tac.certP(tic);
        yield tic.certP(cat);
        yield tic.certP(tac);
        yield toc.certP(cat);
        yield cat.joinP();
        yield tac.joinP();
        yield tic.joinP();
        yield toc.joinP();
        yield node1.commitP();
        yield node1.commitP();
        yield toc.leaveP();
        yield node1.commitP();
        yield tac.certP(toc);
        yield tic.certP(toc);
        yield toc.certP(tic); // Should be taken in 1 block
        yield toc.certP(tac); // Should be taken in 1 other block
        yield node1.commitP();
        yield node1.commitP();
      })
        .then(done).catch(done);
    }
  ];
};
