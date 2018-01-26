import json
import os

from artifact import Artifact
from fsitemsize import FSItemSize

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
