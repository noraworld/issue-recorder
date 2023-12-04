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
  let comments = await getComments()
  let modes = process.env.MODE.split(',').map((element) => element.trim())

  let withQuote
  let issueBody
  let content

  for (const mode of modes) {
    switch (mode) {
      case 'file':
        withQuote = (process.env.WITH_QUOTE.includes('file')) ? true : false
        issueBody = buildIssueBody(withQuote)
        content = buildContent(comments, issueBody, withQuote)
        commit(issueBody, content)
        break
      case 'issue':
        withQuote = (process.env.WITH_QUOTE.includes('issue')) ? true : false
        issueBody = buildIssueBody(withQuote)
        content = buildContent(comments, issueBody, withQuote)
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

function buildIssueBody(withQuote) {
  let issueBody = ''
  if (!process.env.ISSUE_BODY) return issueBody

  issueBody = `${process.env.ISSUE_BODY}`
  if (withQuote) issueBody = encompassWithQuote(issueBody)
  issueBody += newline
  if (process.env.WITH_DATE) issueBody += `${newline}> ${formattedDateTime(process.env.ISSUE_CREATED_AT)}${newline}`

  return issueBody
}

function buildContent(comments, issueBody, withQuote) {
  let content = ''
  let isFirstComment = true

  comments.forEach((comment) => {
    if (!isFirstComment || issueBody) {
      content += withQuote ? `${newline}>---${newline}>${newline}` : `${newline}---${newline}${newline}`
    }
    isFirstComment = false

    content += withQuote ? encompassWithQuote(comment.body) : comment.body

    if (process.env.WITH_DATE) {
      content += `${newline}${newline}> ${formattedDateTime(comment.created_at)}`
    }

    content += `${newline}`
  })

  return content
}

function commit(issueBody, content) {
  // Node.js Stream doesn't work if a filename contains back quotes, even if they are sanitized correctly.
  // Even if it were to work properly, back quotes shouldn't be used for a filename.
  const filepath = buildFilepath()

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

  let title = ''
  if (process.env.WITH_TITLE) {
    title = `# [${process.env.ISSUE_TITLE}](${process.env.ISSUE_URL})${newline}`
  }

  const dir = path.dirname(filepath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  fs.writeFileSync(filepath, `${header}${existingContent}${title}${issueBody}${content}`)

  execSync(`git config --global user.name "${process.env.COMMITTER_NAME}"`)
  execSync(`git config --global user.email "${process.env.COMMITTER_EMAIL}"`)
  execSync(`git add "${filepath}"`)
  execSync(`git commit -m "${commitMessage}"`)
  execSync('git push')
}

function post(issueBody, content) {
  let targetIssueRepo = process.env.TARGET_ISSUE_REPO ? process.env.TARGET_ISSUE_REPO : process.env.GITHUB_REPOSITORY

  let targetIssueNumber = ''
  if (process.env.TARGET_ISSUE_NUMBER && process.env.TARGET_ISSUE_NUMBER !== 'latest') {
    targetIssueNumber = process.env.TARGET_ISSUE_NUMBER
  }
  else {
    targetIssueNumber = execSync(`gh issue list --repo "${targetIssueRepo}" --limit 1 | awk '{ print $1 }'`).toString().trim()
  }

  let title = ''
  if (process.env.WITH_TITLE) {
    title = `# ✅ [${process.env.ISSUE_TITLE}](${process.env.ISSUE_URL})${newline}`
  }

  let fold = ''
  let foldEnd = ''
  if
  (
    process.env.FOLD_THRESHOLD !== '' &&
    process.env.FOLD_THRESHOLD !== 'infinity' &&
    issueBody.length + content.length > process.env.FOLD_THRESHOLD
  ) {
    fold = `<details><summary>${process.env.FOLD_SUMMARY}</summary>${newline}${newline}`
    foldEnd = `</details>${newline}`
  }

  let tmpFile = 'tmp.md'
  fs.writeFileSync(tmpFile, `${title}${fold}${issueBody}${content}${foldEnd}`)

  execSync(`gh issue comment --repo "${targetIssueRepo}" "${targetIssueNumber}" --body-file "${tmpFile}"`)
}

function buildFilepath() {
  let filepath = ''

  switch (process.env.FILEPATH) {
    case 'default':
      // https://github.com/noraworld/to-do/issues/173#issuecomment-1835656402
      const issueNumber = process.env.ISSUE_NUMBER
      const issueTitle  = process.env.ISSUE_TITLE

      let dirA = issueNumber / 10000
      if (Number.isInteger(dirA)) dirA--
      dirA = String(Math.floor(dirA)).padStart(2, '0')

      let dirB = issueNumber / 100
      if (Number.isInteger(dirB)) dirB--
      dirB = String(Math.floor(dirB) % 100).padStart(2, '0')

      filepath = `issues/${dirA}/${dirB}/${issueNumber}_${convertSpaceIntoHyphen(eliminateBackQuote(issueTitle))}.md`
      break
    default:
      filepath = convertSpaceIntoHyphen(eliminateBackQuote(process.env.FILEPATH))
      break
  }

  return filepath
}

function formattedDateTime(timestamp) {
  const universalTime = DateTime.fromISO(timestamp, { zone: 'utc' })
  const localTime = universalTime.setZone(process.env.TIMEZONE)
  return localTime.toFormat(process.env.TIME_FORMAT)
}

function encompassWithQuote(str) {
  return `> ${str.replaceAll(/(\r\n|\r|\n)/g, '$&> ')}`
}

function eliminateBackQuote(str) {
  return str.replaceAll(/`/g, '')
}

function convertSpaceIntoHyphen(str) {
  return str.replaceAll(/\s/g, '-')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
