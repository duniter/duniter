#!/usr/bin/env python3

import math
import urllib.request
import urllib.error
import json
import os
import jinja2

def get_current_message():
    '''Get current release message'''
    url = "https://git.duniter.org/api/v4/projects/47/repository/tags/0.99.18"
    request = urllib.request.Request(url)
    response = urllib.request.urlopen(request)
    print('status: %s' % response.status)
    print('headers:', response.headers)
    response_data = response.read().decode()
    data = json.load(response_data)
    if data['release'] is None:
        return False, ''
    else:
        return True, data['release']['description'].split('# Downloads')[0]

def main():
    '''Execute main scenario'''
    exists_release, current_message = get_current_message()
    print('end')
main()
