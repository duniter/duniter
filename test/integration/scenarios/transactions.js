var user   = require('./../tools/user');

module.exports = function(node) {

  var tic = user('tic', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, node);
  var toc = user('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, node);

  var now = Math.round(new Date().getTime()/1000);

  return [
    // Self certifications
    tic.selfCert(now),
    toc.selfCert(now),
    // Certifications
    tic.cert(toc),
    toc.cert(tic),
    tic.join(),
    toc.join(),
    node.commit(),
    node.commit(),
    node.commit(),
    tic.send(51, toc),
    node.commit()
  ];
};
