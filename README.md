# Issue Recorder
Issue Recorder lets you save all comments on an issue to a file in your repository or within another issue. Markdown is fully supported.

It is assumed to work by triggering the issue closed event. For instance, when you close an issue, it starts to work and saves all the comments, including their body, on the issue you close to a specific file or another issue you configure.

| Issue                            | →   | Markdown File                                    |
| :------------------------------: | --- | :----------------------------------------------: |
| ![Issue](/screenshots/issue.png) | →   | ![Markdown File](/screenshots/markdown_file.png) |

## Setup
### Workflow sample

```yaml
# .github/workflows/issue-recorder.yml

name: Issue Recorder

on:
  issues:
    types:
      - closed

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Issue Recorder
        uses: noraworld/issue-recorder@v0.2.1
        with:
          mode: file
          filepath: .issues/${{ github.event.issue.title }}.md
          committer_name: GitHub Actions
          committer_email: actions@github.com
          extra_text_when_modified: "# From issues"
          with_date: true
          timezone: Etc/GMT
          time_format: h:mm a · MMM d, yyyy (ZZZZ)
          with_header: "---\r\npublished: true\r\n---"
          personal_access_token: GH_TOKEN
        env:
          GH_TOKEN: ${{ secrets.GH_TOKEN }}
```

### Options
Here are the options you can customize. All options are not necessarily required except for certain conditions, such as when `target_issue_number` sometimes has to be specified.

