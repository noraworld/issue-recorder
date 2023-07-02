# Issue Tracker
Issue Tracker lets you save all comments on an issue to a file in your repository. Markdown is fully supported.

It is assumed to work by triggering the issue closed event. For instance, when you close an issue, it starts to work and saves all the comments including their body on the issue you close to a specific file you configure.

| Issue                            | Markdown File                                    |
| :------------------------------: | :----------------------------------------------: |
| ![Issue](/screenshots/issue.png) | ![Markdown File](/screenshots/markdown_file.png) |

## Setup
### Workflow sample

```yaml
# .github/workflows/issue-tracker.yml

name: Issue Tracker

on:
  issues:
    types:
      - closed

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Track issues
        uses: noraworld/issue-tracker@v0.1.0
        with:
          filepath: .issues/${{ github.event.issue.title }}.md
          committer_name: GitHub Actions
          committer_email: actions@github.com
          extra_text_when_modified: "# From issues"
          with_date: true
          timezone: Etc/GMT
          time_format: h:mm a · MMM d, yyyy (ZZZZ)
```

### Options

| Key                        | Description                                                                | Type    | Required | Default                    |
| -------------------------- | -------------------------------------------------------------------------- | ------- | -------- | -------------------------- |
| `filepath`                 | Specify the filename to be created or modified                             | String  | true     |                            |
| `committer_name`           | This value will be used for git commit                                     | String  | false    | `GitHub Actions`           |
| `committer_email`          | This value will be used for git commit                                     | String  | false    | `actions@github.com`       |
| `extra_text_when_modified` | When the file already exists, this string will be added before the content | String  | false    | `"# From issues"`          |
| `with_date`                | Whether to include the date and time                                       | Boolean | false    | `false`                    |
| `timezone`                 | Your timezone                                                              | String  | false    | `Etc/GMT`                  |
| `time_format`              | Time format                                                                | String  | false    | `MMM d, yyyy, h:mm a ZZZZ` |

## License
All codes of this project are available under the MIT license. See the [LICENSE](/LICENSE) for more information.
