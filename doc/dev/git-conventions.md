# Duniter git conventions

## TL;DR summary of this page, workflow instructions

The summary gives an overview of the rules described below. Reading it will help you to dive into the details.

- Branches must be named according to the template `type/description`
- draft work must be prefixed by "WIP" (work in progress)
- the naming of final commits must comply with the template `[type] scope: action subject`
- one should communicate with developers through dedicated spaces
- integrating a contribution can only be done via a merge with `-no-ff` option and since the following critera are fullfilled
  - branch up to date with `dev` branch (except hotfixes, see the hotfix section)
  - idiomatic code formatting, automated tests passed successfully
  - clean commit history, understandable and concise
  - contribution approved by a reviewer

## Branch naming

### Branch created by Gitlab

Most of the time, you'll use the "create a merge request" button and
Gitlab will name your branch. In that case, please prefix the name of
your branch with the branch type, for example:

    fix/issue-test

### Branch created manually

On all cases anyway, your branch must start by your gitlab account's
username, so than everybody knows who's working on it. Also add it its
type, following this model:

    type/description

type := see "Branch types" below.
description := short summary in present form, 3 to 4 words maximum, no articles.

Example:

    ref/rename_trait_module

## Branch type

- feature : add a feature
- ref : refactoring existing code
- fix : fix a bug in `dev` branch
- hotfix : fix à bug in a stable release

## Naming commits

Every commit must follow this convention:

    [type] scope: action subject

The **type** must be a keyword of the "Commit types" list below.

The **scope** must be the name of the module in question.

The **action** must be a verb in imperative form, the **subject** a noun.

For example, we rename the trait `Foo` to `Fii` in the `toto` module:

    [ref] toto: rename Foo -> Fii

Commits must be lowercase.

### Commit types

- `build`: Changes in the scripts of build, packaging or publication of releases.
- `ci` :  Changes in the Continuous Integration pipeline.
- `deps` : Changes in dependencies without changes into the code. This can be for update or deletion of third-party libraries.
- `docs` : Changes in documentation (both for translation and new content).
- `feat` : Development of a new feature.
- `fix` : Bug fixing.
- `opti` :  Optimisation: better performances, decrease in memory or disk usage.
- `ref` : Refactoring. This commit doesn't change the functionnality.
- `style` : Style modification (usually `fmt` and `clippy`).
- `tests` : Changes in tests or new tests.

The commit name hase to be meaningful in the context of commit history reread. It should not make reference to a specific MR or discussion.
Among other, commit history is used in changlogs and to follow the project progress, that's why it has to be self-explanatory.
If you have a new need, please contact the main developers to add a type together.

## Update strategy

We only use **rebases**, *merges* are strictly fordbidden !

Every time the `dev` branch is updated, you must rebase each of your working branch on it. For each of them:

1. Go on your branch
2. Run a rebase on dev:

    git rebase dev

3. If you see conflicts, fix them by editing the sources. Once it is done, you must:
   a. commit the files that were in conflict
   b. continue the rebase with `git rebase --continue`
   c. Do 3. again for each commit that will be in conflict.

4. When you don't have any conflict anymore after `git rebase --continue`, then the rebase succeeded. Then rebase a remaning branch.

To prevent accidental merge commits, we recommend that force the `--ff-only` option on the merge command:

    git config --global merge.ff only

## When to push

Ideally, you should push when you are about to shut down your computer, so about once a day.

You must prefix your commit with `wip:` when it is a work in progress.

> But why push if I am not done ?

Pushing is no big deal and prevents you from loosing work in case of
any problem with your material.

## Before requesting proofreading of your merge request

After complying with the above criteria in your commits, you should check that your branch is up to date with the target branch (`dev` in this example). As this branch is moving forward frequently, it is possible that new commits may have occurred while you were working on your branch (named YOUR_BRANCH, here). If this is the case or in case of doubt, to update your branch with respect to `dev`, do the following:

  git checkout dev          # switch to dev branch
  git pull                  # updates the remote branch based on remote
  git checkout YOU_BRANCH   # switch back to your branch
  git rebase dev            # rebase you work on dev branch

