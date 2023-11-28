# Issue Recorder
Issue Recorder lets you save all comments on an issue to a file in your repository. Markdown is fully supported.

It is assumed to work by triggering the issue closed event. For instance, when you close an issue, it starts to work and saves all the comments including their body on the issue you close to a specific file you configure.

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
        uses: noraworld/issue-recorder@v0.1.1
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
It doesn't take any effect if you specify an option that is not relevant to the mode you select. For example, if you set a mode to file and specify `target_issue_repo`, it doesn't work as you expect.

| Key                        | Mode            | Description                                                                                            | Type    | Required | Default                                   |
| -------------------------- | --------------- |------------------------------------------------------------------------------------------------------- | ------- | -------- | ----------------------------------------- |
| `mode`                     |                 | Specify where to save the issue, a `file`, or within another `issue` [^mode]                           | String  | false    | `file`                                    |
| `filepath`                 | `file`          | Specify the filename to be created or modified                                                         | String  | true     |                                           |
| `committer_name`           | `file`          | This value will be used for git commit                                                                 | String  | false    | `GitHub Actions`                          |
| `committer_email`          | `file`          | This value will be used for git commit                                                                 | String  | false    | `actions@github.com`                      |
| `extra_text_when_modified` | `file`          | When the file already exists, this string will be added before the content                             | String  | false    | `"# From issues"`                         |
| `target_issue_repo`        | `issue`         | Select a repository with a username whose issue you want to transfer (e.g. `noraworld/issue-recorder`) | String  | false    | (the repository this Action is installed) |
| `target_issue_number`      | `issue`         | Select an issue number [^target_issue_number]                                                          | String  | false    | `latest`                                  |
| `with_date`                | `file`, `issue` | Whether to include the date and time                                                                   | Boolean | false    | `false`                                   |
| `timezone`                 | `file`, `issue` | Your timezone                                                                                          | String  | false    | `Etc/GMT`                                 |
| `time_format`              | `file`, `issue` | Time format                                                                                            | String  | false    | `MMM d, yyyy, h:mm a ZZZZ`                |
| `with_header`              | `file`, `issue` | Prepend a header content at the beginning of a file                                                    | String  | false    | `''`                                      |

[^mode]: If you want to save to both of them, you can use a comma-separated value like `issue, file`.

[^target_issue_number]: If you specify the special identifier `latest`, the latest open issue on the specified repository will be obtained. If there is no open issue in the target repository, the action fails.

## License
All codes of this project are available under the MIT license. See the [LICENSE](/LICENSE) for more information.
