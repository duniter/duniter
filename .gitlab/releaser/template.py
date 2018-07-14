import jinja2
import os

class Template:
    '''
    Manages the template file. The template file is split into blocks.
    '''
    def __init__(self, fname):
        '''
        :param fname: The name of the template file.
        :type fname: str
        '''
        path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        environment = jinja2.Environment(
            loader=jinja2.FileSystemLoader(path),
            trim_blocks=True
        )
        self.template = environment.get_template(fname)

    def render(self, block, params):
        '''
        Render a block from the template file.
        :param block: The name of the block to render.
        :param params: The parameters to be used in the block.
        :type block: str
        :type params: dict
        :return: The rendered block.
        :rtype: str
        '''
        context = self.template.new_context(params)
        return jinja2.utils.concat(self.template.blocks[block](context))
