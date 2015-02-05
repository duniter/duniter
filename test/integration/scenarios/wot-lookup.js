var user   = require('./../tools/user');

module.exports = function(node1) {

  var cat = user('cat', 'abc', 'abc', node1);
  var tac = user('tac', 'abc', 'def', node1);
  var tic = user('tic', 'abc', 'ghi', node1);
  var toc = user('toc', 'abc', 'jkl', node1);

  var now = Math.round(new Date().getTime()/1000);

  return [
    // Self certifications
    cat.selfCert(now),
    tac.selfCert(now),
    tic.selfCert(now),
    tic.selfCert(now + 2),
    tic.selfCert(now + 2),
    tic.selfCert(now + 2),
    tic.selfCert(now + 3),
    toc.selfCert(now),
    // Certifications
    cat.cert(tac)
  ];
};
