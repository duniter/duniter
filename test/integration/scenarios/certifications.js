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
