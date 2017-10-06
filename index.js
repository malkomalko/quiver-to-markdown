#!/usr/bin/env node

const {dirname} = require('path')
const {exec} = require('child_process')
const {inspect, promisify} = require('util')
const {writeFile} = require('fs')

const _ = require('lodash')
const glob = require('glob')
const jsonfile = require('jsonfile')
const moment = require('moment')
const sanitize = require('sanitize-filename')
const {JSDOM} = require('jsdom')
const {map} = require('async')

const unmarked = require('./unmarked')

const exec$ = promisify(exec)
const glob$ = promisify(glob)
const map$ = promisify(map)
const readFile$ = promisify(jsonfile.readFile)
const writeFile$ = promisify(writeFile)

const root = process.env.WATCHMAN_ROOT || process.argv[2]
if (root == null) {
  console.log('USAGE: node index.js ~/path/to/Quiver.qvlibrary ~/output/folder')
  return;
}
let out = process.argv[3] || `${process.env.HOME}/Documents`
out += '/quiver-to-markdown'

async function cleanupOutputFolder() {
  await exec$(`rm -rf ${out}`)
}

async function createJekyllCategories(parsedNotes) {
  const fileName = `${out}/categories.yml`
  const categories = _.uniq(_.compact(_.map(parsedNotes, 'folderName'))).sort()
  const names = _.map(categories, (category) => {
    return `  - ${category}`
  }).join('\n')
  const contents = `enabled: true
names:
${names}
`
  await writeFile$(fileName, contents)
}

async function createMarkdownNote(parsedNote) {
  const noteFileName = fileName(parsedNote)
  let contents = [
    noteFrontmatter(parsedNote),
    await noteContent(parsedNote)
  ].join('\n')
  await writeFile$(noteFileName, contents)
}

async function createMarkdownNotes(parsedNotes) {
  const notes = noteMappings(parsedNotes)
  await map$(notes, await createMarkdownNote)
}

async function createNotebookFolder(parsedNote) {
  const folder = parsedNote.name.replace(/\//g, '-')
  parsedNote.dirname = dirname(parsedNote.path)
  parsedNote.folderName = folder
  await exec$(`mkdir -p "${out}/${folder}"`)
}

async function createNotebookFolders(parsedNotes) {
  const notes = _.filter(parsedNotes, (parsedNote) => {
    return parsedNote.path.match(/\.qvnotebook\/[^/]*.json$/)
  })
  await map$(notes, await createNotebookFolder)
}

function fileName(parsedNote) {
  const folder = parsedNote.folderName
  const name = sanitize(parsedNote.title)
  return `${out}/${folder}/${name}.md`
}

async function findNotes() {
  const globPattern = `${root}/**/*.json`
  return await glob$(globPattern)
}

function folderMappings(parsedNotes) {
  let folders = _.filter(parsedNotes, (parsedNote) => {
    return parsedNote.folderName != null
  })

  return  _.reduce(folders, (memo, parsedNote) => {
    memo[parsedNote.dirname] = parsedNote.folderName
    return memo
  }, {})
}

function metaMappings(parsedNotes) {
  let meta = _.filter(parsedNotes, (parsedNote) => {
    return parsedNote.path.match(/\.qvnote\/meta.json$/)
  })

  return  _.reduce(meta, (memo, parsedNote) => {
    const key = dirname(parsedNote.path)
    memo[key] = parsedNote
    return memo
  }, {})
}

async function noteCell(cell) {
  const typeFns = {
    'code': noteCellCode,
    'markdown': noteCellMarkdown,
    'text': noteCellText,
  }

  const fn = typeFns[cell.type]
  return fn ? await fn(cell) : null
}

async function noteCellCode(cell) {
  return `\`\`\`${cell.language}
${cell.data}
\`\`\``
}

async function noteCellMarkdown(cell) {
  return cell.data
}

async function noteCellText(cell) {
  const dom = new JSDOM(cell.data)

  return unmarked(dom.window.document.documentElement, {
    gfm: true
  })
}

async function noteContent(parsedNote) {
  return _.compact(await map$(parsedNote.cells, await noteCell)).join('\n\n')
}

function noteFrontmatter(parsedNote) {
  const updated = moment.unix(parsedNote.meta.updated_at).format('YYYY-MM-DD')
  let frontmatter = `---
title: ${parsedNote.title}
category: ${parsedNote.folderName}
layout: 2017/sheet
tags: [${parsedNote.meta.tags}]
updated: ${updated}
---
`
  return frontmatter
}

function noteMappings(parsedNotes) {
  const folders = folderMappings(parsedNotes)
  const meta = metaMappings(parsedNotes)

  let notes = _.filter(parsedNotes, (parsedNote) => {
    return parsedNote.path.match(/\.qvnote\/content.json$/)
  })

  return _.map(notes, (parsedNote) => {
    const splitPath = parsedNote.path.split(/(.qvnotebook)/)
    const folder = _.initial(splitPath).join('')
    const folderForNote = folders[folder]
    const metaForNote = meta[dirname(parsedNote.path)]
    if (folderForNote) {
      parsedNote.folderName = folderForNote
    }
    if (metaForNote) {
      parsedNote.meta = metaForNote
    }
    return parsedNote
  })
}

function promisifyFunction(fn, context) {
  const customPromisifyFunction = promisify && promisify.custom
  if (customPromisifyFunction && fn.hasOwnProperty(customPromisifyFunction)) {
    return fn[customPromisifyFunction]
  }
  return (...args) => new Promise((resolve, reject) => {
    fn.call(context, ...args, (err, ...result) => {
      if (err) {
        reject(err)
      } else if (result.length > 1) {
        resolve(result)
      } else {
        resolve(result[0])
      }
    })
  })
}

async function readNote(notePath) {
  let note = await readFile$(notePath)
  note.path = notePath
  return note
}

async function readNotes(notes) {
  return await map$(notes, await readNote)
}

async function init() {
  console.log(moment().format('YYYY-MM-DD hh:mm:A: '), 'Quiver - running job')
  const notes = await findNotes()
  const parsedNotes = await readNotes(notes)
  await cleanupOutputFolder()
  await createNotebookFolders(parsedNotes)
  await createMarkdownNotes(parsedNotes)
  await createJekyllCategories(parsedNotes)
}

init()
