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

const fs = require('fs');
const path = require('path');
const rp = require('request-promise');

const GITHUB_TOKEN = process.argv[2]
const tagName      = process.argv[3]
const filePath     = process.argv[4]
const fileType     = getFileType(filePath)

(async () => {
  try {
    // Get release URL
    const release = await github('/repos/duniter/duniter/releases/tags/' + tagName); // May be a draft
    console.log('Release: ' + release.tag_name);
    const filename = path.basename(filePath)
    console.log('Uploading asset %s...', filename);
    const upload_url = release.upload_url.replace('{?name,label}', '?' + ['name=' + filename].join('&'));
    await githubUpload(upload_url, filePath, fileType)
  } catch (e) {
    console.error(e);
  }
  process.exit(0);
})()

async function github(url) {
  await new Promise((resolve) => setTimeout(resolve, 1));
  return await rp({
    uri: 'https://api.github.com' + url,
    json: true,
    headers: {
      'User-Agent': 'Request-Promise',
      'Authorization': 'token ' + GITHUB_TOKEN,
      'Accept': 'application/vnd.github.v3+json'
    }
  });
}

async function githubUpload(upload_url, filePath, type) {
  const stats = fs.statSync(filePath);
  return await rp({
    method: 'POST',
    body: fs.createReadStream(filePath),
    uri: upload_url,
    headers: {
      'User-Agent': 'Request-Promise',
      'Authorization': 'token ' + GITHUB_TOKEN,
      'Content-type': type,
      'Accept': 'application/json',
      'Content-Length': stats.size
    }
  });
}

function getFileType(filePath) {
  let fileType = 'application/vnd.debian.binary-package' // Default: .deb package
  if (path.extname(filePath) === '.gz') {
    fileType = 'application/gzip'
  }
  if (path.extname(filePath) === '.exe') {
    fileType = 'application/vnd.microsoft.portable-executable'
  }
  return fileType
}
