
module.exports = {

  merkleDone: function (req, res, json) {
    if(req.query.nice){
      res.setHeader("Content-Type", "text/plain");
      res.end(JSON.stringify(json, null, "  "));
    }
    else res.end(JSON.stringify(json));
  },

  processForURL: function (req, merkle, valueCB, done) {
    // Level
    var lstart = req.query.lstart ? parseInt(req.query.lstart) : 0;
    var lend   = req.query.lend ? parseInt(req.query.lend) : lstart + 1;
    if(req.query.extract){
      lstart = merkle.depth;
      lend = lstart + 1;
    }
    // Start
    var start = req.query.start ? parseInt(req.query.start) : 0;
    // End
    var end = req.query.end ? parseInt(req.query.end) : merkle.levels[merkle.depth.length];
    // Result
    var json = {
      "depth": merkle.depth,
      "nodesCount": merkle.nodes,
      "levelsCount": merkle.levels.length,
      "leavesCount": merkle.levels[merkle.depth].length
    };
    if(isNaN(lstart)) lstart = 0;
    if(isNaN(lend)) lend = lstart + 1;
    if(isNaN(start)) start = 0;
    if(!req.query.extract || !valueCB){
      json.levels = {};
      for (var i = Math.max(lstart, 0); i < merkle.levels.length && i < lend; i++) {
        var rowEnd = isNaN(end) ? merkle.levels[i].length : end;
        json.levels[i] = merkle.levels[i].slice(Math.max(start, 0), Math.min(rowEnd, merkle.levels[i].length));
      };
      done(null, json);
    }
    else {
      json.leaves = {};
      var rowEnd = isNaN(end) ? merkle.levels[merkle.depth].length : end;
      var hashes = merkle.levels[merkle.depth].slice(Math.max(start, 0), Math.min(rowEnd, merkle.levels[lstart].length));
      valueCB(hashes, function (err, values) {
        hashes.forEach(function (hash, index){
          json.leaves[Math.max(start, 0) + index] = {
            "hash": hash,
            "value": values[hash] || ""
          };
        });
        done(null, json);
      });
    }
  }
}