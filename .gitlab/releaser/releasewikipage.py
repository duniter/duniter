import json
import os
import urllib.request

from placeholder import PlaceHolder
from projectapi import ProjectApi

class ReleaseWikiPage(ProjectApi):
    '''
    Release Wiki page API.
    '''
    __PH_TAG = PlaceHolder('tag')
    __PH_NOTE = PlaceHolder('note')
    __PH_PREVIOUS = PlaceHolder('previous-beg')

    def __init__(self, template):
        '''
        :param template: The template to use.
        :type template: Template
        '''
        if not 'WIKI_RELEASE' in os.environ:
            print('CRITICAL WIKI_RELEASE variable is not defined')
            exit(1)
        ProjectApi.__init__(self, '/wikis/{}'.format(os.environ['WIKI_RELEASE']))
        self.template = template

        # Query existing page
        request = self.build_request()
        response = urllib.request.urlopen(request)
        response_data = response.read().decode()
        data = json.loads(response_data)
        self.page_content = data['content']

    def add_release(self, tag, note):
        '''
        Add the release to the Wiki page.
        '''
        prev_tag = ReleaseWikiPage.__PH_TAG.get_content(self.page_content)
        prev_note = ReleaseWikiPage.__PH_NOTE.get_content(self.page_content)
        self.page_content = ReleaseWikiPage.__PH_TAG.replace_content(self.page_content, tag)
        self.page_content = ReleaseWikiPage.__PH_NOTE.replace_content(self.page_content, note)
        previous = self.template.render('previouswiki', {
            'tag': prev_tag,
            'body': prev_note
        })
        self.page_content = ReleaseWikiPage.__PH_PREVIOUS.insert_after(
            self.page_content, previous)

    def save(self):
        send_data = {
            'content': self.page_content,
            'format': 'markdown',
            'slug': os.environ['WIKI_RELEASE'],
            'title': os.environ['WIKI_RELEASE']
        }
        send_data_serialized = json.dumps(send_data).encode('utf-8')
        request = self.build_request(data=send_data_serialized, method='PUT')
        request.add_header('Content-Type', 'application/json')
        urllib.request.urlopen(request)
