#!/usr/bin/python3
'''
This module is meant add release notes in gitlab for the current project.
Expects to find in environment following variables:
  - CI_PROJECT_URL - Automatically set by gitlab-ci
  - CI_PROJECT_ID - Automatically set by gitlab-ci
  - CI_COMMIT_TAG - Automatically set by gitlab-ci
  - CI_PIPELINE_ID - Automatically set by gitlab-ci
  - RELEASE_BIN_DIR - Directory where releases are to be found
  - SOURCE_EXT - Source extensions
  - RELEASE_JOB - Name of the release job
  - WIKI_RELEASE - Wiki page where releases are stored
  - RELEASER_TOKEN - Token used by technical user
'''

import glob
import jinja2
import json
import math
import os
import urllib.request
import urllib.error

class FSItemSize:
    '''
    The size of a file system item.
    '''

    def __init__(self, bsize = None):
        '''
        :param bsize: Size of item in bytes.
        :type bsize: int
        '''
        self.bsize = bsize

    def __str__(self):
        '''
        :return: Human readable size.
        :rtype: str
        '''
        if self.bsize is None:
            return '(unknown)'
        elif self.bsize == 0:
            return '0 B'
        size_name = ('B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB')
        i = int(math.floor(math.log(self.bsize, 1024)))
        power = math.pow(1024, i)
        size = round(self.bsize / power, 2)
        return '{} {}'.format(size, size_name[i])

class Artifact:
    '''
    An artifact to be uploaded.
    '''

    def __init__(self, file_name, category, arch, dtype, icon):
        '''
        :param file_name: The name of the artifact file (may have directory).
        :param category: The category (OS, distrib) for the artifact.
        :param arch: The architecture name.
        :param dtype: The delivery type (either server or desktop).
        :param icon: The name of the icon to be used for artifact representation.
        :type file_name: str
        :type category: str
        :type arch: str
        :type dtype: str
        :type icon: str
        '''
        self.file_name = file_name
        self.category = category
        self.arch = arch
        self.dtype = dtype
        self.icon = icon

    def __lt__(self, other):
        if not isinstance(other, Artifact): raise TypeError()
        return self.category < other.category or \
            (self.category == other.category and self.arch < other.arch) or \
            (self.category == other.category and self.arch == other.arch and self.dtype < other.dtype)

    def __le__(self, other):
        if not isinstance(other, Artifact): raise TypeError()
        return self.category <= other.category or \
            (self.category == other.category and self.arch <= other.arch) or \
            (self.category == other.category and self.arch == other.arch and self.dtype <= other.dtype)

    def __eq__(self, other):
        if not isinstance(other, Artifact): raise TypeError()
        return self.category == other.category and self.arch == other.arch and self.dtype == other.dtype

    def __ne__(self, other):
        if not isinstance(other, Artifact): raise TypeError()
        return self.category != other.category or self.arch != other.arch or self.dtype != other.dtype

    def __gt__(self, other):
        if not isinstance(other, Artifact): raise TypeError()
        return self.category > other.category or \
            (self.category == other.category and self.arch > other.arch) or \
            (self.category == other.category and self.arch == other.arch and self.dtype > other.dtype)

    def __ge__(self, other):
        if not isinstance(other, Artifact): raise TypeError()
        return self.category >= other.category or \
            (self.category == other.category and self.arch >= other.arch) or \
            (self.category == other.category and self.arch == other.arch and self.dtype >= other.dtype)

    def to_dict(self):
        '''
        :return: A dictionnary containing artifact data.
        :rtype: dict
        '''
        return {
            'name': self.file_name.split('/')[-1],
            'category': self.category,
            'arch': self.arch,
            'type': self.dtype,
            'url': self._build_url(),
            'size': self._get_size(),
            'icon': ':{}:'.format(self.icon)
        }

    def _get_size(self):
        '''
        :return: The size of the artifact.
        :rtype: FSItemSize
        '''
        raise NotImplementedError()

    def _build_url(self):
        '''
        :return: The URL which can be used to get this artifact.
        :rtype: str
        '''
        raise NotImplementedError()

class BinArtifact(Artifact):
    '''
    A binary artifact.
    '''

    def __init__(self, folder, desc_file, desc_ext):
        '''
        :param folder: The folder where files can be found.
        :param desc_file: The name of the description file.
        :param desc_ext: The extention of the description file.
        :type folder: str
        :type desc_file: str
        :type desc_ext: str
        '''
        try:
            description = json.load(open(desc_file))
        except json.decoder.JSONDecodeError:
            print('CRITICAL Description file {} could not be read'.format(desc_file))
            exit(1)

        self.tag = description['version']
        self.job = description['job']
        file_name = desc_file[:-len(desc_ext)]
        Artifact.__init__(self, file_name, description['category'], description['arch'], description['type'], 'package')

    def _get_size(self):
        return FSItemSize(int(os.path.getsize(self.file_name)))

    def _build_url(self):
        return '{}/-/jobs/artifacts/{}/raw/{}?job={}'.format(
            os.environ['CI_PROJECT_URL'], self.tag, self.file_name, self.job)