In case of conflict during rebase that you can not solve, contact a lead developer telling him the hash of the commit on which YOUR_BRANCH is currently based so he can reproduce the rebase and see the conflicts. While waiting for his answer, you can cancel the rebase and work on YOUR_BRANCH without updating:

  git rebase --abort

It is better to take your time before integrating a new contribution because the history of the dev branch cannot be modified: it is a protected branch. Each commit on this branch remains there *ad vitam aeternam* that is why we make sure to keep a clear and understandable commit history.

## Discussion in a merge request

On Gitlab, a discussion is opened for each merge request. It will allow you to discuss the changes you have made. Feel free to identify someone by writing @pseudo so that they are notified of your request. Don't be impatient, the review of your contribution may take more or less time depending on its content!

The general discussion is used to comment on the merge request as a whole, for example to tag a developer for a proofreading request. When it comes to discussing a specific change in the code, you should go to the "Changes" tab of the merge request and comment under the code extract involved. This makes it easier to break down the resolution of problems raised by the merge request via the "comment resolution" feature. Each segment can be marked as resolved, but only the reviewer is allowed to do so!

## How to merge

When you finished developing, you must compile, run linter and run all tests:

    npm install
    npm format:check
    npm test

Then commit everything.

In case you had a `wip:` prefix, you can remove it.

If you have a pile of commits, use the useful interactive rebase to clean up your branch history and create atomic ones:

    git rebase -i dev

There you can rename the `wip:` commits, you can "fixup" commits that go together, you can rename and re-order commits,...

After an interactive rebase, your local git history is different that yours in Gitlab, so you need a force push to make it to Gitlab:

    git push -f

Now is time to go to Gitlab and re-check your commits.

Wait for the Continuous Integration pipeline to finish (it lasts ±20min), and at last when it is done you can remove the "WIP" mention of your Merge Request and mention (with "@name") the lead developers to ask for a code review.

## Workflow

Il y a 3 types de branches permanentes :

- La branche `dev`, c'est la branche par défaut (le tronc), toutes les contributions doivetn être mergées sur cette branche (à l'exception des hotfix).
- La branche `stable`, elle pointe toujours sur le tag le plus récent de la dernière version stable. Elle sert de repère pour la documentation nottament.
- Les branches de hotfix, au format `hotfix/x.y`. Une branche de hotfix pour une version `x.y` n'est créée qu'a partir du moment où il y a un correctif à livrer en production sur cette version `x.y` et que correctif ne peut pas attendre version suivante.

There are 3 types of permanent branches:

- The `dev` branch is the default branch (the trunk), all contributions must be merged to this branch (except hotfixes).
- The `stable` branch, it always points to the most recent tag of the latest stable release. It is used as a reference for documentation, in particular.
- The hotfix branches, in `hotfix/x.y` format. A hotfix branch for an `x.y` release is only created when there is a patch to be released to production on that `x.y` release that cannot wait for the next release.

## Hotfix

Si un bug bloquant se produit en production et nécessite un hotfix, ce dernier doit faire l'objet de 2 tickets et 2 branches :

1. Le ticket original du bug, doit être traité sur une branche `hotfix/issue-number-or-bug-description` puis mergé sur la branche `hotfix/x.y`, où `x.y` désigne la version en production a ce moment là.
2. Un ticket de report doit être créé, il doit citer le ticket original et permet de tracer la correction du bug sur la branche `dev`. Si pour X raison le hotfix n'a pas lieu d'être reporté sur la branche dev, le ticket de repport doit expliquer pourquoi puis être cloturé.

If a blocking bug occurs in production and requires a hotfix, the latter must be the subject of 2 issues and 2 branches :

1. The original issue, must be processed on a `hotfix/issue-number-or-bug-description` branch, then merged to the `hotfix/x.y` branch, where `x.y` is the version in production at that time.
2. A carryover issue must be created, quoting the original issue and tracing the bug fix to the `dev` branch. If for any reason the hotfix does not need to be carried over to the `dev` branch, the carryover issue should explain why and then be closed.
