import json
import os
import urllib.request

from placeholder import PlaceHolder
from projectapi import ProjectApi

class ReleaseNote(ProjectApi):
    '''
    Release note API.
    '''
    __PH_TITLE = PlaceHolder('end-title')
    __PH_NOTE = PlaceHolder('note')

    def __init__(self):
        ProjectApi.__init__(self, '/repository/tags/{}'.format(os.environ['CI_COMMIT_TAG']))
        self.message_read = False

    def get_note(self):
        '''
        Get full release note.
        :return: The note if it exists, None otherwise.
        :rtype: str or None
        '''
        request = self.build_request()
        response = urllib.request.urlopen(request)
        response_data = response.read().decode()
        data = json.loads(response_data)
        if data['release'] is None:
            return None
        else:
            self.message_read = True
            return data['release']['description']

    def get_message(self):
        '''
        Get release message. Message is extracted from full note.
        :return: The message if it exists, empty string otherwise.
        :rtype: str
        '''
        data = self.get_note()
        if data is None:
            return ''
        else:
            return ReleaseNote.__PH_NOTE.get_content(data)

    def get_note_body(self):
        '''
        Get release note body (without title). Body is extracted from full note.
        :return: The body.
        :rtype: str
        '''
        data = self.get_note()
        if data is None:
            print('CRITICAL No release information to publish')
            exit(1)
        return ReleaseNote.__PH_TITLE.get_after(data, True)

    def send_note(self, note):
        '''
        Send the full release note. The current message should have been read
        unless you are sure there are none.
        :param note: The full note to send.
        :type note: str
        '''
        method = 'PUT' if self.message_read else 'POST'
        send_data = {
            'tag_name': os.environ['CI_COMMIT_TAG'],
            'description': note
        }
        send_data_serialized = json.dumps(send_data).encode('utf-8')
        request = self.build_request('/release', data=send_data_serialized, method=method)
        request.add_header('Content-Type', 'application/json')
        urllib.request.urlopen(request)
