import os

from artifact import Artifact
from fsitemsize import FSItemSize

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
