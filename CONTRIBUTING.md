# Contributing

Before contributing, please make sure that your development environment is properly configured by following this tutorial :

[Setting up your development environment]

Sign-ups on our gitlab are disabled. If you would like to contribute, please ask for its creation on [the technical forum].

When contributing to this repository, please first discuss the change you wish to make via issue and
via [the technical forum] before making a change.

Please note we have a specific workflow, please follow it in all your interactions with the project.

## Workflow

- You must create an issue for each feature you wish to develop, with a precise title and a
  description of your feature. Then, assign it to yourself and click on the button
  **`Create a merge request`**. GitLab will create a branch dedicated to the issue as well as a
  *Work in Progress* merge request of this branch into the main branch (`dev`).
- Please use tags to specify feature domains and concerned modules.
- Never contribute to a branch whose issue has not been assigned to you! If the contributor make a
  `git rebase` your commit will be lost !
- Before you push your commit:
  - Document your code.
  - Write unit tests, and verify that they **all** pass.
  - Apply the [project's git conventions]

## Merge Process

1. Ensure you rebased your branch on the latest `dev` commit to avoid any merge conflicts.

2. Ensure that you respect the [commit naming conventions].

3. Ensure that all automated tests pass with the `npm test` command.

4. Update the documentation with details of changes to the interface, this includes new environment
    variables, exposed ports, useful file locations and container parameters.

5. Push your branch on the gitlab and create a merge request. Briefly explain the purpose of your contribution in the description of the merge request.

6. Tag a Duniter reviewer so he will review your contribution. If you still have no news after several weeks, tag another reviewer or/and talk about your contribution on [the technical forum].

## List of Duniter's reviewers

- @librelois
- @Moul
- @c-geek

[Setting up your development environment]: ./doc/dev/setup_env_dev.md
[the technical forum]: https://forum.duniter.org
[project's git conventions]: ./doc/dev/git-conventions.md
[commit naming conventions]: ./doc/dev/git-conventions.md#naming-commits
