'use strict'

const { Base64 }   = require('js-base64')
const bcrypt       = require('bcrypt')
const Buffer       = require('buffer').Buffer
const crypto       = require('crypto')
const { DateTime } = require('luxon')
const { execSync } = require('child_process')
const fs           = require('fs')
const { Octokit }  = require('@octokit/rest')
const path         = require('path')
const sharp        = require('sharp')

// When "\n" is used, GitHub will warn you of the following:
// We’ve detected the file has mixed line endings. When you commit changes we will normalize them to Windows-style (CRLF).
const newline = '\r\n'
const tmpFile = 'tmp.md'
const pushRetryMaximum = 20
const fixedSalt = bcrypt.genSaltSync(randomInt(10, 14))
const cache = new Map()

// Semicolons are sometimes necessary.
//   If you omit them, the following error will cause or an unexpected result will be received because the ASI fails.
//   TypeError: Cannot create property 'undefined' on string '' [^asi]

async function run() {
  let modes = process.env.MODE.split(',').map((element) => element.trim())
  let skipBody = process.env.SKIP_BODY.split(',').map((element) => element.trim())
  let with_repo_assets = process.env.WITH_REPO_ASSETS.split(',').map((element) => element.trim())
  let skipped = false

  let comments
  let withQuote
  let withHr
  let withTitle
  let issueBody
  let contentWithoutAttachedFiles
  let content
  let extractedIssueBody
  let extractedCommentBodies
  let partialDataJson
  let partialContent

  for (const mode of modes) {
    // It seems like some function invocations are redundant, but they are necessary.
    switch (mode) {
      case 'file':
        comments = await getComments()

        withQuote = (process.env.WITH_QUOTE.includes('file')) ? true : false; // asi
        withHr = (process.env.WITH_HR.includes('file')) ? true : false; // asi
        withTitle = (process.env.WITH_TITLE.includes('file')) ? true : false;

        [issueBody, extractedIssueBody] = (skipBody.includes('file')) ? ['', []] : buildIssueBody(withQuote); // asi
        if (with_repo_assets.includes('file')) {
          [contentWithoutAttachedFiles, extractedCommentBodies] = buildContent(comments, issueBody, withQuote, withHr);
          content = await replaceAttachedFiles(contentWithoutAttachedFiles)
        }
        else {
          [content, extractedCommentBodies] = buildContent(comments, issueBody, withQuote, withHr)
        }
        partialDataJson = extractedIssueBody.concat(extractedCommentBodies)
        partialContent = buildPartialContent(partialDataJson)

        if (getWhichModeToPostPartialContentIn(modes, skipBody) === 'file' && process.env.DRY_RUN !== 'true') {
          postPartialContent(partialContent, withTitle)
        }

        if (process.env.DRY_RUN !== 'true') {
          if (committable(issueBody, content)) {
            await commit(issueBody, content, withTitle)
          }
          else {
            skipped = true
          }
        }
        else {
          if (process.env.SKIP_INFO !== 'true') {
            console.info('===== issueBody (mode = file) ======')
            console.info(issueBody)
            console.info('====== content (mode = file) =======')
            console.info(content)
          }
        }

        break
      case 'issue':
        comments = await getComments()

        withQuote = (process.env.WITH_QUOTE.includes('issue')) ? true : false; // asi
        withHr = (process.env.WITH_HR.includes('issue')) ? true : false; // asi
        withTitle = (process.env.WITH_TITLE.includes('issue')) ? true : false;

        [issueBody, extractedIssueBody] = (skipBody.includes('issue')) ? ['', []] : buildIssueBody(withQuote); // asi
        if (with_repo_assets.includes('issue')) {
          [contentWithoutAttachedFiles, extractedCommentBodies] = buildContent(comments, issueBody, withQuote, withHr);
          content = await replaceAttachedFiles(contentWithoutAttachedFiles)
        }
        else {
          [content, extractedCommentBodies] = buildContent(comments, issueBody, withQuote, withHr)
        }
        partialDataJson = extractedIssueBody.concat(extractedCommentBodies)
        partialContent = buildPartialContent(partialDataJson)

        if (getWhichModeToPostPartialContentIn(modes, skipBody) === 'issue' && process.env.DRY_RUN !== 'true') {
          postPartialContent(partialContent, withTitle)
        }

        if (process.env.DRY_RUN !== 'true') {
          if (postable(issueBody, content)) {
            post(issueBody, content, withTitle)
          }
          else {
            skipped = true
          }
        }
        else {
          if (process.env.SKIP_INFO !== 'true') {
            console.info('===== issueBody (mode = issue) =====')
            console.info(issueBody)
            console.info('====== content (mode = issue) ======')
            console.info(content)
            console.info('====================================')
          }
        }

        break
      default:
        console.error(`unknown mode: ${process.env.MODE}`)
        process.exit(1)

        break
    }
  }

  if (process.env.FAIL_IF_SKIP === 'true' && skipped) {
    console.error('saving or leaving a comment was skipped')
    process.exit(1)
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
  if (!process.env.ISSUE_BODY) return ['', []]; // asi

  let issueBody = ''
  let extractedIssueBody = [];

  [issueBody, extractedIssueBody] = trimPartialContent(process.env.ISSUE_BODY)
  if (withQuote) issueBody = encompassWithQuote(issueBody)
  issueBody += newline
  if (process.env.WITH_DATE) issueBody += `${newline}> ${formattedDateTime(process.env.ISSUE_CREATED_AT)}${newline}`

  return [issueBody, extractedIssueBody]
}

function buildContent(comments, issueBody, withQuote, withHr) {
  const quote = withQuote ? '> ' : '';
  const hr = withHr ? `---${newline}${newline}` : ''
  let content = ''
  let sanitizedCommentBody = ''
  let extractedCommentBody = []
  let extractedCommentBodies = []
  let isFirstComment = true

  comments.forEach((comment) => {
    [sanitizedCommentBody, extractedCommentBody] = trimPartialContent(comment.body)
    extractedCommentBodies = extractedCommentBodies.concat(extractedCommentBody)

    if (!isFirstComment || issueBody) {
      content += `${newline}${quote}${hr}`
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

function trimPartialContent(commentBody) {
  if (process.env.PARTIAL_CONTENT_START_STRING === '' || process.env.PARTIAL_CONTENT_END_STRING === '') return [commentBody, []]

  const partialStringRegExp = new RegExp(
    '(' + process.env.PARTIAL_CONTENT_START_STRING + '.*?' + process.env.PARTIAL_CONTENT_END_STRING + ')', 'gs'
  )
  let extractedCommentBody = []

  const sanitizedCommentBody = commentBody.replace(partialStringRegExp, (_, match) => {
    let hash = `[^pvt_${generateSecureHash(match, fixedSalt)}]`
    extractedCommentBody.push({ hash: hash, body: match })
    return hash
  })

  return [sanitizedCommentBody, extractedCommentBody]
}

function buildPartialContent(partialDataJson) {
  if (!partialDataJson.length) return ''

  if (process.env.PARTIAL_CONTENT_START_STRING === '' || process.env.PARTIAL_CONTENT_END_STRING === '') {
    console.error('partial data json exists even though PARTIAL_CONTENT_START_STRING or PARTIAL_CONTENT_END_STRING does not exist')
    process.exit(1)
  }

  const partialStartStringRegExp = new RegExp('^' + process.env.PARTIAL_CONTENT_START_STRING, '')
  const partialEndStringRegExp = new RegExp(process.env.PARTIAL_CONTENT_END_STRING + '$', '')

  let partialContent = `| Reference | Content |${newline}| :---: | --- |`

  partialDataJson.forEach((json) => {
    partialContent +=
      `${newline}| \`${json.hash}\` | ${json.body
      .replace(partialStartStringRegExp, '')
      .replace(partialEndStringRegExp, '')
      .replace(/(\r\n|\r|\n)/g, '<br>')} |`
  })

  partialContent += newline

  partialDataJson.forEach((json) => {
    partialContent +=
      `${newline}${json.hash}: ${json.body
      .replace(partialStartStringRegExp, '')
      .replace(partialEndStringRegExp, '')
      .replace(/(\r\n|\r|\n)/g, '<br>')}`
  })

  return partialContent
}

// https://chatgpt.com/share/67a6fe0a-c510-8004-9ed8-7b106493bb4a
// https://chatgpt.com/share/67dc00c4-4b0c-8004-9e30-4cd77023249a
async function replaceAttachedFiles(contentWithoutAttachedFiles) {
  // a simple way to detect links like ![foo](https://example.com) and ignore `![foo](https://example.com)` at the same time
  // but not perfect because it doesn't ignore the case like `hello ![foo](https://example.com) world`
  const regex = /(?<!`)(?:!\[.*?\]\((https?:\/\/[^\s)]+)\)|<img.*?src="(https?:\/\/[^\s"]+)"(?!.*exclude).*>)(?!`)/g
  let matches
  const replacements = []

  while ((matches = regex.exec(contentWithoutAttachedFiles)) !== null) {
    const original = matches[0]
    const url = matches[1] || matches[2]

    // to avoid downloading the same URL
    if (!cache.has(url)) {
      cache.set(url, downloadAndUploadAttachedFile(url))
    }

    replacements.push({ original, url, newUrl: cache.get(url) })
  }

  const resolvedReplacements = await Promise.all(
    [...cache.entries()].map(async ([url, promise]) => [url, await promise])
  )

  for (const [url, newUrl] of resolvedReplacements) {
    cache.set(url, newUrl)
  }

  for (const { original, url } of replacements) {
    // TODO: replaceAll() replaces the string encompassed with quotes (inline block), which is not intended to be replaced
    contentWithoutAttachedFiles = contentWithoutAttachedFiles.replaceAll(url, cache.get(url))
  }

  return contentWithoutAttachedFiles
}

// https://chatgpt.com/share/67a6fe0a-c510-8004-9ed8-7b106493bb4a
async function detectFileType(buffer) {
  const { fileTypeFromBuffer } = await import('file-type')
  return fileTypeFromBuffer(buffer)
}

// https://chatgpt.com/share/67a6fe0a-c510-8004-9ed8-7b106493bb4a
async function downloadAndUploadAttachedFile(url) {
  if (!process.env.ASSETS_REPO) {
    console.error('The assets repository was not set.')
    process.exit(1)
  }

  if (!process.env.ASSETS_DIRECTORY) {
    console.error('The assets directory was not set.')
    process.exit(1)
  }

  const [ owner, repo ] = process.env.ASSETS_REPO.split('/')

  // do nothing if it's already the asset URL to avoid downloading and uploading exact the same file as a different filename
  // the situation is when the content in an issue is saved to another one and the content in another issue is saved to a file
  // if ('https://noraworld.github.io/github-actions-sandbox/2025/02/190c4a426d99f4b7082528073ede4c8d.png') {
  if (url.startsWith(`https://${owner}.github.io/${repo}`)) {
    if (process.env.DRY_RUN === 'true') {
      console.info(`downloading and uploading file ${url} skipped because it might have been uploaded already`)
    }

    return url
  }

  let headers = null
  const token = process.env.PERSONAL_ACCESS_TOKEN ?
                process.env[process.env.PERSONAL_ACCESS_TOKEN] :
                process.env.GITHUB_TOKEN

  // to avoid exposing the GitHub token to somewhere else
  if (url.startsWith('https://github.com')) {
    headers = {
      'Authorization': `Bearer ${token}`,
      'User-Agent': 'Node.js'
    }
  }
  else {
    headers = {
      'User-Agent': 'Node.js'
    }
  }

  // to measure how long it takes
  if (process.env.DRY_RUN === 'true') console.info(`downloading file ${url}`)
  const response = await fetch(url, { headers: headers })

  if (!response.ok) {
    throw new Error(`Failed to fetch attached file ${url}: ${response.statusText}`)
  }

  if (process.env.DRY_RUN === 'true') console.info(`file ${url} downloaded`)

  const buffer = await response.arrayBuffer()
  let fileType = await detectFileType(buffer)
  let extension = fileType ? fileType.ext : 'bin'
  let filename = `${generateFileHash(url)}.${extension}`
  let filepath = `${process.env.ASSETS_DIRECTORY}/${filename}`
  let assetsURL = `https://${owner}.github.io/${repo}/${filepath}`
  const file = await getFileFromRepo(process.env.ASSETS_REPO, filepath)

  if (file) {
    return assetsURL
  }

  const rotatedBuffer = await sharp(Buffer.from(buffer)).rotate().toBuffer()
  const compatibleFormatBuffer = await convertIntoCompatibleFormat(rotatedBuffer)
  const compressedBuffer = await compressFile(compatibleFormatBuffer, extension)

  // consider refactoring!
  fileType = await detectFileType(compressedBuffer)
  extension = fileType ? fileType.ext : 'bin'
  filename = `${generateFileHash(url)}.${extension}`
  filepath = `${process.env.ASSETS_DIRECTORY}/${filename}`
  assetsURL = `https://${owner}.github.io/${repo}/${filepath}`

  if (process.env.DRY_RUN !== 'true') {
    // sha is unnecessary (null is set) because the attached files are always published as a new file
    await push(process.env.ASSETS_REPO, compressedBuffer, `Add ${filepath}`, filepath, null)

    return assetsURL
  }
  else {
    const dir = path.dirname(filepath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    console.info(`writing file ${filepath}`)
    fs.writeFileSync(filepath, compressedBuffer)
    console.info(`file ${filepath} written`)

    return `./${filepath}`
  }
}

async function convertIntoCompatibleFormat(buffer) {
  if (process.env.WITH_COMPATIBLE_FORMAT !== 'true') return buffer

  const metadata = await sharp(buffer).metadata()
  const originalFormat = metadata.format
  let compatibleFormat = originalFormat

  switch (originalFormat) {
    case 'webp':
      compatibleFormat = 'jpeg'
      break
    default:
      break
  }

  if (originalFormat === compatibleFormat) return buffer

  return await sharp(buffer).toFormat(compatibleFormat).toBuffer()
}

// https://chatgpt.com/share/67a6fe0a-c510-8004-9ed8-7b106493bb4a
async function compressFile(buffer, extension) {
  if (process.env.WITH_ASSETS_COMPRESSION !== "true") {
    return buffer
  }

  let compressedBuffer

  switch (extension) {
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'webp':
      compressedBuffer = await compressImage(buffer)
      break
    default:
      // TODO: support other file types in the future
      break
  }

  return compressedBuffer
}

// https://chatgpt.com/share/67a6fe0a-c510-8004-9ed8-7b106493bb4a
async function compressImage(buffer) {
  if (!process.env.COMPRESSION_THRESHOLD) {
    console.error('COMPRESSION_THRESHOLD is required if you want to compress the image files.')
    process.exit(1)
  }

  if (process.env.RESIZE_WIDTH && process.env.RESIZE_HEIGHT) {
    buffer = await sharp(buffer).resize({
      width: Number(process.env.RESIZE_WIDTH),
      height: Number(process.env.RESIZE_HEIGHT),
      fit: 'inside',
      withoutEnlargement: true
    }).toBuffer()
  }
  else if (process.env.RESIZE_WIDTH) {
    buffer = await sharp(buffer).resize({
      width: Number(process.env.RESIZE_WIDTH),
      fit: 'inside',
      withoutEnlargement: true
    }).toBuffer()
  }
  else if (process.env.RESIZE_HEIGHT) {
    buffer = await sharp(buffer).resize({
      height: Number(process.env.RESIZE_HEIGHT),
      fit: 'inside',
      withoutEnlargement: true
    }).toBuffer()
  }

  const metadata = await sharp(buffer).metadata()
  const format = metadata.format
  const step = 5

  let compressedBuffer = buffer
  let quality = 95
  let compressionLevel = 0

  if (process.env.DRY_RUN === 'true') {
    console.info(`${format} image information before compressing (size: ${compressedBuffer.length} bytes, quality: ${quality}, compressionLevel: ${compressionLevel}`)
  }

  switch (format) {
    case 'jpeg':
    case 'webp':
      while (compressedBuffer.length > process.env.COMPRESSION_THRESHOLD && quality >= 10) {
        let options = {}
        options.quality = quality
        compressedBuffer = await sharp(buffer).toFormat(format, options).toBuffer()

        if (process.env.DRY_RUN === 'true') {
          console.info(`compressing ${format} image... (size: ${compressedBuffer.length} bytes, quality: ${quality}, compressionLevel: ${compressionLevel}`)
        }

        quality -= step
      }
      break
    case 'png':
      while (compressedBuffer.length > process.env.COMPRESSION_THRESHOLD && compressionLevel <= 9) {
        let options = {}
        options.compressionLevel = compressionLevel
        compressedBuffer = await sharp(buffer).toFormat(format, options).toBuffer()

        if (process.env.DRY_RUN === 'true') {
          console.info(`compressing ${format} image... (size: ${compressedBuffer.length} bytes, quality: ${quality}, compressionLevel: ${compressionLevel}`)
        }

        compressionLevel++
      }
      break
    default:
      break
  }

  if (process.env.DRY_RUN === 'true') {
    console.info(`compressing ${format} image done (size: ${compressedBuffer.length} bytes, quality: ${quality}, compressionLevel: ${compressionLevel}`)
  }

  return compressedBuffer
}

async function commit(issueBody, content, withTitle) {
  // Node.js Stream doesn't work if a filename contains back quotes, even if they are sanitized correctly.
  // Even if it were to work properly, back quotes shouldn't be used for a filename.
  const filepath = buildFilepath()
  const targetFileRepo = process.env.TARGET_FILE_REPO ? process.env.TARGET_FILE_REPO : process.env.GITHUB_REPOSITORY

  let existingContent = ''
  let sha = null
  let commitMessage = ''
  let file = await getFileFromRepo(targetFileRepo, filepath)
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
  if (withTitle) {
    const titlePrefixForFile = process.env.TITLE_PREFIX_FOR_FILE ? `${process.env.TITLE_PREFIX_FOR_FILE} ` : ''
    title = `# ${titlePrefixForFile}[${buildFileTitle()}](${process.env.ISSUE_URL})${newline}`
  }

  const renderedContent = normalizeNewlines(`${header}${existingContent}${title}${issueBody}${content}`)

  const commitResult = await push(targetFileRepo, renderedContent, commitMessage, filepath, sha)

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

function post(issueBody, content, withTitle) {
  let targetIssueRepo = process.env.TARGET_ISSUE_REPO ? process.env.TARGET_ISSUE_REPO : process.env.GITHUB_REPOSITORY

  let targetIssueNumber = ''
  if (process.env.TARGET_ISSUE_NUMBER && process.env.TARGET_ISSUE_NUMBER !== 'latest') {
    targetIssueNumber = process.env.TARGET_ISSUE_NUMBER
  }
  else {
    targetIssueNumber = execSync(`gh issue list --repo "${targetIssueRepo}" --limit 1 | awk '{ print $1 }'`).toString().trim()
  }

  let title = ''
  if (withTitle) {
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
function postPartialContent(partialContent, withTitle) {
  if (!partialContent) return false

  let targetIssueRepo = process.env.PARTIAL_CONTENT_TARGET_ISSUE_REPO
  if (!targetIssueRepo) {
    // This is a safe condition.
    // Publishing the partial content somewhere implicitly without the user's recognition is so dangerous!
    console.error('target issue repo is empty')
    process.exit(1)
  }

  let targetIssueNumber = ''
  if (process.env.PARTIAL_CONTENT_TARGET_ISSUE_NUMBER && process.env.PARTIAL_CONTENT_TARGET_ISSUE_NUMBER !== 'latest') {
    targetIssueNumber = process.env.PARTIAL_CONTENT_TARGET_ISSUE_NUMBER
  }
  else {
    targetIssueNumber = execSync(`gh issue list --repo "${targetIssueRepo}" --limit 1 | awk '{ print $1 }'`).toString().trim()
  }

  let title = ''
  if (withTitle) {
    const titlePrefixForIssue = process.env.TITLE_PREFIX_FOR_ISSUE ? `${process.env.TITLE_PREFIX_FOR_ISSUE} ` : ''
    title = `## ${titlePrefixForIssue}[${buildFileTitle()}](${process.env.ISSUE_URL})${newline}`
  }

  fs.writeFileSync(tmpFile, `${title}${partialContent}`)
  execSync(`gh issue comment --repo "${targetIssueRepo}" "${targetIssueNumber}" --body-file "${tmpFile}"`)
  fs.unlinkSync(tmpFile)
}

async function getFileFromRepo(repoWithUsername, path) {
  const octokit = process.env.PERSONAL_ACCESS_TOKEN ?
                  new Octokit({ auth: process.env[process.env.PERSONAL_ACCESS_TOKEN] }) :
                  new Octokit({ auth: process.env.GITHUB_TOKEN })
  const [ owner, repo ] = repoWithUsername.split('/')

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
async function push(repoWithUsername, content, commitMessage, filepath, sha) {
  if (!process.env.COMMITTER_NAME) {
    console.error('The committer name was not supplied.')
    process.exit(1)
  }

  if (!process.env.COMMITTER_EMAIL) {
    console.error('The committer email was not supplied.')
    process.exit(1)
  }

  if (await repoArchived(repoWithUsername)) {
    console.error(`${repoWithUsername} is archived.`)
    process.exit(1)
  }

  const octokit = process.env.PERSONAL_ACCESS_TOKEN ?
                  new Octokit({ auth: process.env[process.env.PERSONAL_ACCESS_TOKEN] }) :
                  new Octokit({ auth: process.env.GITHUB_TOKEN })
  const [ owner, repo ] = repoWithUsername.split('/')

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
        process.exit(1)
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
function getWhichModeToPostPartialContentIn(modes, skipBody) {
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

async function repoArchived(repoWithUsername) {
  const octokit = process.env.PERSONAL_ACCESS_TOKEN ?
                  new Octokit({ auth: process.env[process.env.PERSONAL_ACCESS_TOKEN] }) :
                  new Octokit({ auth: process.env.GITHUB_TOKEN })
  const [ owner, repo ] = repoWithUsername.split('/')

  try {
    const { data } = await octokit.repos.get({ owner, repo })
    return data.archived
  }
  catch (error) {
    console.error(`failed to get repository info: ${error.message}`)
    process.exit(1)
  }
}

function committable(issueBody, content) {
  if (process.env.SKIP_IF_EMPTY_INCLUDING_BODY !== '' && process.env.SKIP_IF_EMPTY_NOT_INCLUDING_BODY !== '') {
    console.error('specifying both SKIP_IF_EMPTY_INCLUDING_BODY and SKIP_IF_EMPTY_NOT_INCLUDING_BODY is prohibited.')
    process.exit(1)
  }

  if (
    process.env.SKIP_IF_EMPTY_INCLUDING_BODY.split(',').map((element) => element.trim()).includes('file') &&
    issueBody === ''                                                                                      &&
    content   === ''
  ) {
    return false
  }
  else if (
    process.env.SKIP_IF_EMPTY_NOT_INCLUDING_BODY.split(',').map((element) => element.trim()).includes('file') &&
    content === ''
  ) {
    return false
  }
  else {
    return true
  }
}

function postable(issueBody, content) {
  if (process.env.SKIP_IF_EMPTY_INCLUDING_BODY !== '' && process.env.SKIP_IF_EMPTY_NOT_INCLUDING_BODY !== '') {
    console.error('specifying both SKIP_IF_EMPTY_INCLUDING_BODY and SKIP_IF_EMPTY_NOT_INCLUDING_BODY is prohibited.')
    process.exit(1)
  }

  if (
    process.env.SKIP_IF_EMPTY_INCLUDING_BODY.split(',').map((element) => element.trim()).includes('issue') &&
    issueBody === ''                                                                                       &&
    content   === ''
  ) {
    return false
  }
  else if (
    process.env.SKIP_IF_EMPTY_NOT_INCLUDING_BODY.split(',').map((element) => element.trim()).includes('issue') &&
    content === ''
  ) {
    return false
  }
  else {
    return true
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

function normalizeNewlines(str) {
  return str.replaceAll(/(\r\n|\r|\n)/g, newline)
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

// it takes some time to process, so it's good to avoid using this except for the security purpose
function generateSecureHash(string, salt) {
  if (typeof salt === 'number') {
    console.error('salt round must not be used here because the result changes every time it is performed, even if the same value is passed')
    process.exit(1)
  }

  const hashWithSalt = bcrypt.hashSync(string, salt)
  const hash = hashWithSalt.split('$')[3].slice(22)
  return Buffer.from(hash, 'base64').toString('hex').slice(0, 7)
}

// https://chatgpt.com/share/67a6fe0a-c510-8004-9ed8-7b106493bb4a
function generateFileHash(url) {
  return crypto.createHash('sha256').update(url, 'utf8').digest('hex').slice(0, 32)
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
