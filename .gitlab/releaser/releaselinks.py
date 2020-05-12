import json
import os
import urllib.request

from projectapi import ProjectApi

class ReleaseLinks(ProjectApi):
    '''
    Release links API.
    '''
    def __init__(self):
        ProjectApi.__init__(self, '/releases/{}/assets/links'.format(os.environ['CI_COMMIT_TAG']))

    def create_artifact(self, artifact):
        '''
        Create the link for the given artifact.
        :param artifact: The artifact data.
        :type artifact: dict
        '''
        send_data = {
            'name': '{} {} - {}'.format(artifact['category'], artifact['arch'], artifact['type']),
            'filepath': '/binaries/{}'.format(artifact['name']),
            'url': artifact['url']
        }
        send_data_serialized = json.dumps(send_data).encode('utf-8')
        request = self.build_request(data=send_data_serialized, method='POST')
        request.add_header('Content-Type', 'application/json')
        urllib.request.urlopen(request)
