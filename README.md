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
        uses: noraworld/issue-recorder@v0.4.0
        with:
          mode: file
          filepath: .issues/${{ github.event.issue.title }}.md
          committer_name: GitHub Actions
          committer_email: actions@github.com
          overwrite_when_modified: true
          newlines_count_before_extra_text: 1
          extra_text_when_modified: "# From issues"
          newlines_count_after_extra_text: 1
          notification_comment: "The content of this task was saved in [<FILE_PATH>](<FILE_URL>)"
          target_file_repo: octocat/hello-world
          title_prefix_for_file: 🥳
          target_issue_repo: octocat/hello-world
          target_issue_number: latest
          partial_content_target_issue_repo: octocat/hello-world
          partial_content_target_issue_number: latest
          partial_content_start_string: "<private>"
          partial_content_end_string: "</private>"
          with_repo_assets: file
          assets_repo: octocat/hello-world
          assets_repo_gist_id: 1234567890abcdef1234567890abcdef
          assets_repo_gist_file: gistfile1.txt
          assets_directory: ${{ github.event.issue.title }}
          with_assets_compression: true
          compression_threshold: 1048576
          resize_width: 1920
          resize_height: 1080
          with_compatible_format: true
          fold_threshold: 1000
          fold_summary: Show details
          title_prefix_for_issue: ✅
          with_date: true
          timezone: Etc/GMT
          time_format: h:mm a · MMM d, yyyy (ZZZZ)
          with_header: "---\r\ntitle: <TITLE>\r\nassignees: <ASSIGNEES>\r\nlabels: <LABELS>\r\n---"
          with_title: "file, issue"
          custom_title: ${{ github.event.issue.title }}
          with_quote: issue
          with_hr: "file, issue"
          empty_lines_count_between_comments: 1
          trailing_newline: true
          skip_body: issue
          skip_if_empty_including_body: "file, issue"
          skip_if_empty_not_including_body: "file, issue"
          fail_if_skip: true
          personal_access_token: GH_TOKEN
        env:
          GH_TOKEN: ${{ secrets.GH_TOKEN }}
