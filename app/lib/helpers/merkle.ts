// Source file from duniter: Crypto-currency software to manage libre currency such as Ğ1
// Copyright (C) 2018  Cedric Moreau <cem.moreau@gmail.com>
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.

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
