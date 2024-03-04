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
        env:
          GH_TOKEN: ${{ secrets.GH_TOKEN }}
```

### Options
Here are the options you can customize. All options are not necessarily required except for certain conditions, such as when `target_issue_number` sometimes has to be specified.

| Key                        | Mode            | Description                                                                                                                                                                                                                          | Default                                                       | Type    | Required |
| -------------------------- | --------------- |------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | :-----: | :------: |
| `mode`                     |                 | Specify where to save the issue, a `file`, or within another `issue` [^mode]                                                                                                                                                         | `file`                                                        | String  | False    |
| `filepath`                 | `file`          | Specify the filename to be created or modified                                                                                                                                                                                       | `issues/<00-INF>/<00-99>/<ISSUE_NUMBER>_<ISSUE_TITLE>.md`     | String  | False    |
| `committer_name`           | `file`          | This value will be used for git commit                                                                                                                                                                                               | `GitHub Actions`                                              | String  | False    |
| `committer_email`          | `file`          | This value will be used for git commit                                                                                                                                                                                               | `actions@github.com`                                          | String  | False    |
| `overwrite_when_modified`  | `file`          | When the file already exists, the content will be replaced with a new one                                                                                                                                                            | `""`                                                          | Boolean | False    |
| `extra_text_when_modified` | `file`          | When the file already exists, this string will be added before the content                                                                                                                                                           | `"# From issues"`                                             | String  | False    |
| `notification_comment`     | `file`          | Leave the specified comment here after a file is created or modified ([details](#special-identifier-for-notification_comment))                                                                                                       | `""`                                                          | String  | False    |
| `target_file_repo`         | `file`          | Select a repository with a username whose file you want to commit (e.g. `noraworld/issue-recorder`)                                                                                                                                  | `<REPO_NAME>` (the repository where this Action is installed) | String  | False    |
| `target_issue_repo`        | `issue`         | Select a repository with a username whose issue you want to transfer (e.g. `noraworld/issue-recorder`)                                                                                                                               | `<REPO_NAME>` (the repository where this Action is installed) | String  | False    |
| `target_issue_number`      | `issue`         | Select an issue number [^target_issue_number]                                                                                                                                                                                        | `latest`                                                      | String  | False    |
| `fold_threshold`           | `issue`         | When the total number of letters in the body and the comments is greater than the specified number here, they are folded [^fold_threshold]                                                                                           | `infinity`                                                    | Integer | False    |
| `fold_summary`             | `issue`         | When the issue is folded, the specified string here will be shown as a summary ([details](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/organizing-information-with-collapsed-sections)) | `""`                                                          | String  | False    |
| `with_date`                | `file`, `issue` | Whether to include the date and time                                                                                                                                                                                                 | `""`                                                          | Boolean | False    |
| `timezone`                 | `file`, `issue` | Your timezone                                                                                                                                                                                                                        | `Etc/GMT`                                                     | String  | False    |
| `time_format`              | `file`, `issue` | Time format ([sample](#time-format-sample))                                                                                                                                                                                          | `MMM d, yyyy, h:mm a ZZZZ`                                    | String  | False    |
| `with_header`              | `file`, `issue` | Prepend a header content at the beginning of a file                                                                                                                                                                                  | `""`                                                          | String  | False    |
| `with_title`               | `file`, `issue` | Whether to include the issue title                                                                                                                                                                                                   | `""`                                                          | Boolean | False    |
| `with_quote`               | `file`, `issue` | Specify the mode name and whether to encompass the whole content with a quote for those modes                                                                                                                                        | `""`                                                          | String  | False    |

It doesn't take any effect if you specify an option that is not relevant to the mode you select. For example, if you set a mode to `file` and specify `target_issue_repo`, the option is merely ignored.

[^mode]: If you want to save to both of them, you can use a comma-separated value like `file, issue`.

[^target_issue_number]: If you specify the special identifier `latest`, the latest open issue on the specified repository will be obtained. If there is no open issue in the target repository, the action fails.

[^fold_threshold]: If you specify the empty string `""`, the special identifier `infinity`, or don't specify anything, this option will be disabled.

#### Time format sample
Here are some examples of the time formats. You can customize the time format other than the examples below.

| Style             | Format                     | Example                                              |
| ----------------- | -------------------------- | ---------------------------------------------------- |
| GitHub comments   | `MMM d, yyyy, h:mm a ZZZZ` | <blockquote>Jun 30, 2023, 6:55 PM GMT+9</blockquote> |
| X (Twitter) posts | `h:mm a · MMM d, yyyy`     | <blockquote>6:55 PM · Jun 30, 2023</blockquote>      |

#### Special identifier for `notification_comment`
You can use the following special identifiers for `notification_comment`.

| Identifier    | Replaced with                        |
| ------------- | ------------------------------------ |
| `<FILE_PATH>` | A file path configured in `filepath` |
| `<FILE_URL>`  | A full URL for a file                |

For instance, if you specify `The content of this task was saved in [<FILE_PATH>](<FILE_URL>)`, the actual comment is like `The content of this task was saved in [issues/00/42/4201_purchase-boiled-eggs.md](https://github.com/noraworld/issue-recorder/blob/main/issues/00/42/4201_purchase-boiled-eggs.md)`.

## License
All codes of this project are available under the MIT license. See the [LICENSE](/LICENSE) for more information.