```

Overwhelmed by all these options? No worries! They're all optional, so you can skip them entirely if you want!

### Options
Here are the options you can customize. All options are not necessarily required except for certain conditions, such as when `target_issue_number` sometimes has to be specified.

| Key                                            | Description                                                                                                                                                                                                                                                                                                            | Since    | Mode            | Type    | Default                                                       | Examples                                                                      |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------: | --------------- | :-----: | ------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `mode`                                         | Specify where to save the issue, a `file`, or within another `issue` [^mode]                                                                                                                                                                                                                                           | `v0.2.0` |                 | String  | `file`                                                        | `file`, `issue`, `"file, issue"`                                              |
| `filepath`                                     | Specify the filename to be created or modified                                                                                                                                                                                                                                                                         | `v0.1.0` | `file`          | String  | `issues/<00-INF>/<00-99>/<ISSUE_NUMBER>_<ISSUE_TITLE>.md`     | `_posts/${{ env.YEAR }}/${{ env.MONTH }}/${{ github.event.issue.title }}-.md` |
| `committer_name`                               | This value will be used for git commit                                                                                                                                                                                                                                                                                 | `v0.1.0` | `file`          | String  | `GitHub Actions`                                              | `GitHub Actions`                                                              |
| `committer_email`                              | This value will be used for git commit                                                                                                                                                                                                                                                                                 | `v0.1.0` | `file`          | String  | `actions@github.com`                                          | `actions@github.com`                                                          |
| `overwrite_when_modified`                      | When the file already exists, the content will be replaced with a new one                                                                                                                                                                                                                                              | `v0.2.1` | `file`          | Boolean | `""`                                                          | `true`                                                                        |
| `newlines_count_before_extra_text`             | Specify the number of line breaks before the text specified with `extra_text_when_modified`                                                                                                                                                                                                                            | `main`   | `file`, `issue` | Number  | `1`                                                           | `0`                                                                           |
| `extra_text_when_modified`                     | When the file already exists, this string will be added before the content                                                                                                                                                                                                                                             | `v0.1.0` | `file`          | String  | `"# From issues"`                                             | `"# From issues"`                                                             |
| `newlines_count_after_extra_text`              | Specify the number of line breaks after the text specified with `extra_text_when_modified`                                                                                                                                                                                                                             | `main`   | `file`, `issue` | Number  | `1`                                                           | `0`                                                                           |
| `notification_comment`                         | Leave the specified comment here after a file is created or modified ([details](#special-identifier-for-notification_comment))                                                                                                                                                                                         | `v0.2.0` | `file`          | String  | `""`                                                          | `The content of this task was saved in [<FILE_PATH>](<FILE_URL>)`             |
| `target_file_repo`                             | Select a repository with a username whose file you want to commit [^token_permission]                                                                                                                                                                                                                                  | `v0.2.2` | `file`          | String  | `<REPO_NAME>` (the repository where this Action is installed) | `octocat/hello-world`                                                         |
| `title_prefix_for_file`                        | Specify additional letters or emojis appearing at the beginning of the title in a file                                                                                                                                                                                                                                 | `v0.3.0` | `file`          | String  | `""`                                                          | `🥳`                                                                          |
| `target_issue_repo`                            | Select a repository with a username whose issue you want to transfer                                                                                                                                                                                                                                                   | `v0.2.0` | `issue`         | String  | `<REPO_NAME>` (the repository where this Action is installed) | `octocat/hello-world`                                                         |
| `target_issue_number`                          | Select an issue number [^target_issue_number]                                                                                                                                                                                                                                                                          | `v0.2.0` | `issue`         | String  | `latest`                                                      | `307`                                                                         |
| `partial_content_target_issue_repo`            | Select a repository with a username whose partial content you want to transfer ([details](#about-partial-content))                                                                                                                                                                                                     | `v0.4.0` | `file`, `issue` | String  | `""` [^partial_content_target_issue_repo_empty]               | `octocat/hello-world`                                                         |
| `partial_content_target_issue_number`          | Select an issue number [^target_issue_number] ([details](#about-partial-content))                                                                                                                                                                                                                                      | `v0.4.0` | `file`, `issue` | String  | `latest`                                                      | `591`                                                                         |
| `partial_content_start_string`                 | Words or sentences in the issue body and the issue comments that start with the string here and end with `partial_content_end_string` will be converted into a specific marker and transferred to another issue of the repository specified in `partial_content_target_issue_repo` ([details](#about-partial-content)) | `v0.4.0` | `file`, `issue` | String  | `""`                                                          | `"(<span dir=\"auto\">{private}\|<div dir=\"auto\"><p>{private})"`            |
| `partial_content_end_string`                   | A counterpart of `partial_content_start_string` ([details](#about-partial-content))                                                                                                                                                                                                                                    | `v0.4.0` | `file`, `issue` | String  | `""`                                                          | `"({/private}</span>\|{/private}</div>)"`                                     |
| `with_repo_assets`                             | Specify whether the attached files that are posted on an issue are saved to a repository with cache enabled ([details](#initial-setup-for-with_repo_assets))                                                                                                                                                           | `v0.4.0` | `file`, `issue` | String  | `""`                                                          | `file`, `issue`, `"file, issue"`                                              |
| `assets_repo`                                  | A repository where the attached files are saved ([details](#initial-setup-for-with_repo_assets))                                                                                                                                                                                                                       | `v0.4.0` | `file`, `issue` | String  | `""`                                                          | `octocat/hello-world`                                                         |
| `assets_repo_gist_id`                          | A Gist ID where `assets_repo` is written [^assets_repo_gist] ([details](#assets_repo_gist_id--assets_repo_gist_file))                                                                                                                                                                                                  | `main`   | `file`, `issue` | String  | `""`                                                          | `1234567890abcdef1234567890abcdef`                                            |
| `assets_repo_gist_file`                        | A Gist file name where `assets_repo` is written [^assets_repo_gist] ([details](#assets_repo_gist_id--assets_repo_gist_file))                                                                                                                                                                                           | `main`   | `file`, `issue` | String  | `gistfile1.txt`                                               | `gistfile1.txt`                                                               |
| `assets_directory`                             | A directory structure of the attached files                                                                                                                                                                                                                                                                            | `v0.4.0` | `file`, `issue` | String  | `""`                                                          | `${{ env.YEAR }}/${{ env.MONTH }}`                                            |
| `with_assets_compression`                      | Whether the attached files are compressed or not                                                                                                                                                                                                                                                                       | `v0.4.0` | `file`, `issue` | Boolean | `""`                                                          | `true`                                                                        |
| `compression_threshold`                        | When the file size of each attached file is larger than the specified number here, it is compressed until the size is smaller than the number                                                                                                                                                                          | `v0.4.0` | `file`, `issue` | Integer | `""`                                                          | `1048576`                                                                     |
| `resize_width`                                 | When the width of the attached file is larger than the specified number (px) here, it is resized until the width is smaller than the number                                                                                                                                                                            | `v0.4.0` | `file`, `issue` | Integer | `""`                                                          | `1920`                                                                        |
| `resize_height`                                | When the height of the attached file is larger than the specified number (px) here, it is resized until the height is smaller than the number                                                                                                                                                                          | `v0.4.0` | `file`, `issue` | Integer | `""`                                                          | `1080`                                                                        |
| `with_compatible_format`                       | Convert Web/P images into JPEG ones                                                                                                                                                                                                                                                                                    | `main`   | `file`, `issue` | Boolean | `""`                                                          | `true`                                                                        |
| `fold_threshold`                               | When the total number of letters in the body and the comments is greater than the specified number here, they are folded [^fold_threshold]                                                                                                                                                                             | `v0.2.0` | `issue`         | Integer | `infinity`                                                    | `1000`                                                                        |
| `fold_summary`                                 | When the issue is folded, the specified string here will be shown as a summary ([details](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/organizing-information-with-collapsed-sections))                                                                                   | `v0.2.0` | `issue`         | String  | `""`                                                          | `Show details`                                                                |
| `title_prefix`<br>**[DELETED SINCE `v0.3.0`]** | ~~Specify additional letters or emojis appearing at the beginning of the title in an issue~~<br>Use `title_prefix_for_issue` instead                                                                                                                                                                                   | `v0.2.2` | `issue`         | String  | `""`                                                          | `✅`                                                                          |
| `title_prefix_for_issue`                       | Specify additional letters or emojis appearing at the beginning of the title in an issue                                                                                                                                                                                                                               | `v0.3.0` | `issue`         | String  | `""`                                                          | `✅`                                                                          |
| `with_date`                                    | Whether to include the date and time                                                                                                                                                                                                                                                                                   | `v0.1.0` | `file`, `issue` | Boolean | `""`                                                          | `true`                                                                        |
| `timezone`                                     | Your timezone                                                                                                                                                                                                                                                                                                          | `v0.1.0` | `file`, `issue` | String  | `Etc/GMT`                                                     | `Asia/Tokyo`                                                                  |
| `time_format`                                  | Time format ([sample](#time-format-sample))                                                                                                                                                                                                                                                                            | `v0.1.0` | `file`, `issue` | String  | `MMM d, yyyy, h:mm a ZZZZ`                                    | `h:mm a · MMM d, yyyy (ZZZZ)`                                                 |
| `with_header`                                  | Prepend a header content at the beginning of a file ([details](#special-identifier-for-with_header))                                                                                                                                                                                                                   | `v0.1.1` | `file`, `issue` | String  | `""`                                                          | `"---\r\npublished: true\r\n---"`                                             |
| `with_title`                                   | Whether to include the issue title                                                                                                                                                                                                                                                                                     | `v0.2.0` | `file`, `issue` | String  | `""`                                                          | `""`, `file`, `issue`, `"file, issue"`                                        |
| `custom_title`                                 | Use a custom title given here instead of the original issue title                                                                                                                                                                                                                                                      | `v0.2.2` | `file`, `issue` | String  | `""`                                                          | `${{ env.TITLE }}`                                                            |
| `with_quote`                                   | Specify the mode name and whether to encompass the whole content with a quote for those modes                                                                                                                                                                                                                          | `v0.2.0` | `file`, `issue` | String  | `""`                                                          | `file`, `issue`, `"file, issue"`                                              |
| `with_hr`                                      | Specify the mode name and whether to add a horizontal rule tag (`<hr>` tag) between comments for those modes [^with_hr]                                                                                                                                                                                                | `main`   | `file`, `issue` | String  | `"file, issue"`                                               | `""`, `file`, `issue`, `"file, issue"`                                        |
| `empty_lines_count_between_comments`           | Specify the number of blank lines between comments                                                                                                                                                                                                                                                                     | `main`   | `file`, `issue` | Number  | `1`                                                           | `0`                                                                           |
| `trailing_newline`                             | Whether to include a newline at the end of a file and an issue (do nothing if it already exists)                                                                                                                                                                                                                       | `main`   | `file`, `issue` | Boolean | `true`                                                        | `true`, `false`                                                               |
| `skip_body`                                    | Specify the mode name and whether to skip the body of an issue                                                                                                                                                                                                                                                         | `v0.2.2` | `file`, `issue` | String  | `""`                                                          | `file`, `issue`, `"file, issue"`                                              |
| `skip_if_empty_including_body`                 | Skip saving to a file or leaving a comment on another repository if the content that includes the body of an issue is empty [^skip_if_empty_restriction]                                                                                                                                                               | `v0.4.0` | `file`, `issue` | String  | `""`                                                          | `file`, `issue`, `"file, issue"`                                              |
| `skip_if_empty_not_including_body`             | Skip saving to a file or leaving a comment on another repository if the content that does not include the body of an issue is empty [^skip_if_empty_restriction]                                                                                                                                                       | `v0.4.0` | `file`, `issue` | String  | `""`                                                          | `file`, `issue`, `"file, issue"`                                              |
| `fail_if_skip`                                 | Notify by raising an error when saving to a file or leaving a comment on another repository is skipped by `skip_if_empty_including_body` or `skip_if_empty_not_including_body` option                                                                                                                                  | `v0.4.0` | `file`, `issue` | Boolean | `""`                                                          | `true`                                                                        |
| `personal_access_token`                        | Specify your personal access token name (key) stored in your repository [^token_permission]                                                                                                                                                                                                                            | `v0.2.2` | `file`, `issue` | String  | `""`                                                          | `GH_TOKEN`                                                                    |

It doesn't take any effect if you specify an option that is not relevant to the mode you select. For example, if you set a mode to `file` and specify `target_issue_repo`, the option is merely ignored.

[^mode]: If you want to save to both of them, you can use a comma-separated value like `file, issue`.

[^target_issue_number]: If you specify the special identifier `latest`, the latest open issue on the specified repository will be obtained. If there is no open issue in the target repository, the action fails.

[^fold_threshold]: If you specify the empty string `""`, the special identifier `infinity`, or don't specify anything, this option will be disabled.

[^token_permission]: If you don't specify `personal_access_token`, [`GITHUB_TOKEN`](https://docs.github.com/en/actions/security-guides/automatic-token-authentication#about-the-github_token-secret) will be used. It is useful, but it has lower permissions, so you need your personal access token with stronger permissions sometimes, like when you want to save a file to another repository by using the `target_file_repo` option. For details on how to retrieve and store your personal access token, see [here](https://docs.github.com/en/actions/security-guides/automatic-token-authentication#granting-additional-permissions). If you want to know each permission for the `GITHUB_TOKEN` secret, [this article](https://dev.classmethod.jp/articles/mapping-secrets-github-token/#toc-2) might help you. Don't forget to set the environment variable under the `env` key in your YAML file. The [Workflow sample](#workflow-sample) section might help you.

[^partial_content_target_issue_repo_empty]: The error occurs when not specified, even though the partial content exists.

[^with_hr]: `with_hr` is enabled by default for both the file mode and the issue mode. To disable it, you need to specify an empty string `""` explicitly.

[^skip_if_empty_restriction]: You can't use `skip_if_empty_including_body` and `skip_if_empty_not_including_body` simultaneously.

[^assets_repo_gist]: This option will be ignore if `assets_repo` is specified.

#### Time format sample
Here are some examples of the time formats. You can customize the time format other than the examples below.

| Style             | Format                     | Example                                              |
| ----------------- | -------------------------- | ---------------------------------------------------- |
| GitHub comments   | `MMM d, yyyy, h:mm a ZZZZ` | <blockquote>Jun 30, 2023, 6:55 PM GMT+9</blockquote> |
| X (Twitter) posts | `h:mm a · MMM d, yyyy`     | <blockquote>6:55 PM · Jun 30, 2023</blockquote>      |

#### About partial content
You can transfer the words or sentences in the issue body and the issue comment partially. The portion is converted into like `[^pvt_1234567]` in the repository specified in `target_file_repo` and the issue specified in `target_issue_repo`, and the original content is saved to the issue specified in `partial_content_target_issue_repo`. Here is the example of how it works.

Let's say you set the options related to this function like that.

| Key                                   | Value            |
| ------------------------------------- | ---------------- |
| `target_file_repo`                    | `octocat/repo-a` |
| `target_issue_repo`                   | `octocat/repo-b` |
| `target_issue_number`                 | `1`              |
| `partial_content_target_issue_repo`   | `octocat/repo-c` |
| `partial_content_target_issue_number` | `2`              |
| `partial_content_start_string`        | `<private>`      |
| `partial_content_end_string`          | `</private>`     |

And you leave a comment like the following.

```markdown
I bumped into one of my best friends <private>Kevin</private> and we had a blast.
```

When the action works, the content like the following will be saved to `octocat/repo-a` as a file and posted to the issue `octocat/repo-b/issues/1`.

```markdown
I bumped into one of my best friends [^pvt_1234567] and we had a blast.
```

As for the original content between `partial_content_start_string` and `partial_content_end_string`, it will be posted to the issue `octocat/repo-c/issues/2` like the following.

```markdown
| Reference | Content |
| :---: | --- |
| `[^pvt_1234567]` | Kevin |

