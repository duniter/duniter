'''
This module is meant add release notes in gitlab for the current project.
Expects to find in environment following variables:
  - CI_PROJECT_URL - Automatically set by gitlab-ci
  - CI_PROJECT_ID - Automatically set by gitlab-ci
  - CI_COMMIT_TAG - Automatically set by gitlab-ci
  - CI_PIPELINE_ID - Automatically set by gitlab-ci
  - RELEASE_BIN_DIR - Directory where releases are to be found
  - SOURCE_EXT - Source extensions (pre-release only)
  - WIKI_RELEASE - Wiki page where releases are stored (release only)
  - RELEASER_TOKEN - Token used by technical user
'''
