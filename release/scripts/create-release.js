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

"use strict";

const rp = require('request-promise');

const GITHUB_TOKEN = process.argv[2]
const tagName      = process.argv[3]
const command      = process.argv[4]
const value        = process.argv[5]

(async () => {
  try {
    // Get release URL
    let release
    try {
      release = await github('/repos/duniter/duniter/releases/tags/' + tagName)
    } catch (e) {
      if (!(e && e.statusCode == 404)) {
        throw e
      }
    }

    // Creation
    if (command === "create") {
      if (!release) {
        release = await github('/repos/duniter/duniter/releases', 'POST', {
          tag_name: tagName,
          draft: false,
          prerelease: true
        })
      } else {
        console.error('Release ' + tagName + ' already exists. Skips creation.')
      }
      // As a result of the command, log the already uploaded assets' names
      for (const asset of release.assets) {
        console.log(asset.name)
      }
    }

    // Update to release
    else if (command === "set") {
      const isPreRelease = value != 'rel'
      const status = isPreRelease ? 'pre-release' : 'release'
      if (!release) {
        console.error('Release ' + tagName + ' does not exist.')
      } else {
        release = await github('/repos/duniter/duniter/releases/' + release.id, 'PATCH', {
          tag_name: tagName,
          draft: false,
          prerelease: isPreRelease
        })
      }
      console.log('Release set to status \'%s\'', status)
    }

    else {
      console.error("Unknown command '%s'", command)
      process.exit(1)
    }

  } catch (e) {
    console.error(e);
  }
  process.exit(0);
})()

// FIXME: still used ? still depend of github and not gitlab ?
// FIXME: code duplicate with upload-release.js
async function github(url, method = 'GET', body = undefined) {
  await new Promise((resolve) => setTimeout(resolve, 1));
  return await rp({
    uri: 'https://api.github.com' + url,
    method,
    body,
    json: true,
    headers: {
      'User-Agent': 'Request-Promise',
      'Authorization': 'token ' + GITHUB_TOKEN,
      'Accept': 'application/vnd.github.v3+json'
    }
  });
}
