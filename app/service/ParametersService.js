module.exports = {

  getVote: function (req, callback){
    if(!(req.body && req.body.amendment && req.body.signature)){
      callback('Requires an amendment + signature');
      return;
    }
    callback(null, req.body.amendment + req.body.signature);
  },

  getAmendmentID: function (req, callback) {
    if(!req.params || !req.params.amendment_id){
      callback("Amendment ID is required");
      return;
    }
    var matches = req.params.amendment_id.match(/^(\d+)-(\w{40})$/);
    if(!matches){
      callback("Amendment ID format is incorrect, must be 'number-hash'");
      return;
    }
    callback(null, matches[1], matches[2]);
  },

  getAmendmentNumber: function (req, callback) {
    if(!req.params || !req.params.amendment_number){
      callback("Amendment number is required");
      return;
    }
    var matches = req.params.amendment_number.match(/^(\d+)$/);
    if(!matches){
      callback("Amendment number format is incorrect, must be an integer value");
      return;
    }
    callback(null, matches[1]);
  },

  getMembership: function (req, callback) {
    // Parameters
    if(!(req.body && req.body.request && req.body.signature)){
      callback('Requires a membership request + signature');
      return;
    }
    callback(null, req.body.request + req.body.signature);
  },

  getPubkey: function (req, callback) {
    if(!req.body){
      callback('Parameters `keytext` and `keysign` are required');
      return;
    }
    if(!req.body.keytext){
      callback('Key is required');
      return;
    }
    if(!req.body.keysign){
      callback('Key signature is required');
      return;
    }
    if(!req.body.keytext.match(/BEGIN PGP PUBLIC KEY/) || !req.body.keytext.match(/END PGP PUBLIC KEY/)){
      callback('Keytext does not look like a public key message');
      return;
    }
    if(!req.body.keysign.match(/BEGIN PGP/) || !req.body.keysign.match(/END PGP/)){
      callback('Keysign does not look like a PGP message');
      return;
    }
    callback(null, req.body.keytext, req.body.keysign);
  }
}