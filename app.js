'use strict'

const { Octokit } = require('@octokit/rest')
const fs = require('fs')
const { execSync } = require('child_process')
const path = require('path')
const { DateTime } = require('luxon')
const { Base64 } = require('js-base64')
const crypto = require('crypto')
// When "\n" is used, GitHub will warn you of the following:
// We’ve detected the file has mixed line endings. When you commit changes we will normalize them to Windows-style (CRLF).
const newline = '\r\n'
const tmpFile = 'tmp.md'
const pushRetryMaximum = 10
const fixedSalt = generateCryptoHex()
const fixedSaltRounds = randomInt(10, 20)

// Semicolons are sometimes necessary.
//   If you omit them, the following error will cause or an unexpected result will be received because the ASI fails.
//   TypeError: Cannot create property 'undefined' on string '' [^asi]

async function run() {
  let modes = process.env.MODE.split(',').map((element) => element.trim())
  let skipBody = process.env.SKIP_BODY.split(',').map((element) => element.trim())

  let comments
  let withQuote
  let issueBody
  let content
  let extractedIssueBody
  let extractedCommentBodies
  let privateDataJson
  let privateContent

  for (const mode of modes) {
    // It seems like some function invocations are redundant, but they are necessary.
    switch (mode) {
      case 'file':
        comments = await getComments()
        withQuote = (process.env.WITH_QUOTE.includes('file')) ? true : false; // asi
        [issueBody, extractedIssueBody] = (skipBody.includes('file')) ? ['', []] : buildIssueBody(withQuote); // asi
        [content, extractedCommentBodies] = buildContent(comments, issueBody, withQuote)
        privateDataJson = extractedIssueBody.concat(extractedCommentBodies)
        privateContent = buildPrivateContent(privateDataJson)

        if (getWhichModeToPostPrivateIn(modes, skipBody) === 'file') postPrivate(privateContent)
        await commit(issueBody, content)
        break
      case 'issue':
        comments = await getComments()
        withQuote = (process.env.WITH_QUOTE.includes('issue')) ? true : false; // asi
        [issueBody, extractedIssueBody] = (skipBody.includes('issue')) ? ['', []] : buildIssueBody(withQuote); // asi
        [content, extractedCommentBodies] = buildContent(comments, issueBody, withQuote)
        privateDataJson = extractedIssueBody.concat(extractedCommentBodies)
        privateContent = buildPrivateContent(privateDataJson)

        if (getWhichModeToPostPrivateIn(modes, skipBody) === 'issue') postPrivate(privateContent)
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
  const octokit = process.env.PERSONAL_ACCESS_TOKEN ?
                  new Octokit({ auth: process.env[process.env.PERSONAL_ACCESS_TOKEN] }) :
                  new Octokit({ auth: process.env.GITHUB_TOKEN })
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
  let extractedIssueBody = []
  if (!process.env.ISSUE_BODY) return issueBody; // asi

  [issueBody, extractedIssueBody] = trimPrivateContent(process.env.ISSUE_BODY)
  if (withQuote) issueBody = encompassWithQuote(issueBody)
  issueBody += newline
  if (process.env.WITH_DATE) issueBody += `${newline}> ${formattedDateTime(process.env.ISSUE_CREATED_AT)}${newline}`

  return [issueBody, extractedIssueBody]
}

function buildContent(comments, issueBody, withQuote) {
  let content = ''
  let sanitizedCommentBody = ''
  let extractedCommentBody = []
  let extractedCommentBodies = []
  let isFirstComment = true

  comments.forEach((comment) => {
    [sanitizedCommentBody, extractedCommentBody] = trimPrivateContent(comment.body)
    extractedCommentBodies = extractedCommentBodies.concat(extractedCommentBody)

    if (!isFirstComment || issueBody) {
      content += withQuote ? `${newline}> ---${newline}${newline}` : `${newline}---${newline}${newline}`
    }
    isFirstComment = false

    content += withQuote ? encompassWithQuote(sanitizedCommentBody) : sanitizedCommentBody

    if (process.env.WITH_DATE) {
      content += `${newline}${newline}> ${formattedDateTime(comment.created_at)}`
    }

    content += `${newline}`
  })

  return [content, extractedCommentBodies]
}

function trimPrivateContent(commentBody) {
  let extractedCommentBody = []

  const sanitizedCommentBody = commentBody.replace(/(<private>.*?<\/private>)/gs, (_, match) => {
    let hash = `[^pvt_${generateSHA256(match, fixedSalt, fixedSaltRounds).slice(0, 7)}]`
    extractedCommentBody.push({ hash: hash, body: match })
    return hash
  })

  return [sanitizedCommentBody, extractedCommentBody]
}

function buildPrivateContent(privateDataJson) {
  if (!privateDataJson.length) return ''

  let privateContent = `| Reference | Content |${newline}| :---: | --- |`

  privateDataJson.forEach((json) => {
    privateContent +=
      `${newline}| \`${json.hash}\` | ${json.body
      .replace(/^<private>/, '')
      .replace(/<\/private>$/, '')
      .replace(/(\r\n|\r|\n)/g, '<br>')} |`
  })

  privateContent += newline

  privateDataJson.forEach((json) => {
    privateContent +=
      `${newline}${json.hash}: ${json.body
      .replace(/^<private>/, '')
      .replace(/<\/private>$/, '')
      .replace(/(\r\n|\r|\n)/g, '<br>')}`
  })

  return privateContent
}

async function commit(issueBody, content) {
  // Node.js Stream doesn't work if a filename contains back quotes, even if they are sanitized correctly.
  // Even if it were to work properly, back quotes shouldn't be used for a filename.
  const filepath = buildFilepath()

  let existingContent = ''
  let sha = null
  let commitMessage = ''
  let file = await getFileFromRepo(filepath)
  if (file) {
    if (!process.env.OVERWRITE_WHEN_MODIFIED) {
      // FIXME: Use the content of variable "file" instead of readFileSync()
      existingContent = `${fs.readFileSync(filepath)}${newline}${process.env.EXTRA_TEXT_WHEN_MODIFIED}${newline}`
    }

    sha = file.data.sha

    // Using only basename causes the phenomenon that
    // all the commits of the templated diaries saved to the diary repository
    // are completely the same, which is odd.
    //
    // commitMessage = `Update ${path.basename(filepath)}`
    //
    commitMessage = `Update ${filepath}`
  }
  else {
    // commitMessage = `Add ${path.basename(filepath)}`
    commitMessage = `Add ${filepath}`
  }

  let header = ''
  if (!existingContent && process.env.WITH_HEADER) {
    header = `${process.env.WITH_HEADER}${newline}${newline}`
    header =
      header
      .replaceAll(
        '<NUMBER>',
        process.env.ISSUE_NUMBER
      )
      .replaceAll(
        '<TITLE>',
        `"${buildFileTitle()}"`
      )
      .replaceAll(
        '<ASSIGNEES>',
        process.env.ISSUE_ASSIGNEES
      )
      .replaceAll(
        '<LABELS>',
        process.env.ISSUE_LABELS
      )
      .replaceAll(
        '<CREATED_AT>',
        formattedDateTime(process.env.ISSUE_CREATED_AT)
      )
  }

  let title = ''
  if (process.env.WITH_TITLE) {
    const titlePrefixForFile = process.env.TITLE_PREFIX_FOR_FILE ? `${process.env.TITLE_PREFIX_FOR_FILE} ` : ''
    title = `# ${titlePrefixForFile}[${buildFileTitle()}](${process.env.ISSUE_URL})${newline}`
  }

  const commitResult = await push(`${header}${existingContent}${title}${issueBody}${content}`, commitMessage, filepath, sha)

  const targetFileRepo = process.env.TARGET_FILE_REPO ? process.env.TARGET_FILE_REPO : process.env.GITHUB_REPOSITORY
  if (process.env.NOTIFICATION_COMMENT) {
    // https://docs.github.com/en/actions/learn-github-actions/variables
    let notification_comment =
      process.env.NOTIFICATION_COMMENT
      .replaceAll(
        '<FILE_PATH>',
        filepath
      )
      .replaceAll(
        '<FILE_URL>',
        `${process.env.GITHUB_SERVER_URL}/${targetFileRepo}/blob/${process.env.GITHUB_REF_NAME}/${githubFlavoredPercentEncode(filepath)}`
      )
      .replaceAll(
        '<FILE_URL_WITH_SHA>',
        `${process.env.GITHUB_SERVER_URL}/${targetFileRepo}/blob/${commitResult.data.commit.sha}/${githubFlavoredPercentEncode(filepath)}`
      )
      .replaceAll(
        '<REF_NAME>',
        process.env.GITHUB_REF_NAME
      )

    fs.writeFileSync(tmpFile, notification_comment)
    execSync(`gh issue comment "${process.env.ISSUE_NUMBER}" --body-file "${tmpFile}"`)
    fs.unlinkSync(tmpFile)
  }
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
    const titlePrefixForIssue = process.env.TITLE_PREFIX_FOR_ISSUE ? `${process.env.TITLE_PREFIX_FOR_ISSUE} ` : ''
    title = `## ${titlePrefixForIssue}[${buildFileTitle()}](${process.env.ISSUE_URL})${newline}`
  }

  let fold = ''
  let foldEnd = ''
  if
  (
    process.env.FOLD_THRESHOLD !== '' &&
    process.env.FOLD_THRESHOLD !== 'infinity' &&
    issueBody.length + content.length > process.env.FOLD_THRESHOLD
  ) {
    fold = `<details><summary>${process.env.FOLD_SUMMARY}</summary><br>${newline}${newline}`
    foldEnd = `</details>${newline}`
  }

  fs.writeFileSync(tmpFile, `${title}${fold}${issueBody}${content}${foldEnd}`)
  execSync(`gh issue comment --repo "${targetIssueRepo}" "${targetIssueNumber}" --body-file "${tmpFile}"`)
  fs.unlinkSync(tmpFile)
}

// TODO: Consider refactoring because most of the codes is similar to post()
function postPrivate(privateContent) {
  if (!privateContent) return false

  let targetIssueRepo = process.env.PRIVATE_TARGET_ISSUE_REPO
  if (!targetIssueRepo) {
    // This is a safe condition.
    // Publishing the private content somewhere implicitly without the user's recognition is so dangerous!
    console.error('target issue repo is empty')
    process.exit(1)
  }

  let targetIssueNumber = ''
  if (process.env.PRIVATE_TARGET_ISSUE_NUMBER && process.env.PRIVATE_TARGET_ISSUE_NUMBER !== 'latest') {
    targetIssueNumber = process.env.PRIVATE_TARGET_ISSUE_NUMBER
  }
  else {
    targetIssueNumber = execSync(`gh issue list --repo "${targetIssueRepo}" --limit 1 | awk '{ print $1 }'`).toString().trim()
  }

  let title = ''
  if (process.env.WITH_TITLE) {
    const titlePrefixForIssue = process.env.TITLE_PREFIX_FOR_ISSUE ? `${process.env.TITLE_PREFIX_FOR_ISSUE} ` : ''
    title = `## ${titlePrefixForIssue}[${buildFileTitle()}](${process.env.ISSUE_URL})${newline}`
  }

  fs.writeFileSync(tmpFile, `${title}${privateContent}`)
  execSync(`gh issue comment --repo "${targetIssueRepo}" "${targetIssueNumber}" --body-file "${tmpFile}"`)
  fs.unlinkSync(tmpFile)
}

async function getFileFromRepo(path) {
  const octokit = process.env.PERSONAL_ACCESS_TOKEN ?
                  new Octokit({ auth: process.env[process.env.PERSONAL_ACCESS_TOKEN] }) :
                  new Octokit({ auth: process.env.GITHUB_TOKEN })
  const targetFileRepo = process.env.TARGET_FILE_REPO ? process.env.TARGET_FILE_REPO : process.env.GITHUB_REPOSITORY
  const [ owner, repo ] = targetFileRepo.split('/')

  try {
    const response = await octokit.repos.getContent({
      owner,
      repo,
      path: path,
    })

    // A target file is found.
    return response
  }
  catch (error) {
    if (error.status === 404) {
      // A target file is not found.
      return false
    } else {
      // Something goes wrong.
      console.error(error)
      return false
    }
  }
}

// https://blog.dennisokeeffe.com/blog/2020-06-22-using-octokit-to-create-files
async function push(content, commitMessage, filepath, sha) {
  const octokit = process.env.PERSONAL_ACCESS_TOKEN ?
                  new Octokit({ auth: process.env[process.env.PERSONAL_ACCESS_TOKEN] }) :
                  new Octokit({ auth: process.env.GITHUB_TOKEN })
  const targetFileRepo = process.env.TARGET_FILE_REPO ? process.env.TARGET_FILE_REPO : process.env.GITHUB_REPOSITORY
  const [ owner, repo ] = targetFileRepo.split('/')

  for (let i = 1; i <= pushRetryMaximum; i++) {
    try {
      const response = await octokit.repos.createOrUpdateFileContents({
        owner: owner,
        repo: repo,
        path: filepath,
        message: commitMessage,
        content: Base64.encode(content),
        // https://docs.github.com/en/rest/repos/contents?apiVersion=2022-11-28#create-or-update-file-contents:~:text=Required%20if%20you%20are%20updating%20a%20file.%20The%20blob%20SHA%20of%20the%20file%20being%20replaced.
        sha: sha,
        committer: {
          name: process.env.COMMITTER_NAME,
          email: process.env.COMMITTER_EMAIL,
        },
        author: {
          name: process.env.COMMITTER_NAME,
          email: process.env.COMMITTER_EMAIL,
        },
      })

      return response // succeed
    }
    catch (error) {
      console.error(error)

      if (i === pushRetryMaximum) {
        console.error(`The attempt #${i} has failed. No more attempts will be made. Sorry, please try again.`)
      }
      else {
        console.error(`The attempt #${i} has failed. Move on to the next attempt.`)
      }
    }
  }
}

function buildFileTitle() {
  return process.env.CUSTOM_TITLE ? process.env.CUSTOM_TITLE : process.env.ISSUE_TITLE.replaceAll(/\\/g, '\\\\')
}

function buildFilepath() {
  let filepath = ''

  switch (process.env.FILEPATH) {
    case 'default':
      // https://github.com/noraworld/to-do/issues/173#issuecomment-1835656402

      const issueNumber = process.env.ISSUE_NUMBER
      // There is no need to sanitize backslashes or invoke buildFileTitle().
      const issueTitle = process.env.ISSUE_TITLE.replaceAll(/\//g, '\\')

      let dirA = issueNumber / 10000
      if (Number.isInteger(dirA)) dirA--
      dirA = String(Math.floor(dirA)).padStart(2, '0')

      let dirB = issueNumber / 100
      if (Number.isInteger(dirB)) dirB--
      dirB = String(Math.floor(dirB) % 100).padStart(2, '0')

      filepath = `issues/${dirA}/${dirB}/${issueNumber}_${convertFilenameSpecialCharacters(issueTitle)}.md`
      break
    default:
      filepath = convertFilenameSpecialCharacters(process.env.FILEPATH)
      break
  }

  return filepath
}

// If you post both in 'file' and 'issue' mode, comments will be duplicated. This function is called to avoid that.
function getWhichModeToPostPrivateIn(modes, skipBody) {
  if (modes.includes('file') && !modes.includes('issue')) {
    return 'file'
  }
  else if (modes.includes('issue') && !modes.includes('file')) {
    return 'issue'
  }
  else if (skipBody.includes('file') && !skipBody.includes('issue')) {
    return 'issue'
  }
  else if (skipBody.includes('issue') && !skipBody.includes('file')) {
    return 'file'
  }
  else if (
    (skipBody.includes('file') && skipBody.includes('issue')) ||
    (!skipBody.includes('file') && !skipBody.includes('issue'))
  ) {
    return 'file' // <- 'issue' is also good. There is no differences.
  }
  else {
    console.error('unexpected pattern has been detected.')
    process.exit(1)
  }
}

function formattedDateTime(timestamp) {
  const universalTime = DateTime.fromISO(timestamp, { zone: 'utc' })
  const localTime = universalTime.setZone(process.env.TIMEZONE)
  return localTime.toFormat(process.env.TIME_FORMAT)
}

function encompassWithQuote(str) {
  return `> ${str.replaceAll(/(\r\n|\r|\n)/g, '$&> ')}`
}

// None of the JavaScript encode functions has the same specification as what GitHub offers.
//
//   * "escape()" is deprecated and may not be supported in the future. Besides, parentheses are encoded even though it is not necessary.
//   * "encodeURI()" is not sufficient because it doesn't encode the question mark "?" which has to be converted into "%3F."
//   * "encodeURIComponent()" converts the slash letters to show the directory structures into "%2F," which looks odd.
//
//   https://stackoverflow.com/questions/332872/encode-url-in-javascript#answer-332897
//   https://github.com/noraworld/to-do/issues/387
//
// We considered using "encodeURIComponent()" to exceptionally disable the encoding of the slash symbol,
// but decided to implement it on our own because we judged it to be somewhat complicated.
//
// TODO: The current implementation is not sufficient. It may be missing some of the characters that should be encoded.
function githubFlavoredPercentEncode(str) {
  return str
    .replaceAll(/\?/g, '%3F')
    .replaceAll(/\#/g, '%23')
    .replaceAll(/\\/g, '%5C')
}

function convertFilenameSpecialCharacters(str) {
  return str
    .replaceAll(/`/g, '')
    .replaceAll(/\s/g, '-')
}

function sanitizeShellSpecialCharacters(str) {
  // https://stackoverflow.com/questions/3903488/javascript-backslash-in-variables-is-causing-an-error#answer-3903834
  return str
    .replaceAll(/\\/g, '\\\\')
    .replaceAll(/"/g, '\\"')
}

function generateSHA256(string = '', salt = '', saltRounds = 1) {
  let hash = string + salt

  for (let i = 0; i < saltRounds - 1; i++) {
    hash = crypto.createHash('sha256').update(hash).digest()
  }

  return crypto.createHash('sha256').update(hash).digest('hex')
}

function generateCryptoHex(length = 16) {
  const bytesLength = Math.ceil(length / 2)

  return crypto.randomBytes(bytesLength).toString('hex').slice(0, length)
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
