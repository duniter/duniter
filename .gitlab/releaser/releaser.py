import glob
import jinja2
import json
import os

from binartifact import BinArtifact
from job import Job
from pipeline import Pipeline
from placeholder import PlaceHolder
from releasenote import ReleaseNote
from releasewikipage import ReleaseWikiPage
from sourceartifact import SourceArtifact
from template import Template

class Releaser:
    '''
    The main releaser class
    '''

    def __init__(self):
        self.template = Template('release_template.md')
        if 'RELEASE_BIN_DIR' in os.environ:
            self.release_bin_dir = os.environ['RELEASE_BIN_DIR']
            if not self.release_bin_dir.endswith('/'): self.release_bin_dir += '/'
        else:
            print('CRITICAL RELEASE_BIN_DIR environment variable not set')
            exit(1)
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

    def release(self):
        if self.source_ext is None:
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

        # Get releases
        artifacts_list += self._get_bin_artifacts()
        artifacts_list.sort()
        artifacts_list += list(map(lambda e: SourceArtifact(e), self.source_ext))

        # Send result
        note = self.template.render('notebody', {
            'current_message': current_message,
            'artifacts': list(map(lambda a: a.to_dict(), artifacts_list))
        })
        title_line = self.template.render('prerelease', {
            'tag': os.environ['CI_COMMIT_TAG'],
            'pipeline': os.environ['CI_PIPELINE_ID']
        })
        releaseNote.send_note(title_line + note)

        print('Pre-release published')

    def publish_release(self):
        '''
        Main job to publish the final release.
        '''
        # Change release note
        releaseNote = ReleaseNote()
        note = releaseNote.get_note_body()
        title_line = self.template.render('release', {
            'tag': os.environ['CI_COMMIT_TAG'],
            'pipeline': os.environ['CI_PIPELINE_ID']
        })
        releaseNote.send_note(title_line + note)

        # Update Wiki release page
        wiki_page = ReleaseWikiPage(self.template)
        wiki_page.add_release(os.environ['CI_COMMIT_TAG'], PlaceHolder.clear_all(note))
        wiki_page.save()

        # Keep artifacts
        jobs = []
        for artifact in self._get_bin_artifacts():
            if not artifact.job in jobs:
                jobs.append(artifact.job)
        jobs = map(lambda j: Pipeline().find_job_id(j), jobs)
        for job_id in jobs: Job(job_id).keep_artifacts()

        print('Release published')

    def _get_bin_artifacts(self):
        '''
        Get the binary artifacts for the current tag.
        :return: The list of binary artifacts, based on found descriptions.
        :rtype: list of BinArtifact
        '''
        DESC_EXT = '.desc'
        artifacts = glob.glob('{}*{}'.format(self.release_bin_dir, DESC_EXT))
        artifacts = map(lambda d: BinArtifact(self.release_bin_dir, d, DESC_EXT), artifacts)
        artifacts = filter(lambda a: a.tag == os.environ['CI_COMMIT_TAG'], artifacts)
        return list(artifacts)
