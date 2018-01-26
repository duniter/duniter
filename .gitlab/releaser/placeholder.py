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
