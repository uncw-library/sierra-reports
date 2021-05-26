const csvWriter = require('csv-writer').createObjectCsvWriter
const fs = require('fs').promises
const fsSync = require('fs')
const path = require('path')

const db = require('../dbs/sierra')

async function search (uploadedFile, originalFilename, queryType, next) {
  const sourceItems = await parseFile(uploadedFile, next) // extract sourceItems from uploaded file
  fs.unlink('./app/public/uploads/' + uploadedFile) // delete uploaded file
  let results = await runQuery(sourceItems, queryType, next)
  if (queryType === 'oclcToBib') {
    const missedOclcs = findMissedOclcs(sourceItems, results)
    results = appendMissedOclcs(results, missedOclcs)
  } else if (queryType === 'barcodeToOclcItem') {
    const missedBarcodes = findMissedBarcodes(sourceItems, results)
    results = appendMissedBarcodes(results, missedBarcodes)
  }
  const newFilepath = await writeCSV(results, originalFilename, next)
  return await newFilepath
}

async function parseFile (filename, next) {
  const filepath = './app/public/uploads/' + filename
  return await fs.readFile(filepath, 'utf-8')
    .then(contents => splitString(contents))
    .then(items => items.map(item => item.trim())) // trim all strings
    .then(trimmeds => trimmeds.filter(item => item.trim() !== '')) // remove empty strings
    .catch(next)
}

function splitString (text) {
  if (text.includes('\r\n')) {
    return text.split('\r\n')
  } else {
    return text.split('\n')
  }
}

async function runQuery (sourceItems, queryType, next) {
  const querystring = await makeQuerystring(sourceItems, queryType)
  return await db
    .query(querystring, sourceItems)
    .then(results => results.rows)
    .catch(next)
}

function makeQuerystring (sourceItems, queryType) {
  if (queryType === 'oclcToBib') {
    return makeOCLCQuerystring(sourceItems)
  } else if (queryType === 'barcodeToOclcItem') {
    return makeBarcodeQuerystring(sourceItems)
  }
}

function makeOCLCQuerystring (sourceItems) {
  // using parameterized queries to prevent sql injection
  // https://node-postgres.com/features/queries
  const params = sourceItems.map((item, idx) => '$' + (idx + 1))
  const queryString = `
    SELECT 'b'||varfield_view.record_num||'a' as bib,field_content as oclc
    FROM sierra_view.bib_view
    LEFT JOIN sierra_view.varfield_view
    ON sierra_view.varfield_view.record_id=sierra_view.bib_view.id
    LEFT JOIN sierra_view.record_metadata
    ON record_metadata.id=sierra_view.bib_view.id
    WHERE sierra_view.varfield_view.marc_tag='001'
    AND field_content IN (${params})
    `
  return queryString
}

function makeBarcodeQuerystring (sourceItems) {
  // using parameterized queries to prevent sql injection
  // https://node-postgres.com/features/queries
  const params = sourceItems.map((item, idx) => '$' + (idx + 1))
  const queryString = `
    SELECT 'b'||bib_view.record_num||'a' AS bib_record_number, 'i'||item_view.record_num||'a' as item_record_number, item_record_property.barcode AS barcode
    FROM sierra_view.item_record_property
    LEFT JOIN sierra_view.bib_record_item_record_link
    ON sierra_view.item_record_property.item_record_id=sierra_view.bib_record_item_record_link.item_record_id
    LEFT JOIN sierra_view.bib_view
    ON sierra_view.bib_record_item_record_link.bib_record_id=sierra_view.bib_view.id
    LEFT JOIN sierra_view.item_view
    ON sierra_view.item_record_property.item_record_id=sierra_view.item_view.id 
    WHERE item_record_property.barcode IN (${params})
    `
  return queryString
}

function findMissedOclcs (sourceItems, results) {
  // we want to inform the user of oclcs that did not match to a bib number
  // here we're identifying those missed oclcs
  const sourceSet = new Set(sourceItems)
  const resultSet = new Set(results.map(x => x.oclc))
  return difference(sourceSet, resultSet)
}

function appendMissedOclcs (results, missedOclcs) {
  // here we add the notfound oclcs to the results as {'bib': 'Not Found', 'oclc': uploaded oclc number}
  const resultsPlusMissed = results
  for (const missed of missedOclcs.values()) {
    resultsPlusMissed.push({ bib: 'Not Found', oclc: missed })
  }
  return resultsPlusMissed
}

function findMissedBarcodes (sourceItems, results) {
  // here we're identifying those missed barcodes
  const sourceSet = new Set(sourceItems)
  const resultSet = new Set(results.map(x => x.barcode))
  return difference(sourceSet, resultSet)
}

function appendMissedBarcodes (results, missedBarcodes) {
  // here we add the notfound barcodes to the results
  const resultsPlusMissed = results
  for (const missed of missedBarcodes.values()) {
    resultsPlusMissed.push({ bib_record_number: 'Not Found', item_record_number: 'Not Found', barcode: missed })
  }
  return resultsPlusMissed
}

function difference (setA, setB) {
  // here we find the difference between the uploaded oclcs and the found oclcs
  const difference = new Set(setA)
  for (const elem of setB) {
    difference.delete(elem)
  }
  return difference
}

async function writeCSV (results, originalFilename, next) {
  const outputFilename = `${path.basename(originalFilename, '.txt')}_output.csv`
  if (!fsSync.existsSync('./app/public/downloads')) {
    fsSync.mkdirSync('./app/public/downloads')
  }
  const outputPath = `./app/public/downloads/${outputFilename}`
  const header = makeHeader(results)
  const writer = csvWriter({
    path: outputPath,
    header: header
  })
  return await writer.writeRecords(results)
    .then(() => outputPath) // return the outputPath to the previous function
    .catch(next)
}

function makeHeader (results) {
  // grabs the keys of the first item in array "results"
  // and converts it into the expected header format.
  // accepts an arbitrary number of keys in the first item
  // because 'headers' can be length 2 or 3 or 20.
  const header = []
  Object.keys(results[0]).forEach(item => header.push({ id: item, title: item }))
  return header
}

module.exports.search = search
