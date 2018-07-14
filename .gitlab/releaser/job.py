import urllib.request

from projectapi import ProjectApi

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
