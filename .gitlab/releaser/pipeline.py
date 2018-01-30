import json
import os
import urllib.request

from projectapi import ProjectApi

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
