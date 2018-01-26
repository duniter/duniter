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
