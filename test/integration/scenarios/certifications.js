var user   = require('./../tools/user');

module.exports = function(node1) {

  var cat = user('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, node1);
  var tac = user('tac', { pub: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', sec: '2HuRLWgKgED1bVio1tdpeXrf7zuUszv1yPHDsDj7kcMC4rVSN9RC58ogjtKNfTbH1eFz7rn38U1PywNs3m6Q7UxE'}, node1);
  var tic = user('tic', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, node1);
  var toc = user('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, node1);

  var now = Math.round(new Date().getTime()/1000);

  return [
    // Self certifications
    cat.selfCert(now),
    tac.selfCert(now),
    tic.selfCert(now),
    toc.selfCert(now),
    // Certifications
    cat.cert(tac),
    cat.cert(tic),
    cat.cert(toc),
    tac.cert(cat),
    tac.cert(tic),
    tic.cert(cat),
    tic.cert(tac),
    toc.cert(cat),
    cat.join(),
    tac.join(),
    tic.join(),
    toc.join(),
    node1.commit(),
    node1.commit(),
    toc.leave(),
    node1.commit(),
    tac.cert(toc),
    tic.cert(toc),
    toc.cert(tic), // Should be taken in 1 block
    toc.cert(tac), // Should be taken in 1 other block
    node1.commit(),
    node1.commit()
  ];
};