[^pvt_1234567]: Kevin
```

**NOTE**: You can use the regular expression in `partial_content_start_string` and `partial_content_end_string`. In other words, if you want to use characters treated in the regular expression as those characters, you need to sanitize them. You don't have to escape `/`.

#### Initial setup for `with_repo_assets`
In order to use the asset repository, you need to enable [GitHub Pages](https://pages.github.com). This is important because this option is geared toward publishing the attached files that are posted on an issue as permanent links with cached enabled. If you don't enable it, not only the cache is unavailable but also the links are not accessible. You can enable it at `https://github.com/<USERNAME>/<REPO>/settings/pages`.

You may need to create the file named [`.nojekyll`](https://github.blog/news-insights/bypassing-jekyll-on-github-pages/) in the root of the assets repository. GitHub Pages tries to build Jekyll by default. In most cases, it's unnecessary and not placing the Jekyll configuration files such as `_config.yml` will result in failing to build GitHub Pages.

#### `assets_repo_gist_id` & `assets_repo_gist_file`
Instead of specifying a repository where the attached files are saved as `assets_repo`, you can also specify a Gist ID (and a Gist file name as optional) where the assets repository name is written by using the options `assets_repo_gist_id` and `assets_repo_gist_file`. They are useful when you are using this action among a lot of repositories but want to specify the same repository. If you omit `assets_repo_gist_file`, then it will regard the file name as `gistfile1`, which is the default one in Gist.

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

#### Special identifier for `with_header`
You can use the following special identifiers for `with_header`.

| Identifier     | Replaced with                             | Type                                         | Example                          |
| -------------- | ----------------------------------------- | -------------------------------------------- | -------------------------------- |
| `<NUMBER>`     | An issue number                           | `Integer`                                    | `4201`                           |
| `<TITLE>`      | An issue title                            | `"String"`                                   | `"Purchase Boiled Eggs"`         |
| `<ASSIGNEES>`  | A list of assignees appointed to an issue | `Array[<"String", "String", "String", ...>]` | `["noraworld"]`                  |
| `<LABELS>`     | A list of labels attached to an issue     | `Array[<"String", "String", "String", ...>]` | `["purchase"]`                   |
| `<CREATED_AT>` | Date and time when an issue is created    | `String`                                     | `8:02 AM · Mar 29, 2024 (GMT+9)` |

## Development
You can use `.env` to load the environment variables that are needed in this project and can call it with the `--env-file=.env` option. It is highly recommended to use `DRY_RUN="true"` to avoid committing or leaving test data during development.

```shell
cp .env.sample .env
node --env-file=.env app.js
```

## License
All codes of this project are available under the MIT license. See the [LICENSE](/LICENSE) for more information.