class SourceArtifact(Artifact):
    '''
    A source artifact.
    '''

    def __init__(self, extention):
        '''
        :param extention: The extention of the source archive.
        :type extention: str
        '''
        Artifact.__init__(self, 'archive.{}'.format(extention), 'Source code ({})'.format(extention), '', '', 'compression')

    def _get_size(self):
        return FSItemSize()

    def _build_url(self):
        return '{}/repository/{}/{}'.format(
            os.environ['CI_PROJECT_URL'], os.environ['CI_COMMIT_TAG'], self.file_name)

class PlaceHolder:
    '''
    Placeholder tags in Markdown texts.
    '''
    __PLACEHOLDER_PART = '<placeholder'
    __PLACEHOLDER_START = '<placeholder content="{}">'
    __PLACEHOLDER_STOP = '</placeholder>'
    __PLACEHOLDER_FULL = '<placeholder content="{}" />'

    def __init__(self, content_id):
        '''
        :param content_id: The identifier to be used for placeholder content.
        :type content_id: str
        '''
        self.ph_start = PlaceHolder.__PLACEHOLDER_START.format(content_id)
        self.ph_stop = PlaceHolder.__PLACEHOLDER_STOP
        self.ph_full = PlaceHolder.__PLACEHOLDER_FULL.format(content_id)

    def get_content(self, text):
        '''
        :param text: The text in which to extract content.
        :type text: str
        :return: The content between placeholder markers.
        :rtype: str
        '''
        pos = text.find(self.ph_start)
        if pos >= 0:
            text = text[pos + len(self.ph_start):]
            pos = text.find(self.ph_stop)
            if pos >= 0: text = text[:pos]
        return text

    def get_before(self, text, keep_mark=False):
        '''
        :param text: The text in which to extract content.
        :param keep_mark: If true, the mark is kept in final text.
        :type text: str
        :type keep_mark: bool
        :return: The content before (full) placeholder marker.
        :rtype: str
        '''
        pos = text.find(self.ph_full)
        if pos >= 0:
            if keep_mark: pos += len(self.ph_full)
            text = text[:pos]
        return text

    def get_after(self, text, keep_mark=False):
        '''
        :param text: The text in which to extract content.
        :param keep_mark: If true, the mark is kept in final text.
        :type text: str
        :type keep_mark: bool
        :return: The content after (full) placeholder marker.
        :rtype: str
        '''
        pos = text.find(self.ph_full)
        if pos >= 0:
            if not keep_mark: pos += len(self.ph_full)
            text = text[pos:]
        return text

    def replace_content(self, text, content):
        '''
        :param text: The text in which to extract content.
        :param content: The new content to insert.
        :type text: str
        :type content: str
        :return: The text where content has been replaced.
        :rtype: str
        '''
        pos = text.find(self.ph_start)
        if pos >= 0:
            pos += len(self.ph_start)
            text_before = text[:pos]
        else:
            pos = 0
            text_before = ''
        pos = text.find(self.ph_stop, pos)
        if pos >= 0:
            text_after = text[pos:]
        else:
            text_after = ''
        return text_before + content + text_after

    def insert_after(self, text, content):
        '''
        :param text: The text in which to extract content.
        :param content: The new content to insert.
        :type text: str
        :type content: str
        :return: The text where content has been inserted.
        :rtype: str
        '''
        pos = text.find(self.ph_full)
        if pos >= 0: pos += len(self.ph_full)
        else: pos = 0
        text_before = text[:pos]
        text_after = text[pos:]
        return text_before + content + text_after

    def clear_all(text):
        '''
        Clear all placeholders from given text.
        :param text: The text to clear.
        :type text: str
        :return: The clean text.
        :rtype: str
        '''
        while True:
            pos = text.find(PlaceHolder.__PLACEHOLDER_PART)
            if pos < 0: break
            end = text.find('>')
            if end < 0: end = len(text)
            text = text[:pos] + text[end + 1:]
        while True:
            pos = text.find(PlaceHolder.__PLACEHOLDER_STOP)
            if pos < 0: break
            text = text[:pos] + text[pos + len(PlaceHolder.__PLACEHOLDER_STOP):]
        return text

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

class Pipeline(ProjectApi):
    '''
    Pipeline data API.
    '''

    def __init__(self):
        ProjectApi.__init__(self, '/pipelines/{}'.format(os.environ['CI_PIPELINE_ID']))

    def find_job_id(self, job_name):
        '''
        Find the id corresponding to given job name in the pipeline.
        :param job_name: The job name.
        :type job_name: str
        :return: The identifier.
        :rtype: int
        '''
        request = self.build_request('/jobs')
        response = urllib.request.urlopen(request)
        response_data = response.read().decode()
        for job in json.loads(response_data):
            if job['name'] == job_name: return job['id']
        print('CRITICAL No job with given name {} found'.format(job_name))
        exit(1)

