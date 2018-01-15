#!/usr/bin/env python3

import urllib.request

url = "https://g1-test.duniter.org/network/peers"

request = urllib.request.Request(url)
response = urllib.request.urlopen(request)

print('status: %s' % response.status)
print('headers:', response.headers)
print('body:' + response.read().decode('utf-8'))