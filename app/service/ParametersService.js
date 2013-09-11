module.exports = {

  getVote: function (req, callback){
    if(!(req.body && req.body.amendment && req.body.signature)){
      callback('Requires an amendment + signature');
      return;
    }
    callback(null, req.body.amendment + req.body.signature);
  },

  getAmendmentID: function (req, callback) {
    if(!req.params.amendment_id){
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
    if(!req.params.amendment_number){
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
  }
}