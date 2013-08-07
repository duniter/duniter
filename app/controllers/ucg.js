
module.exports.pubkey = function (pgp, req, res) {
  res.writeHead(200);
  res.end(pgp.keyring.privateKeys[0].obj.extractPublicKey());
};
