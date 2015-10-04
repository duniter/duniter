"use strict";
var user   = require('./../tools/user');
var co = require('co');
var Q = require('q');

module.exports = function(node) {

  var tic = user('tic', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, node);
  var toc = user('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, node);

  var now = Math.round(new Date().getTime()/1000);

  return [
    function(done) {
      return co(function *() {
        // Self certifications
        yield tic.selfCertP(now);
        yield toc.selfCertP(now);
        // Certification;
        yield tic.certP(toc);
        yield toc.certP(tic);
        yield tic.joinP();
        yield toc.joinP();
        yield node.commitP();
        yield node.commitP();
        yield tic.sendP(51, toc);
        yield node.commitP();
      })
        .then(done).catch(done);
    }
  ];
};
