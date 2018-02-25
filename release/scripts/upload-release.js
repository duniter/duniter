"use strict";

const co = require('co');
const fs = require('fs');
const path = require('path');
const rp = require('request-promise');

const GITHUB_TOKEN = process.argv[2]
const tagName      = process.argv[3]
const filePath     = process.argv[4]
const fileType     = getFileType(filePath)

co(function*() {
  try {
    // Get release URL
    const release = yield github('/repos/duniter/duniter/releases/tags/' + tagName); // May be a draft
    console.log('Release: ' + release.tag_name);
    const filename = path.basename(filePath)
    console.log('Uploading asset %s...', filename);
    const upload_url = release.upload_url.replace('{?name,label}', '?' + ['name=' + filename].join('&'));
    yield githubUpload(upload_url, filePath, fileType)
  } catch (e) {
    console.error(e);
  }
  process.exit(0);
});

function github(url) {
  return co(function*() {
    yield new Promise((resolve) => setTimeout(resolve, 1));
    return yield rp({
      uri: 'https://api.github.com' + url,
      json: true,
      headers: {
        'User-Agent': 'Request-Promise',
        'Authorization': 'token ' + GITHUB_TOKEN,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
  });
}

function githubUpload(upload_url, filePath, type) {
  return co(function*() {
    const stats = fs.statSync(filePath);
    return yield rp({
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
