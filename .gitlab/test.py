#!/usr/bin/env python3

import urllib.request

def get_current_message():
    '''Get current release message'''
    url = "https://git.duniter.org/api/v4/projects/47/repository/tags/0.99.18"
    request = urllib.request.Request(url)
    response = urllib.request.urlopen(request)
    print('status: %s' % response.status)
    print('headers:', response.headers)
    print('body:' + response.read().decode('utf-8'))
    data = json.load(response.decode())
    if data['release'] is None:
        return False, ''
    else:
        return True, data['release']['description'].split('# Downloads')[0]