| Key                        | Description                                                                                                                                                                                                                          | Mode            | Type    | Default                                                       | Examples                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- | :-----: | ------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `mode`                     | Specify where to save the issue, a `file`, or within another `issue` [^mode]                                                                                                                                                         |                 | String  | `file`                                                        | `file`, `issue`, `"file, issue"`                                              |
| `filepath`                 | Specify the filename to be created or modified                                                                                                                                                                                       | `file`          | String  | `issues/<00-INF>/<00-99>/<ISSUE_NUMBER>_<ISSUE_TITLE>.md`     | `_posts/${{ env.YEAR }}/${{ env.MONTH }}/${{ github.event.issue.title }}-.md` |
| `committer_name`           | This value will be used for git commit                                                                                                                                                                                               | `file`          | String  | `GitHub Actions`                                              | `GitHub Actions`                                                              |
| `committer_email`          | This value will be used for git commit                                                                                                                                                                                               | `file`          | String  | `actions@github.com`                                          | `actions@github.com`                                                          |
| `overwrite_when_modified`  | When the file already exists, the content will be replaced with a new one                                                                                                                                                            | `file`          | Boolean | `""`                                                          | `true`                                                                        |
| `extra_text_when_modified` | When the file already exists, this string will be added before the content                                                                                                                                                           | `file`          | String  | `"# From issues"`                                             | `"# From issues"`                                                             |
| `notification_comment`     | Leave the specified comment here after a file is created or modified ([details](#special-identifier-for-notification_comment))                                                                                                       | `file`          | String  | `""`                                                          | `The content of this task was saved in [<FILE_PATH>](<FILE_URL>)`             |
| `target_file_repo`         | Select a repository with a username whose file you want to commit [^token_permission]                                                                                                                                                | `file`          | String  | `<REPO_NAME>` (the repository where this Action is installed) | `octocat/hello-world`                                                         |
| `target_issue_repo`        | Select a repository with a username whose issue you want to transfer                                                                                                                                                                 | `issue`         | String  | `<REPO_NAME>` (the repository where this Action is installed) | `octocat/hello-world`                                                         |
| `target_issue_number`      | Select an issue number [^target_issue_number]                                                                                                                                                                                        | `issue`         | String  | `latest`                                                      | `307`                                                                         |
| `fold_threshold`           | When the total number of letters in the body and the comments is greater than the specified number here, they are folded [^fold_threshold]                                                                                           | `issue`         | Integer | `infinity`                                                    | `1000`                                                                        |
| `fold_summary`             | When the issue is folded, the specified string here will be shown as a summary ([details](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/organizing-information-with-collapsed-sections)) | `issue`         | String  | `""`                                                          | `Show details`                                                                |
| `title_prefix`             | Specify additional letters or emojis                                                                                                                                                                                                 | `issue`         | String  | `""`                                                          | `✅`                                                                          |
| `with_date`                | Whether to include the date and time                                                                                                                                                                                                 | `file`, `issue` | Boolean | `""`                                                          | `true`                                                                        |
| `timezone`                 | Your timezone                                                                                                                                                                                                                        | `file`, `issue` | String  | `Etc/GMT`                                                     | `Asia/Tokyo`                                                                  |
| `time_format`              | Time format ([sample](#time-format-sample))                                                                                                                                                                                          | `file`, `issue` | String  | `MMM d, yyyy, h:mm a ZZZZ`                                    | `h:mm a · MMM d, yyyy (ZZZZ)`                                                 |
| `with_header`              | Prepend a header content at the beginning of a file                                                                                                                                                                                  | `file`, `issue` | String  | `""`                                                          | `"---\r\npublished: true\r\n---"`                                             |
| `with_title`               | Whether to include the issue title                                                                                                                                                                                                   | `file`, `issue` | Boolean | `""`                                                          | `true`                                                                        |
| `custom_title`             | Use a custom title given here instead of the original issue title                                                                                                                                                                    | `file`, `issue` | String  | `""`                                                          | `${{ env.TITLE }}`                                                            |
| `with_quote`               | Specify the mode name and whether to encompass the whole content with a quote for those modes                                                                                                                                        | `file`, `issue` | String  | `""`                                                          | `file`, `issue`, `"file, issue"`                                              |
| `skip_body`                | Specify the mode name and whether to skip the body of an issue                                                                                                                                                                       | `file`, `issue` | String  | `""`                                                          | `file`, `issue`, `"file, issue"`                                              |
| `personal_access_token`    | Specify your personal access token name (key) stored in your repository [^token_permission]                                                                                                                                          | `file`, `issue` | String  | `""`                                                          | `GH_TOKEN`                                                                    |

It doesn't take any effect if you specify an option that is not relevant to the mode you select. For example, if you set a mode to `file` and specify `target_issue_repo`, the option is merely ignored.

[^mode]: If you want to save to both of them, you can use a comma-separated value like `file, issue`.

[^target_issue_number]: If you specify the special identifier `latest`, the latest open issue on the specified repository will be obtained. If there is no open issue in the target repository, the action fails.

[^fold_threshold]: If you specify the empty string `""`, the special identifier `infinity`, or don't specify anything, this option will be disabled.

[^token_permission]: If you don't specify `personal_access_token`, [`GITHUB_TOKEN`](https://docs.github.com/en/actions/security-guides/automatic-token-authentication#about-the-github_token-secret) will be used. It is useful, but it has lower permissions, so you need your personal access token with stronger permissions sometimes, like when you want to save a file to another repository by using the `target_file_repo` option. For details on how to retrieve and store your personal access token, see [here](https://docs.github.com/en/actions/security-guides/automatic-token-authentication#granting-additional-permissions). If you want to know each permission for the `GITHUB_TOKEN` secret, [this article](https://dev.classmethod.jp/articles/mapping-secrets-github-token/#toc-2) might help you. Don't forget to set the environment variable under the `env` key in your YAML file. The [Workflow sample](#workflow-sample) section might help you.

#### Time format sample
Here are some examples of the time formats. You can customize the time format other than the examples below.

| Style             | Format                     | Example                                              |
| ----------------- | -------------------------- | ---------------------------------------------------- |
| GitHub comments   | `MMM d, yyyy, h:mm a ZZZZ` | <blockquote>Jun 30, 2023, 6:55 PM GMT+9</blockquote> |
| X (Twitter) posts | `h:mm a · MMM d, yyyy`     | <blockquote>6:55 PM · Jun 30, 2023</blockquote>      |

#### Special identifier for `notification_comment`
You can use the following special identifiers for `notification_comment`.

| Identifier            | Replaced with                        | Example                                                                                                                               |
| --------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `<FILE_PATH>`         | A file path configured in `filepath` | `issues/00/42/4201_purchase-boiled-eggs.md`                                                                                           |
| `<FILE_URL>`          | A full URL for a file                | `https://github.com/noraworld/issue-recorder/blob/main/issues/00/42/4201_purchase-boiled-eggs.md`                                     |
| `<FILE_URL_WITH_SHA>` | A full URL for a file with SHA       | `https://github.com/noraworld/issue-recorder/blob/5c26bf402176693178f8497324fc9b862bdd4a3b/issues/00/42/4201_purchase-boiled-eggs.md` |
| `<REF_NAME>`          | A branch name pointing to a commit   | `main`                                                                                                                                |

For instance, if you specify `The content of this task was saved in [<FILE_PATH>](<FILE_URL>)`, the actual comment is like this:

```
The content of this task was saved in [issues/00/42/4201_purchase-boiled-eggs.md](https://github.com/noraworld/issue-recorder/blob/main/issues/00/42/4201_purchase-boiled-eggs.md)
```

## License
All codes of this project are available under the MIT license. See the [LICENSE](/LICENSE) for more information.
