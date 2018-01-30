import os
import urllib.request

class ProjectApi:
    '''
    Gitlab API project access.
    '''
    __PROJECT_URL = 'https://git.duniter.org/api/v4/projects/{}'

    def __init__(self, url=''):
        '''
        :param url: The URL portion to add to base project URL (if needed).
        :type url: str
        '''
        self.base_url = ProjectApi.__PROJECT_URL.format(os.environ['CI_PROJECT_ID'])
        self.base_url += url
        self.token = ('Private-Token', os.environ['RELEASER_TOKEN'])

    def build_request(self, url='', **params):
        '''
        Create the request to send to project API.
        :param url: The portion of URL to add to base URL (if needed).
        :param params: The optional parameters.
        :type url: str
        :type params: dict
        :return: The request, ready to be used.
        :rtype: urllib.request.Request
        '''
        request = urllib.request.Request(self.base_url + url, **params)
        request.add_header(*self.token)
        return request
