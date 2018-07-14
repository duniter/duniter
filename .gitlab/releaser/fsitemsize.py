import math

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
