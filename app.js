'use strict'

const { Octokit } = require('@octokit/rest')
const fs = require('fs')
const { execSync } = require('child_process')
const path = require('path')
const { DateTime } = require('luxon')
// When "\n" is used, GitHub will warn you of the following:
// We’ve detected the file has mixed line endings. When you commit changes we will normalize them to Windows-style (CRLF).
const newline = '\r\n'

async function run() {
  const issueBody = process.env.ISSUE_BODY ? `${process.env.ISSUE_BODY}${newline}` : ''
  let comments = await getComments()
  let content = buildContent(comments, issueBody)
  let modes = process.env.MODE.split(',').map((element) => element.trim())

  for (const mode of modes) {
    switch (mode) {
      case 'file':
        commit(issueBody, content)
        break
      case 'issue':
        post(issueBody, content)
        break
      default:
        console.error(`unknown mode: ${process.env.MODE}`)
        process.exit(1)
        break
    }
  }
}

async function getComments() {
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN })

  const repository = process.env.GITHUB_REPOSITORY
  const [ owner, repo ] = repository.split('/')
  const issueNumber = process.env.ISSUE_NUMBER

  let comments = []
  let page = 1
  const perPage = 100
  let response = null

  do {
    response = await octokit.issues.listComments({
      owner,
      repo,
      issue_number: issueNumber,
      page,
      per_page: perPage
    })

    comments = comments.concat(response.data)
    page++
  } while (response.data.length === perPage)

  return comments
}

function buildContent(comments, issueBody) {
  let content = ''
  let isFirstComment = true

  comments.forEach((comment) => {
    if (!isFirstComment || issueBody) {
      content += `${newline}---${newline}${newline}`
    }
    isFirstComment = false

    content += comment.body

    if (process.env.WITH_DATE) {
      content += `${newline}${newline}> ${formattedDateTime(comment.created_at)}`
    }

    content += `${newline}`
  })

  return content
}

function commit(issueBody, content) {
  const filepath = process.env.FILEPATH

  let existingContent = ''
  let commitMessage = ''
  if (fs.existsSync(filepath)) {
    existingContent = `${fs.readFileSync(filepath)}${newline}${process.env.EXTRA_TEXT_WHEN_MODIFIED}${newline}`
    commitMessage = `Update ${path.basename(filepath)}`
  }
  else {
    commitMessage = `Add ${path.basename(filepath)}`
  }

  let header = ''
  if (!existingContent && process.env.WITH_HEADER) {
    header = `${process.env.WITH_HEADER}${newline}${newline}`
  }

  const dir = path.dirname(filepath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  fs.writeFileSync(filepath, `${header}${existingContent}${issueBody}${content}`)

  execSync(`git config --global user.name "${process.env.COMMITTER_NAME}"`)
  execSync(`git config --global user.email "${process.env.COMMITTER_EMAIL}"`)
  execSync(`git add "${filepath}"`)
  execSync(`git commit -m "${commitMessage}"`)
  execSync('git push')
}

function post(issueBody, content) {
  targetIssueRepo = process.env.TARGET_ISSUE_REPO ? process.env.ISSUE_REPO : process.env.GITHUB_REPOSITORY

  if (process.env.TARGET_ISSUE_NUMBER && process.env.TARGET_ISSUE_NUMBER !== 'latest') {
    targetIssueNumber = process.env.TARGET_ISSUE_NUMBER
  }
  else {
    targetIssueNumber = execSync(`gh issue list --repo "${targetIssueRepo}" --limit 1 | awk '{ print $1 }'`)
  }

  let header = ''
  if (process.env.WITH_HEADER) header = `${process.env.WITH_HEADER}${newline}${newline}`

  let title = `# ✅ ${process.env.ISSUE_TITLE}${newline}`

  execSync(`gh issue comment --repo "${targetIssueRepo}" "${targetIssueNumber}" --body "${header}${title}${issueBody}${content}"`)
}

function formattedDateTime(timestamp) {
  const universalTime = DateTime.fromISO(timestamp, { zone: 'utc' })
  const localTime = universalTime.setZone(process.env.TIMEZONE)
  return localTime.toFormat(process.env.TIME_FORMAT)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