class Job(ProjectApi):
    '''
    Job data API.
    '''

    def __init__(self, job_id):
        '''
        :param job_id: The job id.
        :type job_id: int
        '''
        ProjectApi.__init__(self, '/jobs/{}'.format(job_id))

    def keep_artifacts(self):
        '''
        Force artifacts to be kept forever.
        '''
        request = self.build_request('/artifacts/keep', method='POST')
        urllib.request.urlopen(request)

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

class ReleaseWikiPage(ProjectApi):
    '''
    Release Wiki page API.
    '''
    __PH_TAG = PlaceHolder('tag')
    __PH_NOTE = PlaceHolder('note')
    __PH_PREVIOUS = PlaceHolder('previous-beg')
    __PREVIOUS_NOTE = '\n\n## {}\n\n{}'

    def __init__(self):
        if not 'WIKI_RELEASE' in os.environ:
            print('CRITICAL WIKI_RELEASE variable is not defined')
            exit(1)
        ProjectApi.__init__(self, '/wikis/{}'.format(os.environ['WIKI_RELEASE']))

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
        self.page_content = ReleaseWikiPage.__PH_PREVIOUS.insert_after(
            self.page_content,
            ReleaseWikiPage.__PREVIOUS_NOTE.format(prev_tag, prev_note))

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

class Releaser:
    '''
    The main releaser class
    '''
    __PRERELEASE = '# :gift: Pre-release\n\n[Go to Pipeline page :arrow_forward:](https://git.duniter.org/sveyret/duniter/pipelines/{})\n\n'
    __RELEASE = '# :white_check_mark: Release\n\n'
    __DESC_EXT = '.desc'

    def __init__(self):
        if 'RELEASE_BIN_DIR' in os.environ:
            self.release_bin_dir = os.environ['RELEASE_BIN_DIR']
            if not self.release_bin_dir.endswith('/'): self.release_bin_dir += '/'
        else: self.release_bin_dir = None
        if 'SOURCE_EXT' in os.environ:
            self.source_ext = os.environ['SOURCE_EXT']
            try:
                self.source_ext = json.loads(self.source_ext)
            except json.decoder.JSONDecodeError:
                print('CRITICAL SOURCE_EXT environment variable JSON probably malformed')
                print('CRITICAL Correct : \'["zip","tar.gz"]\' ')
                print('CRITICAL Not Correct: "[\'zip\',\'tar.gz\']" ')
                exit(1)
        else: self.source_ext = None
        if 'RELEASE_JOB' in os.environ:
            self.release_job = os.environ['RELEASE_JOB']
        else: self.release_job = None

    def release(self):
        if self.release_bin_dir is None or self.source_ext is None or self.release_job is None:
            self.publish_release()
        else:
            self.publish_prerelease()

    def publish_prerelease(self):
        '''
        Main job to publish a pre-release.
        '''
        releaseNote = ReleaseNote()
        current_message = releaseNote.get_message()
        artifacts_list = []

        # Binary releases
        artifacts_list += list(filter(lambda a: a.tag == os.environ['CI_COMMIT_TAG'],
            map(lambda d: BinArtifact(self.release_bin_dir, d, Releaser.__DESC_EXT),
            glob.glob('{}*{}'.format(self.release_bin_dir, Releaser.__DESC_EXT)))))
        artifacts_list.sort()

        # Sources
        artifacts_list += list(map(lambda e: SourceArtifact(e), self.source_ext))

        # Load template
        j2_env = jinja2.Environment(
            loader=jinja2.FileSystemLoader(
                os.path.dirname(os.path.abspath(__file__))
                ),
            trim_blocks=True
            )
        # pylint: disable=maybe-no-member
        template = j2_env.get_template('release_template.md')

        # Send result
        note = template.render(
            current_message = current_message,
            artifacts = list(map(lambda a: a.to_dict(), artifacts_list))
        )
        title_line = Releaser.__PRERELEASE.format(os.environ['CI_PIPELINE_ID'])
        releaseNote.send_note(title_line + note)

        print('Pre-release published')

    def publish_release(self):
        '''
        Main job to publish the final release.
        '''
        # Change release note
        releaseNote = ReleaseNote()
        note = releaseNote.get_note_body()
        title_line = Releaser.__RELEASE
        releaseNote.send_note(title_line + note)

        # Update Wiki release page
        wiki_page = ReleaseWikiPage()
        wiki_page.add_release(os.environ['CI_COMMIT_TAG'], PlaceHolder.clear_all(note))
        wiki_page.save()

        # Keep artifacts
        artifacts_list = list(filter(lambda a: a.tag == os.environ['CI_COMMIT_TAG'],
            map(lambda d: BinArtifact(self.release_bin_dir, d, Releaser.__DESC_EXT),
            glob.glob('{}*{}'.format(self.release_bin_dir, Releaser.__DESC_EXT)))))
        jobs = []
        for artifact in artifacts_list:
            if not artifact.job in jobs:
                jobs.append(artifact.job)
        jobs = map(lambda j: Pipeline.find_job_id(j), jobs)
        for job_id in jobs: Job(job_id).keep_artifacts()

        print('Release published')

Releaser().release()
