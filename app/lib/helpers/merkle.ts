export const processForURL = async (req:any, merkle:any, valueCoroutine:any) => {
  // Result
  const json:any = {
    "depth": merkle.depth,
    "nodesCount": merkle.nodes,
    "leavesCount": merkle.levels[merkle.depth].length,
    "root": merkle.levels[0][0] || "",
    "leaves": []
  };
  if (req.query.leaves) {
    // Leaves
    json.leaves = merkle.leaves();
    return json;
  } else if (req.query.leaf) {
    // Extract of a leaf
    json.leaves = []
    const hashes = [req.query.leaf];
    // This code is in a loop for historic reasons. Should be set to non-loop style.
    const values = await valueCoroutine(hashes);
    hashes.forEach((hash) => {
      json.leaf = {
        "hash": hash,
        "value": values[hash] || ""
      };
    });
    return json;
  } else {
    return json;
  }
}
