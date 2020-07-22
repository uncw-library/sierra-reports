const express = require('express')
const router = express.Router()
const moment = require('moment')
const Config = require('../config')
const Async = require('async')
const _ = require('lodash')
const passport = require('passport')
const sites = require('../sites')
const fs = require('fs')
const Chalk = require('chalk')

const sierra = require('../dbs/sierra')

router.get('/', function (req, res, next) {
  res.redirect('/login')
})

router.get('/login', function (req, res, next) {
  res.render('login', {
    layout: 'layout',
    title: '--- Login ---',
    failure: (req.query.failure) // Failed login attempt
  })
})

router.post('/login', function (req, res, next) {
  passport.authenticate('ldapauth', function (err, user, info) {
    if (err || !user) res.redirect('/login?failure=true&' + ((req.query.path) ? 'path=' + req.query.path : ''))
    else {
      req.logIn(user, async function (err) {
        if (err) console.log(Chalk.red(err))
        res.redirect('/' + ((req.query.path) ? req.query.path : 'dashboard'))
      })
    }
  })(req, res, next)
})

router.get('/logout', function (req, res) {
  req.logout()
  res.redirect('/login')
})

router.get('/dashboard', Config.ensureAuthenticated, function (req, res, next) {
  res.render('dashboard', {
    layout: 'layout',
    user: req.user.cn,
    title: 'Sierra Reports',
    sites: sites
  })
})

router.get('/duplicate-patrons', Config.ensureAuthenticated, function (req, res, next) {
  const queryString1 = `
    SELECT  e.field_content
    FROM sierra_view.patron_record p
    JOIN sierra_view.patron_view v ON p.id = v.id
    JOIN sierra_view.patron_record_fullname n ON p.id = n.patron_record_id
    LEFT JOIN sierra_view.varfield e ON e.record_id = p.id AND e.varfield_type_code = 'z'
    WHERE LOWER(e.field_content) IS not NULL
    GROUP BY e.field_content
    HAVING ( COUNT(e.field_content) >1)
  `
  sierra.query(queryString1, function (err, result) {
    const allResults = []
    Async.each(result.rows, function (row, callback) {
      const queryString2 = `
        SELECT 'p' || v.record_num ||'a' AS patron_record,
        n.first_name, n.last_name, LOWER(e.field_content),
        extract (year from v.expiration_date_gmt)||'-'||lpad (cast((EXTRACT(MONTH from v.expiration_date_gmt)) as varchar), 2, '0')
        ||'-'||lpad (cast((EXTRACT(DAY from v.expiration_date_gmt)) as varchar), 2, '0') AS expiration_date,
        p.ptype_code
        FROM sierra_view.patron_record p
        JOIN sierra_view.patron_view v ON p.id = v.id
        JOIN sierra_view.patron_record_fullname n ON p.id = n.patron_record_id
        LEFT JOIN sierra_view.varfield e ON e.record_id = p.id AND e.varfield_type_code = 'z'
        WHERE e.field_content = '${row.field_content}'
      `
      sierra.query(queryString2, function (err, result) {
        for (let i = 0; i < result.rows.length; ++i) {
          allResults.push(result.rows[i])
        }
        callback()
      })
    }, function (err) {
      console.log(err)
      res.render('duplicate-patrons', {
        layout: 'layout',
        title: 'Duplicate patrons',
        result: allResults
      })
    })
  })
})

router.get('/price-list', Config.ensureAuthenticated, function (req, res, next) {
  const startDate = (req.query.startDate) ? moment(req.query.startDate).format('YYYYMMDD') : moment().subtract(7, 'days').format('YYYYMMDD')
  const endDate = (req.query.endDate) ? moment(req.query.endDate).format('YYYYMMDD') : moment().subtract(1, 'days').format('YYYYMMDD')
  const queryString = `
    SELECT
       item_view.id AS id,
       bib_record_property.best_title AS best_title,
       item_view.barcode AS barcode,
       item_view.copy_num AS copy_num,
       replace( item_record_property.call_number, '|a', '' ) callnumber,
       last_name || ',' || first_name AS current_patron,
       item_view.location_code AS location_code,
       item_status_code,
       location_name.name AS location_name,
       varfield_view.field_content AS item_volume 
    FROM
       sierra_view.item_view 
       LEFT JOIN
          sierra_view.bib_record_item_record_link 
          ON sierra_view.item_view.id = sierra_view.bib_record_item_record_link.item_record_id 
       LEFT JOIN
          sierra_view.bib_record_property 
          ON sierra_view.bib_record_item_record_link.bib_record_id = sierra_view.bib_record_property.bib_record_id 
       LEFT JOIN
          sierra_view.item_record_property 
          ON sierra_view.item_view.id = sierra_view.item_record_property.item_record_id 
       LEFT JOIN
          sierra_view.checkout 
          ON sierra_view.item_view.id = sierra_view.checkout.item_record_id 
       LEFT JOIN
          sierra_view.patron_record_fullname 
          ON sierra_view.checkout.patron_record_id = sierra_view.patron_record_fullname.patron_record_id 
       LEFT JOIN
          sierra_view.location 
          ON sierra_view.item_view.location_code = sierra_view.location.code 
       LEFT JOIN
          sierra_view.location_name 
          ON sierra_view.location.id = sierra_view.location_name.location_id 
       LEFT JOIN
          sierra_view.varfield_view 
          ON sierra_view.varfield_view.record_id = sierra_view.item_view.id 
          AND varfield_view.varfield_type_code LIKE 'v%' 
    WHERE
       item_view.price = 0 
       AND to_char(due_gmt, 'yyyymmdd') >= '${startDate}' 
       AND to_char(due_gmt, 'yyyymmdd') <= '${endDate}'
  `
  sierra.query(queryString, function (err, result) {
    res.render('price-list', {
      layout: 'layout',
      title: 'Price List',
      result: result.rows,
      startDate: String(moment(startDate, 'YYYYMMDD').format('MM/DD/YYYY')),
      endDate: String(moment(endDate, 'YYYYMMDD').format('MM/DD/YYYY'))
    })
  })
})

router.get('/fund-report', Config.ensureAuthenticated, function (req, res, next) {
  const currentFiscalStartYear = ((new Date()).getMonth() < 6) ? String(Number((new Date()).getFullYear()) - 1) : String(Number((new Date()).getFullYear()))
  const currentFiscalEndYear = ((new Date()).getMonth() < 6) ? String(Number((new Date()).getFullYear())) : String(Number((new Date()).getFullYear()) + 1)
  const queryString1 = `
    SELECT *,
    fund_master_id,
    name,
    To_char(( appropriation :: DECIMAL ) / 100 :: float8, '999999.99') AS appropriation,
    To_char(( expenditure :: DECIMAL ) / 100 :: float8, '999999.99') AS expenditure,
    To_char(( encumbrance :: DECIMAL ) / 100 :: float8, '999999.99') AS encumbrance,
    To_char(( ( appropriation :: DECIMAL ) / 100 :: float8 - ( encumbrance :: DECIMAL ) / 100 :: float8 - ( expenditure :: DECIMAL ) / 100 :: float8 ), '999999.99') AS free_balance,
    To_char(( ( appropriation :: DECIMAL ) / 100 :: float8 - ( expenditure :: DECIMAL ) / 100 :: float8 ), '999999.99') AS cash_balance
    FROM sierra_view.fund_myuser
    WHERE fund_type = 'fbal'
    AND acct_unit = '3'
    AND ( note1 = 'Departmental Funds' OR note1 = 'Fund Report' ) 
  `
  sierra.query(queryString1, function (err, result) {
    if (err) console.log(err)

    // For each department we need to run detailed query and sum the price amount of the results
    Async.eachOf(result.rows, function (department, index, callback) {
      const queryStartDate = (req.query.year) ? String(Number(req.query.year) - 1) + '-07-01' : currentFiscalStartYear + '-07-01'
      const queryEndDate = (req.query.year) ? String(Number(req.query.year)) + '-06-30' : currentFiscalEndYear + '-06-30'
      const queryString2 = `
        SELECT
        sum(round(order_record_paid.paid_amount, 2)) AS paid_amt
        From sierra_view.order_record_cmf
        LEFT JOIN sierra_view.fund_master
        ON sierra_view.fund_master.code_num::text=ltrim(sierra_view.order_record_cmf.fund_code, '0')
        Left Join sierra_view.order_view
        ON sierra_view.order_view.record_id=sierra_view.order_record_cmf.order_record_id
        Left Join sierra_view.order_status_property_myuser
        ON sierra_view.order_status_property_myuser.code=sierra_view.order_view.order_status_code
        LEFT JOIN sierra_view.user_defined_ocode3_myuser
        ON sierra_view.user_defined_ocode3_myuser.code=sierra_view.order_view.ocode3
        LEFT JOIN sierra_view.bib_record_order_record_link
        ON sierra_view.bib_record_order_record_link.order_record_id=sierra_view.order_view.record_id
        LEFT JOIN sierra_view.bib_record_property
        ON sierra_view.bib_record_property.bib_record_id=sierra_view.bib_record_order_record_link.bib_record_id
        LEFT JOIN sierra_view.material_property_myuser
        ON sierra_view.material_property_myuser.code=sierra_view.bib_record_property.material_code
        LEFT JOIN sierra_view.order_record_paid
        ON sierra_view.order_record_paid.order_record_id=sierra_view.order_view.record_id
        where accounting_unit_id='4'
        and fund_master.id='${department.fund_master_id}'
        and order_status_code !='z'
        and order_view.record_creation_date_gmt >= '${queryStartDate}'
        and order_view.record_creation_date_gmt <= '${queryEndDate}'
      `
      sierra.query(queryString2, function (err, result2) {
        if (err) console.log(err)
        if (result2) {
          result.rows[index].total_amt = (result2.rows[0].paid_amt) ? (result2.rows[0].paid_amt) : 0
        }

        callback()
      })
    }, function (err, paid_amt_sum) {
      if (err) console.log(err)
      console.log('CALLBACK')
      // Create an array of years, 2012 to present
      const years = []
      const startYear = 2012
      let iterYear = startYear
      Async.whilst(function () { return iterYear <= Number(currentFiscalEndYear) }, function (callback) {
        years.push(iterYear)
        iterYear++
        callback(null)
      }, function (err) {
        const selectedYear = (req.query.year) ? (req.query.year) : Number(currentFiscalEndYear)
        res.render('fund-report', {
          layout: 'layout',
          title: 'Departmental Funds',
          result: result.rows,
          years: years,
          selectedYear: selectedYear,
          showAddFields: (selectedYear === Number(currentFiscalEndYear))
        })
      })
    })
  })
})

router.get('/fund-report/detail/:id', Config.ensureAuthenticated, function (req, res, next) {
  const currentFiscalStartYear = ((new Date()).getMonth() < 6) ? String(Number((new Date()).getFullYear()) - 1) : String(Number((new Date()).getFullYear()))
  const currentFiscalEndYear = ((new Date()).getMonth() < 6) ? String(Number((new Date()).getFullYear())) : String(Number((new Date()).getFullYear()) + 1)

  const queryStartDate = (req.query.year) ? String(Number(req.query.year) - 1) + '-07-01' : currentFiscalStartYear + '-07-01'
  const queryEndDate = (req.query.year) ? String(Number(req.query.year)) + '-06-30' : currentFiscalEndYear + '-06-30'
  const queryString1 = `
    SELECT
    best_title AS title,
    fund_master.id,
    sierra_view.material_property_myuser.name AS material_type,
    order_view.record_num AS record_number,
    'o'||order_view.record_num||'a' AS order_record,
    user_defined_ocode3_myuser.name AS request_source,
    round(order_record_paid.paid_amount, 2) AS paid_amt,
    round(estimated_price, 2) AS Encumbrance,
    sierra_view.order_status_property_myuser.name AS order_status,
    to_char(order_view.record_creation_date_gmt, 'MM/DD/YYYY') AS order_creation_date
    From sierra_view.order_record_cmf
    LEFT JOIN sierra_view.fund_master
    ON sierra_view.fund_master.code_num::text=ltrim(sierra_view.order_record_cmf.fund_code, '0')
    Left Join sierra_view.order_view
    ON sierra_view.order_view.record_id=sierra_view.order_record_cmf.order_record_id
    Left Join sierra_view.order_status_property_myuser
    ON sierra_view.order_status_property_myuser.code=sierra_view.order_view.order_status_code
    LEFT JOIN sierra_view.user_defined_ocode3_myuser
    ON sierra_view.user_defined_ocode3_myuser.code=sierra_view.order_view.ocode3
    LEFT JOIN sierra_view.bib_record_order_record_link
    ON sierra_view.bib_record_order_record_link.order_record_id=sierra_view.order_view.record_id
    LEFT JOIN sierra_view.bib_record_property
    ON sierra_view.bib_record_property.bib_record_id=sierra_view.bib_record_order_record_link.bib_record_id
    LEFT JOIN sierra_view.material_property_myuser
    ON sierra_view.material_property_myuser.code=sierra_view.bib_record_property.material_code
    LEFT JOIN sierra_view.order_record_paid
    ON sierra_view.order_record_paid.order_record_id=sierra_view.order_view.record_id
    where accounting_unit_id='4'
    and fund_master.id='${req.params.id}'
    and order_status_code !='z'
    and order_view.record_creation_date_gmt >= '${queryStartDate}'
    and order_view.record_creation_date_gmt <= '${queryEndDate}'
  `
  sierra.query(queryString1, function (err, result) {
    if (err) console.log(err)

    if (result) {
      Async.eachOf(result.rows, function (row, index, callback) {
        const queryString2 = `
          Select field_content
          FROM sierra_view.varfield_view
          LEFT JOIN  sierra_view.order_view
          ON sierra_view.varfield_view.record_num=sierra_view.order_view.record_num
          where varfield_view.varfield_type_code = 'r'
          and order_view.record_num = ${row.record_number}
        `
        sierra.query(queryString2, function (err, result2) {
          if (result2.rows && result2.rows[0]) result.rows[index].selector = result2.rows[0].field_content // ??? does this assignment happen, when there's no curly quotes around it ???
          const queryString3 = `
            Select field_content
            FROM sierra_view.varfield_view
            LEFT JOIN  sierra_view.order_view
            ON sierra_view.varfield_view.record_num=sierra_view.order_view.record_num
            where varfield_view.varfield_type_code = 's'
            and order_view.record_num = ${row.record_number}
          `
          sierra.query(queryString3, function (err, result3) {
            if (err) console.log(err)
            if (result3.rows && result3.rows[0]) result.rows[index].requestor = result3.rows[0].field_content
            callback()
          })
        })
      }, function (err) {
      // Create an array of years, 2012 to present
        const years = []
        const startYear = 2012
        let iterYear = startYear
        Async.whilst(function () { return iterYear <= Number(currentFiscalEndYear) }, function (callback) {
          years.push(iterYear)
          iterYear++
          callback(null)
        }, function (err) {
          const selectedYear = (req.query.year) ? (req.query.year) : Number(currentFiscalEndYear)
          const resultRowsCopy = result.rows
          let totalPaidAmt = 0
          _.forEach(resultRowsCopy, function (value) {
            if (value.paid_amt === null) value.paid_amt = 0

            totalPaidAmt += parseFloat(value.paid_amt)
          })

          let appropriation = 0
          let encumbrance = 0
          let free_balance = 0
          let cash_balance = 0
          let addFields = {}

          const queryString4 = `
            SELECT
            fund_myuser.fund_master_id,
            name,
            to_char((appropriation::decimal)/100::float8, '999999.99') as appropriation,
            to_char((expenditure::decimal)/100::float8, '999999.99') as expenditure,
            to_char((encumbrance::decimal)/100::float8, '999999.99') as encumbrance,
            to_char(((appropriation::decimal)/100::float8 -(encumbrance::decimal)/100::float8 -(expenditure::decimal)/100::float8), '999999.99') AS free_balance,
            to_char(((appropriation::decimal)/100::float8 -(expenditure::decimal)/100::float8), '999999.99') as cash_balance
            FROM sierra_view.fund_myuser
            WHERE fund_type='fbal'
            and acct_unit='3'
            AND note1='Departmental Funds'
            AND fund_master_id='${req.params.id}'
            OR note1='Fund Report'
          `
          sierra.query(queryString4, function (err, result4) {
            if (err) console.log(err)
            if (result4.rows && result4.rows[0]) {
              appropriation = result4.rows[0].appropriation
              encumbrance = result4.rows[0].encumbrance
              free_balance = result4.rows[0].free_balance
              cash_balance = result4.rows[0].cash_balance

              addFields = {
                appropriation: appropriation,
                encumbrance: encumbrance,
                free_balance: free_balance,
                cash_balance: cash_balance
              }

              res.render('fund-report-detail', {
                layout: 'layout',
                title: 'Departmental Funds',
                result: result.rows,
                years: years,
                selectedYear: selectedYear,
                selectedDepartment: req.query.department,
                totalPaidAmt: Math.round(totalPaidAmt * 100) / 100,
                addFields: (selectedYear === Number(currentFiscalEndYear)) ? addFields : null
              })
            }
          })
        })
      })
    } else res.send('There was an error processing the request.')
  })
})

router.get('/summon-deletes', Config.ensureAuthenticated, function (req, res, next) {
  const startDate = (req.query.startDate) ? moment(req.query.startDate).format('YYYYMMDD') : moment().subtract(10, 'days').format('YYYYMMDD')
  const endDate = (req.query.endDate) ? moment(req.query.endDate).format('YYYYMMDD') : moment().format('YYYYMMDD')
  const queryString = `
    SELECT COUNT ( deletion_date_gmt ), deletion_date_gmt
    FROM sierra_view.record_metadata
    where record_type_code='b'
    and deletion_date_gmt >= '${startDate}'
    and deletion_date_gmt < '${endDate}'
    GROUP BY deletion_date_gmt
    ORDER BY deletion_date_gmt
  `

  sierra.query(queryString, function (err, result) {
    res.render('summon-deletes', {
      layout: 'layout',
      title: 'Summon Deletes',
      result: result.rows,
      startDate: String(moment(startDate, 'YYYYMMDD').format('MM/DD/YYYY')),
      endDate: String(moment(endDate, 'YYYYMMDD').format('MM/DD/YYYY'))
    })
  })
})

router.get('/summon-deletes/:date', Config.ensureAuthenticated, function (req, res, next) {
  const dateToUse = moment(req.params.date, 'YYYY-MM-DD')
  const startDate = moment(dateToUse).format('YYYYMMDD')
  const endDate = moment(dateToUse).add(1, 'days').format('YYYYMMDD')
  const queryString = `
    SELECT 'b'||record_num||'a' AS record_number,
    deletion_date_gmt
    FROM sierra_view.record_metadata
    where record_type_code='b'
    and deletion_date_gmt >= '${startDate}'
    and deletion_date_gmt < '${endDate}'
    ORDER BY deletion_date_gmt
  `
  sierra.query(queryString, function (err, result) {
    // If downloading text File
    let fileText = ''
    result.rows.forEach(function (row) {
      fileText += row.record_number
      fileText += '\r\n'
    })

    res.render('summon-deletes-detail', {
      layout: 'layout',
      title: 'Summon Deletes',
      result: result.rows,
      startDate: String(moment(startDate, 'YYYYMMDD').format('MM/DD/YYYY')),
      endDate: String(moment(endDate, 'YYYYMMDD').format('MM/DD/YYYY'))
    })
  })
})

router.get('/overdue-items', Config.ensureAuthenticated, function (req, res, next) {
  const startDate = (req.query.startDate) ? moment(req.query.startDate).format('YYYYMMDD') : moment().subtract(7, 'days').format('YYYYMMDD')
  const endDate = (req.query.endDate) ? moment(req.query.endDate).format('YYYYMMDD') : moment().subtract(1, 'days').format('YYYYMMDD')
  const queryString = `
    SELECT item_view.id AS id,
    bib_record_property.best_title AS best_title,
    item_view.barcode AS barcode,
    item_view.copy_num AS copy_num,
    replace(item_record_property.call_number,'|a','') callnumber,
    last_name||','||first_name AS current_patron,
    item_view.location_code AS location_code,
    item_status_code,
    location_name.name AS location_name
    FROM sierra_view.item_view
    LEFT JOIN sierra_view.bib_record_item_record_link
    ON sierra_view.item_view.id=sierra_view.bib_record_item_record_link.item_record_id
    LEFT JOIN sierra_view.bib_record_property
    ON sierra_view.bib_record_item_record_link.bib_record_id=sierra_view.bib_record_property.bib_record_id
    LEFT JOIN sierra_view.item_record_property
    ON sierra_view.item_view.id=sierra_view.item_record_property.item_record_id
    LEFT JOIN sierra_view.checkout
    ON sierra_view.item_view.id=sierra_view.checkout.item_record_id
    LEFT JOIN sierra_view.patron_record_fullname
    ON sierra_view.checkout.patron_record_id=sierra_view.patron_record_fullname .patron_record_id
    LEFT JOIN sierra_view.location
    ON sierra_view.item_view.location_code = sierra_view.location.code
    LEFT JOIN sierra_view.location_name
    ON sierra_view.location.id = sierra_view.location_name.location_id
    WHERE overdue_count>=3
    AND to_char(overdue_gmt, 'yyyymmdd') >= '${startDate}'
    AND to_char(overdue_gmt, 'yyyymmdd') <= '${endDate}'
  `
  sierra.query(queryString, function (err, result) {
    res.render('overdue-items', {
      layout: 'layout',
      title: 'Overdue Items',
      result: result.rows,
      startDate: String(moment(startDate, 'YYYYMMDD').format('MM/DD/YYYY')),
      endDate: String(moment(endDate, 'YYYYMMDD').format('MM/DD/YYYY'))
    })
  })
})

router.get('/item-status', Config.ensureAuthenticated, function (req, res, next) {
  const startDate = (req.query.startDate) ? moment(req.query.startDate).format('YYYYMMDD') : moment().subtract(7, 'days').format('YYYYMMDD')
  const endDate = (req.query.endDate) ? moment(req.query.endDate).format('YYYYMMDD') : moment().subtract(1, 'days').format('YYYYMMDD')

  const type = (req.query.type) ? (req.query.type) : 'n'
  let queryDate = (req.query.queryDate) ? Number(req.query.queryDate) : 0

  const queryDateArray = [
    'checkout.overdue_gmt',
    'checkout.due_gmt',
    'checkout.checkout_gmt',
    'item_view.last_checkin_gmt',
    'item_view.last_checkout_gmt',
    'record_metadata.record_last_updated_gmt',
    null]

  queryDate = queryDateArray[queryDate]

  let sql = `
    SELECT item_view.id AS id,
    bib_record_property.best_title AS best_title,
    item_view.barcode AS barcode,
    item_view.copy_num AS copy_num,
    replace(item_record_property.call_number,'|a','') callnumber,
    location_name.name AS location_name,
    checkout.overdue_gmt,
    checkout.due_gmt,
    checkout.checkout_gmt,
    item_view.last_checkin_gmt,
    item_view.last_checkout_gmt
    FROM sierra_view.item_view
    LEFT JOIN sierra_view.bib_record_item_record_link
    ON sierra_view.item_view.id=sierra_view.bib_record_item_record_link.item_record_id
    LEFT JOIN sierra_view.bib_record_property
    ON sierra_view.bib_record_item_record_link.bib_record_id=sierra_view.bib_record_property.bib_record_id
    LEFT JOIN sierra_view.item_record_property
    ON sierra_view.item_view.id=sierra_view.item_record_property.item_record_id
    LEFT JOIN sierra_view.checkout
    ON sierra_view.item_view.id=sierra_view.checkout.item_record_id
    LEFT JOIN sierra_view.location
    ON sierra_view.item_view.location_code = sierra_view.location.code
    LEFT JOIN sierra_view.location_name
    ON sierra_view.location.id = sierra_view.location_name.location_id
  `
  if (queryDate === 'record_metadata.record_last_updated_gmt') {
    sql += 'LEFT JOIN sierra_view.record_metadata ' +
        'ON sierra_view.item_view.record_num=sierra_view.record_metadata.record_num '
  }
  sql += "WHERE item_status_code = '" + type + "' "
  sql += (queryDate) ? 'AND to_char(' + queryDate + ", 'yyyymmdd') >= '" + startDate + "' " : ''
  sql += (queryDate) ? 'AND to_char(' + queryDate + ", 'yyyymmdd') <= '" + endDate + "' " : ''

  sierra.query(sql, function (err, result) {
    if (err) console.log(err)

    res.render('item-status-reports', {
      layout: 'layout',
      title: 'Item Status Reports',
      result: result.rows,
      startDate: String(moment(startDate, 'YYYYMMDD').format('MM/DD/YYYY')),
      endDate: String(moment(endDate, 'YYYYMMDD').format('MM/DD/YYYY')),
      type: type,
      queryDate: req.query.queryDate
    })
  })
})

router.get('/continuing-resources', Config.ensureAuthenticated, function (req, res, next) {
  res.redirect('/continuing-resources/main')
})

router.get('/continuing-resources/main', Config.ensureAuthenticated, function (req, res, next) {
  // show the UNCW Subscription overview
  const queryString1 = `
    SELECT
    fund_master_id,
    name,
    to_char((appropriation::decimal)/100::float8, '9999999.99') as appropriation,
    to_char((expenditure::decimal)/100::float8, '9999999.99') as expenditure,
    to_char((encumbrance::decimal)/100::float8, '9999999.99') as encumbrance,
    to_char(((appropriation::decimal)/100::float8 -((expenditure::decimal)/100::float8 + (encumbrance::decimal)/100::float8)), '9999999.99') as free_balance,
    to_char(((appropriation::decimal)/100::float8 -(expenditure::decimal)/100::float8), '9999999.99') as cash_balance
    FROM sierra_view.fund_myuser
    WHERE fund_type='fbal'
    and (fund_code='ser' or fund_code='sere')
    and acct_unit='3'
  `
  sierra.query(queryString1, function (err, result) {
    const startYear = ((new Date()).getMonth() < 6) ? String(Number((new Date()).getFullYear()) - 1) : String(Number((new Date()).getFullYear()))
    const endYear = ((new Date()).getMonth() < 6) ? String(Number((new Date()).getFullYear())) : String(Number((new Date()).getFullYear()) + 1)

    // For each department we need to run detailed query and sum the price amount of the results
    Async.eachOf(result.rows, function (department, index, callback) {
      const queryStartDate = (req.query.year) ? String(Number(req.query.year) - 1) + '-07-01' : startYear + '-07-01'
      const queryEndDate = (req.query.year) ? String(Number(req.query.year)) + '-06-30' : endYear + '-06-30'
      const queryString2 = `
        select sum(round(((discount_amt/nullif(subtotal_amt,0))*paid_amt)+((shipping_amt/nullif(subtotal_amt,0))*paid_amt)+paid_amt,2))
        From sierra_view.order_record_cmf
        LEFT JOIN sierra_view.fund_master
        ON sierra_view.fund_master.code_num::text=ltrim(sierra_view.order_record_cmf.fund_code, '0')
        Left Join sierra_view.order_view
        ON sierra_view.order_view.record_id=sierra_view.order_record_cmf.order_record_id
        LEFT JOIN sierra_view.invoice_record_line
        ON sierra_view.invoice_record_line.order_record_metadata_id=sierra_view.order_view.record_id
        LEFT JOIN sierra_view.invoice_view
        ON sierra_view.invoice_record_line.invoice_record_id=sierra_view.invoice_view.id
        LEFT JOIN sierra_view.user_defined_ocode3_myuser
        ON sierra_view.user_defined_ocode3_myuser.code=sierra_view.order_view.ocode3
        LEFT JOIN sierra_view.bib_record_order_record_link
        ON sierra_view.bib_record_order_record_link.order_record_id=sierra_view.order_view.record_id
        LEFT JOIN sierra_view.bib_record_property
        ON sierra_view.bib_record_property.bib_record_id=sierra_view.bib_record_order_record_link.bib_record_id
        LEFT JOIN sierra_view.material_property_myuser
        ON sierra_view.material_property_myuser.code=sierra_view.bib_record_property.material_code
        where fund_master.id='${department.fund_master_id}'
        and posted_date_gmt>='${queryStartDate}'
        and posted_date_gmt<='${queryEndDate}'
      `
      sierra.query(queryString2, function (err, result2) {
        if (err) console.log(err)

        if (result2) {
          result.rows[index].total_amt = (result2.rows[0].sum) ? (result2.rows[0].sum) : 0
        } else {
          result.rows[index].total_amt = 0
        }

        callback()
      })
    }, function (err, paid_amt_sum) {
      if (err) console.log(err)
      // Create an array of years, 2012 to present
      const years = []
      const startYear = 2012
      let iterYear = startYear
      Async.whilst(function () { return iterYear <= Number(endYear) }, function (callback) {
        years.push(iterYear)
        iterYear++
        callback(null)
      }, function (err) {
        const selectedYear = (req.query.year) ? (req.query.year) : Number(endYear)
        res.render('continuing-resources-main', {
          layout: 'layout',
          title: 'UNCW Subscriptions',
          result: result.rows,
          years: years,
          year: req.query.year,
          selectedYear: selectedYear,
          showAddFields: (selectedYear === Number(endYear))
        })
      })
    })
  })
})

router.get('/continuing-resources/physical', Config.ensureAuthenticated, function (req, res, next) {
  const currentFiscalStartYear = ((new Date()).getMonth() < 6) ? String(Number((new Date()).getFullYear()) - 1) : String(Number((new Date()).getFullYear()))
  const currentFiscalEndYear = ((new Date()).getMonth() < 6) ? String(Number((new Date()).getFullYear())) : String(Number((new Date()).getFullYear()) + 1)
  const queryStartDate = (req.query.year) ? String(Number(req.query.year) - 1) + '-07-01' : currentFiscalStartYear + '-07-01'
  const queryEndDate = (req.query.year) ? String(Number(req.query.year)) + '-06-30' : currentFiscalEndYear + '-06-30'

  /* in invoice_record_line.fund_code,  print subscriptions is 00027 and electronic is 00032 */
  const queryString = `
    Select best_title,
    sierra_view.material_property_myuser.name,
    'o'||order_view.record_num||'a' AS order_record,
    user_defined_ocode3_myuser.name, 
    round(((discount_amt/nullif(subtotal_amt,0))*paid_amt)+((shipping_amt/nullif(subtotal_amt,0))*paid_amt)+paid_amt,2)::text as amt_paid,
    to_char(posted_date_gmt, 'YYYYMMDD')::text,
    replace(replace(replace(replace(replace(ocode1, 'p', 'PERIODICAL'), 'f', 'ELECTRONIC RES'), 'l', 'MICROFILM'), 's', 'SERIAL'), 'm', 'MONOGRAPH'),
    vendor_record_code,
    replace(replace(replace(replace(order_status_code, 'g', 'SERIAL LIENED'), 'f', 'SERIAL NO ENC'), 'a', 'FULLY PAID'), 'z', 'CANCELLED')
    From sierra_view.order_record_cmf
    Left Join sierra_view.order_view
    ON sierra_view.order_view.record_id=sierra_view.order_record_cmf.order_record_id
    Left Join sierra_view.order_status_property_myuser
    ON sierra_view.order_status_property_myuser.code=sierra_view.order_view.order_status_code
    LEFT JOIN sierra_view.invoice_record_line
    ON sierra_view.invoice_record_line.order_record_metadata_id=sierra_view.order_view.record_id
    LEFT JOIN sierra_view.invoice_view
    ON sierra_view.invoice_record_line.invoice_record_id=sierra_view.invoice_view.id
    LEFT JOIN sierra_view.user_defined_ocode3_myuser
    ON sierra_view.user_defined_ocode3_myuser.code=sierra_view.order_view.ocode3
    LEFT JOIN sierra_view.bib_record_order_record_link
    ON sierra_view.bib_record_order_record_link.order_record_id=sierra_view.order_view.record_id
    LEFT JOIN sierra_view.bib_record_property
    ON sierra_view.bib_record_property.bib_record_id=sierra_view.bib_record_order_record_link.bib_record_id
    LEFT JOIN sierra_view.material_property_myuser
    ON sierra_view.material_property_myuser.code=sierra_view.bib_record_property.material_code
    where invoice_record_line.fund_code='00027'
    and posted_date_gmt>='${queryStartDate}'
    and posted_date_gmt<='${queryEndDate}'
    union all
    (
    Select best_title,
    sierra_view.material_property_myuser.name,
    'o'||order_view.record_num||'a' AS order_record,
    user_defined_ocode3_myuser.name,
    '0' as amt_paid,
    '-' as posted_date_gmt,
    replace(replace(replace(replace(replace(ocode1, 'p', 'PERIODICAL'), 'f', 'ELECTRONIC RES'), 'l', 'MICROFILM'), 's', 'SERIAL'), 'm', 'MONOGRAPH'),
    vendor_record_code,
    replace(replace(replace(replace(order_status_code, 'g', 'SERIAL LIENED'), 'f', 'SERIAL NO ENC'), 'a', 'FULLY PAID'), 'z', 'CANCELLED')
    From sierra_view.order_record_cmf
    Left Join sierra_view.order_view
    ON sierra_view.order_view.record_id=sierra_view.order_record_cmf.order_record_id
    Left Join sierra_view.order_status_property_myuser
    ON sierra_view.order_status_property_myuser.code=sierra_view.order_view.order_status_code
    LEFT JOIN sierra_view.user_defined_ocode3_myuser
    ON sierra_view.user_defined_ocode3_myuser.code=sierra_view.order_view.ocode3
    LEFT JOIN sierra_view.bib_record_order_record_link
    ON sierra_view.bib_record_order_record_link.order_record_id=sierra_view.order_view.record_id
    LEFT JOIN sierra_view.bib_record_property
    ON sierra_view.bib_record_property.bib_record_id=sierra_view.bib_record_order_record_link.bib_record_id
    LEFT JOIN sierra_view.material_property_myuser
    ON sierra_view.material_property_myuser.code=sierra_view.bib_record_property.material_code
    where order_record_cmf.fund_code='00027'
    and order_status_code !='z'
    except
    Select best_title,
    sierra_view.material_property_myuser.name,
    'o'||order_view.record_num||'a' AS order_record,
    user_defined_ocode3_myuser.name,
    '0' as amt_paid,
    '-' as posted_date_gmt,
    replace(replace(replace(replace(replace(ocode1, 'p', 'PERIODICAL'), 'f', 'ELECTRONIC RES'), 'l', 'MICROFILM'), 's', 'SERIAL'), 'm', 'MONOGRAPH'),
    vendor_record_code,
    replace(replace(replace(replace(order_status_code, 'g', 'SERIAL LIENED'), 'f', 'SERIAL NO ENC'), 'a', 'FULLY PAID'), 'z', 'CANCELLED')
    From sierra_view.order_record_cmf
    Left Join sierra_view.order_view
    ON sierra_view.order_view.record_id=sierra_view.order_record_cmf.order_record_id
    Left Join sierra_view.order_status_property_myuser
    ON sierra_view.order_status_property_myuser.code=sierra_view.order_view.order_status_code
    LEFT JOIN sierra_view.invoice_record_line
    ON sierra_view.invoice_record_line.order_record_metadata_id=sierra_view.order_view.record_id
    LEFT JOIN sierra_view.invoice_view
    ON sierra_view.invoice_record_line.invoice_record_id=sierra_view.invoice_view.id
    LEFT JOIN sierra_view.user_defined_ocode3_myuser
    ON sierra_view.user_defined_ocode3_myuser.code=sierra_view.order_view.ocode3
    LEFT JOIN sierra_view.bib_record_order_record_link
    ON sierra_view.bib_record_order_record_link.order_record_id=sierra_view.order_view.record_id
    LEFT JOIN sierra_view.bib_record_property
    ON sierra_view.bib_record_property.bib_record_id=sierra_view.bib_record_order_record_link.bib_record_id
    LEFT JOIN sierra_view.material_property_myuser
    ON sierra_view.material_property_myuser.code=sierra_view.bib_record_property.material_code
    where invoice_record_line.fund_code='00027'
    and posted_date_gmt>='${queryStartDate}'
    and posted_date_gmt<='${queryEndDate}'
    )
  `
  sierra.query(queryString, function (err, result) {
    if (err) console.log(err)
    // Create an array of years, 2012 to present
    const years = []
    const startYear = 2012
    let iterYear = startYear
    Async.whilst(function () { return iterYear <= Number(currentFiscalEndYear) }, function (callback) {
      years.push(iterYear)
      iterYear++
      callback(null)
    }, function (err) {
      if (err) console.log(err)
      const selectedYear = (req.query.year) ? (req.query.year) : Number(currentFiscalEndYear)
      res.render('continuing-resources-physical-electronic', {
        layout: 'layout',
        title: 'UNCW Subscriptions - Physical',
        result: result.rows,
        startYear: currentFiscalStartYear,
        endYear: currentFiscalEndYear,
        years,
        year: req.query.year,
        selectedYear
      })
    })
  })
})

router.get('/continuing-resources/electronic', Config.ensureAuthenticated, function (req, res, next) {
  const currentFiscalStartYear = ((new Date()).getMonth() < 6) ? String(Number((new Date()).getFullYear()) - 1) : String(Number((new Date()).getFullYear()))
  const currentFiscalEndYear = ((new Date()).getMonth() < 6) ? String(Number((new Date()).getFullYear())) : String(Number((new Date()).getFullYear()) + 1)
  const queryStartDate = (req.query.year) ? String(Number(req.query.year) - 1) + '-07-01' : currentFiscalStartYear + '-07-01'
  const queryEndDate = (req.query.year) ? String(Number(req.query.year)) + '-06-30' : currentFiscalEndYear + '-06-30'
  /* for invoice_record_line.fund_code,  print subscriptions is 00027 and electronic is 00032 */

  const queryString = `
    Select best_title,
    sierra_view.material_property_myuser.name,
    'o'||order_view.record_num||'a' AS order_record,
    user_defined_ocode3_myuser.name,
    round(((discount_amt/nullif(subtotal_amt,0))*paid_amt)+((shipping_amt/nullif(subtotal_amt,0))*paid_amt)+paid_amt,2)::text as amt_paid,
    to_char(posted_date_gmt, 'YYYYMMDD')::text,replace(replace(replace(replace(replace(ocode1, 'p', 'PERIODICAL'), 'f', 'ELECTRONIC RES'), 'l', 'MICROFILM'), 's', 'SERIAL'), 'm', 'MONOGRAPH'),
    vendor_record_code,
    replace(replace(replace(replace(order_status_code,'g','SERIAL LIENED'), 'f', 'SERIAL NO ENC'), 'a', 'FULLY PAID'), 'z', 'CANCELLED')
    From sierra_view.order_record_cmf
    Left Join sierra_view.order_view
    ON sierra_view.order_view.record_id=sierra_view.order_record_cmf.order_record_id
    Left Join sierra_view.order_status_property_myuser
    ON sierra_view.order_status_property_myuser.code=sierra_view.order_view.order_status_code
    LEFT JOIN sierra_view.invoice_record_line
    ON sierra_view.invoice_record_line.order_record_metadata_id=sierra_view.order_view.record_id
    LEFT JOIN sierra_view.invoice_view
    ON sierra_view.invoice_record_line.invoice_record_id=sierra_view.invoice_view.id
    LEFT JOIN sierra_view.user_defined_ocode3_myuser
    ON sierra_view.user_defined_ocode3_myuser.code=sierra_view.order_view.ocode3
    LEFT JOIN sierra_view.bib_record_order_record_link
    ON sierra_view.bib_record_order_record_link.order_record_id=sierra_view.order_view.record_id
    LEFT JOIN sierra_view.bib_record_property
    ON sierra_view.bib_record_property.bib_record_id=sierra_view.bib_record_order_record_link.bib_record_id
    LEFT JOIN sierra_view.material_property_myuser
    ON sierra_view.material_property_myuser.code=sierra_view.bib_record_property.material_code
    where invoice_record_line.fund_code='00032'
    and posted_date_gmt>='${queryStartDate}'
    and posted_date_gmt<='${queryEndDate}'
    union all
    ( 
    Select best_title,
    sierra_view.material_property_myuser.name,
    'o'||order_view.record_num||'a' AS order_record,
    user_defined_ocode3_myuser.name,
    '0' as amt_paid,
    '-' as posted_date_gmt,
    replace(replace(replace(replace(replace(ocode1, 'p', 'PERIODICAL'), 'f', 'ELECTRONIC RES'), 'l', 'MICROFILM'), 's', 'SERIAL'), 'm', 'MONOGRAPH'),
    vendor_record_code,
    replace(replace(replace(replace(order_status_code, 'g', 'SERIAL LIENED'), 'f', 'SERIAL NO ENC'), 'a', 'FULLY PAID'), 'z', 'CANCELLED')
    From sierra_view.order_record_cmf
    Left Join sierra_view.order_view
    ON sierra_view.order_view.record_id=sierra_view.order_record_cmf.order_record_id
    Left Join sierra_view.order_status_property_myuser
    ON sierra_view.order_status_property_myuser.code=sierra_view.order_view.order_status_code
    LEFT JOIN sierra_view.user_defined_ocode3_myuser
    ON sierra_view.user_defined_ocode3_myuser.code=sierra_view.order_view.ocode3
    LEFT JOIN sierra_view.bib_record_order_record_link
    ON sierra_view.bib_record_order_record_link.order_record_id=sierra_view.order_view.record_id
    LEFT JOIN sierra_view.bib_record_property
    ON sierra_view.bib_record_property.bib_record_id=sierra_view.bib_record_order_record_link.bib_record_id
    LEFT JOIN sierra_view.material_property_myuser
    ON sierra_view.material_property_myuser.code=sierra_view.bib_record_property.material_code
    where order_record_cmf.fund_code='00032'
    and order_status_code !='z'
    except 
    Select best_title,
    sierra_view.material_property_myuser.name,
    'o'||order_view.record_num||'a' AS order_record,
    user_defined_ocode3_myuser.name,
    '0' as amt_paid,
    '-' as posted_date_gmt,
    replace(replace(replace(replace(replace(ocode1, 'p', 'PERIODICAL'), 'f', 'ELECTRONIC RES'), 'l', 'MICROFILM'), 's', 'SERIAL'), 'm', 'MONOGRAPH'),
    vendor_record_code,
    replace(replace(replace(replace(order_status_code, 'g', 'SERIAL LIENED'), 'f', 'SERIAL NO ENC'), 'a', 'FULLY PAID'), 'z', 'CANCELLED')
    From sierra_view.order_record_cmf
    Left Join sierra_view.order_view
    ON sierra_view.order_view.record_id=sierra_view.order_record_cmf.order_record_id
    Left Join sierra_view.order_status_property_myuser
    ON sierra_view.order_status_property_myuser.code=sierra_view.order_view.order_status_code
    LEFT JOIN sierra_view.invoice_record_line
    ON sierra_view.invoice_record_line.order_record_metadata_id=sierra_view.order_view.record_id
    LEFT JOIN sierra_view.invoice_view
    ON sierra_view.invoice_record_line.invoice_record_id=sierra_view.invoice_view.id
    LEFT JOIN sierra_view.user_defined_ocode3_myuser
    ON sierra_view.user_defined_ocode3_myuser.code=sierra_view.order_view.ocode3
    LEFT JOIN sierra_view.bib_record_order_record_link
    ON sierra_view.bib_record_order_record_link.order_record_id=sierra_view.order_view.record_id
    LEFT JOIN sierra_view.bib_record_property
    ON sierra_view.bib_record_property.bib_record_id=sierra_view.bib_record_order_record_link.bib_record_id
    LEFT JOIN sierra_view.material_property_myuser
    ON sierra_view.material_property_myuser.code=sierra_view.bib_record_property.material_code
    where invoice_record_line.fund_code='00032'
    and posted_date_gmt>='${queryStartDate}'
    and posted_date_gmt<='${queryEndDate}'
    )
  `
  sierra.query(queryString, function (err, result) {
    if (err) console.log(err)

    const currentFiscalStartYear = ((new Date()).getMonth() < 6) ? String(Number((new Date()).getFullYear()) - 1) : String(Number((new Date()).getFullYear()))
    const currentFiscalEndYear = ((new Date()).getMonth() < 6) ? String(Number((new Date()).getFullYear())) : String(Number((new Date()).getFullYear()) + 1)

    // Create an array of years, 2012 to present
    const years = []
    const startYear = 2012
    let iterYear = startYear
    Async.whilst(function () { return iterYear <= Number(currentFiscalEndYear) }, function (callback) {
      years.push(iterYear)
      iterYear++
      callback(null)
    }, function (err) {
      if (err) console.log(err)
      const selectedYear = (req.query.year) ? (req.query.year) : Number(currentFiscalEndYear)
      res.render('continuing-resources-physical-electronic', {
        layout: 'layout',
        title: 'UNCW Subscriptions - Electronic',
        result: result.rows,
        startYear: currentFiscalStartYear,
        endYear: currentFiscalEndYear,
        selectedYear,
        years,
        year: req.query.year
      })
    })
  })
})

router.get('/continuing-resources/physical/:vendor', Config.ensureAuthenticated, function (req, res, next) {
  const vendor = req.params.vendor
  const currentFiscalStartYear = ((new Date()).getMonth() < 6) ? String(Number((new Date()).getFullYear()) - 1) : String(Number((new Date()).getFullYear()))
  const currentFiscalEndYear = ((new Date()).getMonth() < 6) ? String(Number((new Date()).getFullYear())) : String(Number((new Date()).getFullYear()) + 1)
  const queryStartDate = (req.query.year) ? String(Number(req.query.year) - 1) + '-07-01' : currentFiscalStartYear + '-07-01'
  const queryEndDate = (req.query.year) ? String(Number(req.query.year)) + '-06-30' : currentFiscalEndYear + '-06-30'
  const queryString = `
    Select replace(Title,',','') as Title,
    'o'||order_view.record_num||'a' AS order_record,
    round(((discount_amt/nullif(subtotal_amt,0))*paid_amt)+((shipping_amt/nullif(subtotal_amt,0))*paid_amt)+paid_amt,2) as amt_paid,
    to_char(posted_date_gmt, 'YYYYMMDD') as posted_date,
    replace(replace(replace(replace(replace(ocode1,'p','PERIODICAL'), 'f', 'ELECTRONIC RES'), 'l', 'MICROFILM'), 's', 'SERIAL'), 'm', 'MONOGRAPH') as Material_Type,
    invoice_view.record_type_code||invoice_view.record_num||'a' as invoice_record,
    invoice_view.invoice_number_text,
    invoice_record_line.note as invoice_note
    From sierra_view.order_record_cmf
    Left Join sierra_view.order_view
    ON sierra_view.order_view.record_id=sierra_view.order_record_cmf.order_record_id
    Left Join sierra_view.order_status_property_myuser
    ON sierra_view.order_status_property_myuser.code=sierra_view.order_view.order_status_code
    LEFT JOIN sierra_view.invoice_record_line
    ON sierra_view.invoice_record_line.order_record_metadata_id=sierra_view.order_view.record_id
    LEFT JOIN sierra_view.invoice_view
    ON sierra_view.invoice_record_line.invoice_record_id=sierra_view.invoice_view.id
    LEFT JOIN sierra_view.user_defined_ocode3_myuser
    ON sierra_view.user_defined_ocode3_myuser.code=sierra_view.order_view.ocode3
    LEFT JOIN sierra_view.bib_record_order_record_link
    ON sierra_view.bib_record_order_record_link.order_record_id=sierra_view.order_view.record_id
    LEFT JOIN sierra_view.bib_record_property
    ON sierra_view.bib_record_property.bib_record_id=sierra_view.bib_record_order_record_link.bib_record_id
    LEFT JOIN sierra_view.material_property_myuser
    ON sierra_view.material_property_myuser.code=sierra_view.bib_record_property.material_code
    where (invoice_record_line.fund_code='00027' )
    and vendor_record_code='${vendor}'
    and posted_date_gmt>='${queryStartDate}'
    and posted_date_gmt<='${queryEndDate}'
    order by best_title
  `

  sierra.query(queryString, function (err, result) {
    if (err) console.log(err)
    const currentFiscalStartYear = ((new Date()).getMonth() < 6) ? String(Number((new Date()).getFullYear()) - 1) : String(Number((new Date()).getFullYear()))
    const currentFiscalEndYear = ((new Date()).getMonth() < 6) ? String(Number((new Date()).getFullYear())) : String(Number((new Date()).getFullYear()) + 1)

    // Create an array of years, 2012 to present
    const years = []
    const startYear = 2012
    let iterYear = startYear
    Async.whilst(function () { return iterYear <= Number(currentFiscalEndYear) }, function (callback) {
      years.push(iterYear)
      iterYear++
      callback(null)
    }, function (err) {
      if (err) console.log(err)
      const selectedYear = (req.query.year) ? (req.query.year) : Number(currentFiscalEndYear)
      res.render('continuing-resources-vendor', {
        layout: 'layout',
        title: 'UNCW Subscriptions - Physical -- ' + vendor,
        result: result.rows,
        startYear: currentFiscalStartYear,
        endYear: currentFiscalEndYear,
        selectedYear,
        years,
        year: req.query.year
      })
    })
  })
})

router.get('/continuing-resources/electronic/:vendor', Config.ensureAuthenticated, function (req, res, next) {
  const vendor = req.params.vendor
  const currentFiscalStartYear = ((new Date()).getMonth() < 6) ? String(Number((new Date()).getFullYear()) - 1) : String(Number((new Date()).getFullYear()))
  const currentFiscalEndYear = ((new Date()).getMonth() < 6) ? String(Number((new Date()).getFullYear())) : String(Number((new Date()).getFullYear()) + 1)
  const queryStartDate = (req.query.year) ? String(Number(req.query.year) - 1) + '-07-01' : currentFiscalStartYear + '-07-01'
  const queryEndDate = (req.query.year) ? String(Number(req.query.year)) + '-06-30' : currentFiscalEndYear + '-06-30'

  // is there an error at the paranthized WHERE ??
  const queryString = `
    SELECT replace(Title,',','') as Title,
    'o'||order_view.record_num||'a' AS order_record,
    round(((discount_amt/nullif(subtotal_amt,0))*paid_amt)+((shipping_amt/nullif(subtotal_amt,0))*paid_amt)+paid_amt,2) as amt_paid,
    to_char(posted_date_gmt, 'YYYYMMDD') as posted_date,
    replace(replace(replace(replace(replace(ocode1, 'p', 'PERIODICAL'), 'f', 'ELECTRONIC RES'), 'l', 'MICROFILM'), 's', 'SERIAL'), 'm', 'MONOGRAPH') as Material_Type,
    invoice_view.record_type_code||invoice_view.record_num||'a' as invoice_record,
    invoice_view.invoice_number_text,
    invoice_record_line.note as invoice_note
    FROM sierra_view.order_record_cmf
    LEFT JOIN sierra_view.order_view
    ON sierra_view.order_view.record_id=sierra_view.order_record_cmf.order_record_id
    LEFT JOIN sierra_view.order_status_property_myuser
    ON sierra_view.order_status_property_myuser.code=sierra_view.order_view.order_status_code
    LEFT JOIN sierra_view.invoice_record_line
    ON sierra_view.invoice_record_line.order_record_metadata_id=sierra_view.order_view.record_id
    LEFT JOIN sierra_view.invoice_view
    ON sierra_view.invoice_record_line.invoice_record_id=sierra_view.invoice_view.id
    LEFT JOIN sierra_view.user_defined_ocode3_myuser
    ON sierra_view.user_defined_ocode3_myuser.code=sierra_view.order_view.ocode3
    LEFT JOIN sierra_view.bib_record_order_record_link
    ON sierra_view.bib_record_order_record_link.order_record_id=sierra_view.order_view.record_id
    LEFT JOIN sierra_view.bib_record_property
    ON sierra_view.bib_record_property.bib_record_id=sierra_view.bib_record_order_record_link.bib_record_id
    LEFT JOIN sierra_view.material_property_myuser
    ON sierra_view.material_property_myuser.code=sierra_view.bib_record_property.material_code
    WHERE (invoice_record_line.fund_code='00032' )
    AND vendor_record_code='${vendor}'
    AND posted_date_gmt>='${queryStartDate}'
    AND posted_date_gmt<='${queryEndDate}'
    ORDER BY best_title
  `

  sierra.query(queryString, function (err, result) {
    if (err) console.log(err)
    const currentFiscalStartYear = ((new Date()).getMonth() < 6) ? String(Number((new Date()).getFullYear()) - 1) : String(Number((new Date()).getFullYear()))
    const currentFiscalEndYear = ((new Date()).getMonth() < 6) ? String(Number((new Date()).getFullYear())) : String(Number((new Date()).getFullYear()) + 1)

    // Create an array of years, 2012 to present
    const years = []
    const startYear = 2012
    let iterYear = startYear
    Async.whilst(function () { return iterYear <= Number(currentFiscalEndYear) }, function (callback) {
      years.push(iterYear)
      iterYear++
      callback(null)
    }, function (err) {
      if (err) console.log(err)
      const selectedYear = (req.query.year) ? (req.query.year) : Number(currentFiscalEndYear)
      res.render('continuing-resources-vendor', {
        layout: 'layout',
        title: 'UNCW Subscriptions - Electronic -- ' + vendor,
        result: result.rows,
        startYear: currentFiscalStartYear,
        endYear: currentFiscalEndYear,
        selectedYear,
        years
      })
    })
  })
})

router.get('/continuing-resources/title/:order', Config.ensureAuthenticated, function (req, res, next) {
  const orderRecord = String(req.params.order).substring(1, req.params.order.length - 1)
  const view = (req.query.view) ? (req.query.view) : 'table'
  const queryString = `
    SELECT Title,
    sierra_view.material_property_myuser.name as MaterialTypeName,
    'o'||order_view.record_num||'a' AS order_record,
    user_defined_ocode3_myuser.name as ocode3,
    round(((discount_amt/nullif(subtotal_amt,0))*paid_amt)+((shipping_amt/nullif(subtotal_amt,0))*paid_amt)+paid_amt,2) as amt_paid,
    to_char(posted_date_gmt, 'YYYYMMDD') as posted_date,
    replace(replace(ocode1, 'p', 'PERIODICAL'), 'f', 'ELECTRONIC RES'),
    vendor_record_code
    FROM sierra_view.order_record_cmf
    LEFT JOIN sierra_view.order_view
    ON sierra_view.order_view.record_id=sierra_view.order_record_cmf.order_record_id
    Left Join sierra_view.order_status_property_myuser
    ON sierra_view.order_status_property_myuser.code=sierra_view.order_view.order_status_code
    LEFT JOIN sierra_view.invoice_record_line
    ON sierra_view.invoice_record_line.order_record_metadata_id=sierra_view.order_view.record_id
    LEFT JOIN sierra_view.invoice_view
    ON sierra_view.invoice_record_line.invoice_record_id=sierra_view.invoice_view.id
    LEFT JOIN sierra_view.user_defined_ocode3_myuser
    ON sierra_view.user_defined_ocode3_myuser.code=sierra_view.order_view.ocode3
    LEFT JOIN sierra_view.bib_record_order_record_link
    ON sierra_view.bib_record_order_record_link.order_record_id=sierra_view.order_view.record_id
    LEFT JOIN sierra_view.bib_record_property
    ON sierra_view.bib_record_property.bib_record_id=sierra_view.bib_record_order_record_link.bib_record_id
    LEFT JOIN sierra_view.material_property_myuser
    ON sierra_view.material_property_myuser.code=sierra_view.bib_record_property.material_code
    WHERE order_view.record_num='${orderRecord}'
    ORDER BY posted_date desc
  `
  sierra.query(queryString, function (err, result) {
    if (err) {
      console.log(err)
      res.send('There was an error processing the request.')
    } else {
      if (view === 'table') {
        res.render('continuing-resources-title-table', {
          layout: 'layout',
          title: 'Title Stats',
          result: result.rows
        })
      } else {
        const currentFiscalEndYear = ((new Date()).getMonth() < 6) ? String(Number((new Date()).getFullYear())) : String(Number((new Date()).getFullYear()) + 1)

        // Create an array of fiscal years, 2012 to present
        const fiscalYears = []
        const startYear = 2005
        let iterYear = startYear
        Async.whilst(function () { return iterYear <= Number(currentFiscalEndYear) }, function (callback) {
          const yearObject = {
            name: String(iterYear) + '/' + String(iterYear + 1),
            startDate: String(iterYear) + '-07-01',
            endDate: String(iterYear + 1) + '-06-30',
            totalAmount: 0
          }
          fiscalYears.push(yearObject)
          iterYear++
          callback(null)
        }, function (err) {
          if (err) console.log(err)

          Async.eachOf(result.rows, function (row, index, callback) {
            const rowDate = moment(row.posted_date).format('YYYY-MM-DD')

            const fiscalYear = fiscalYears.find(o => ((moment(rowDate) >= moment(o.startDate)) && (moment(rowDate) <= moment(o.endDate))))
            fiscalYear.totalAmount += Number(row.amt_paid)
            callback(null)
          }, function (err) {
            if (err) console.log(err)
            console.log(fiscalYears)
            res.render('continuing-resources-title-graph', {
              layout: 'layout',
              title: 'Title Stats Visualization',
              data: fiscalYears,
              name: result.rows[0].title
            })
          })
        })
      }
    }
  })
})

router.get('/items-by-material', (req, res, next) => {
  const queryString1 = `
    SELECT sierra_view.user_defined_bcode2_myuser.name, sierra_view.user_defined_bcode2_myuser.code
    FROM sierra_view.user_defined_bcode2_myuser   
  `
  sierra.query(queryString1, function (err, result1) {
    const queryString2 = `
      SELECT sierra_view.bib_view.bcode2, count(distinct sierra_view.item_view.record_num)
      FROM sierra_view.bib_view
      LEFT JOIN sierra_view.bib_record_item_record_link
      ON sierra_view.bib_view.id=sierra_view.bib_record_item_record_link.bib_record_id
      LEFT JOIN sierra_view.item_view
      ON sierra_view.bib_record_item_record_link.item_record_id=sierra_view.item_view.id
      WHERE bcode3='-'
      AND icode2='-'
      AND item_status_code='-'
      GROUP BY sierra_view.bib_view.bcode2
      ORDER BY count(sierra_view.item_view.record_num) desc
    `
    sierra.query(queryString2, function (err, result2) {
      const data = _.map(result1.rows, function (material) {
        return _.extend(material, _.find(result2.rows, { bcode2: material.code }))
      })
      if (err) console.log(err)
      res.render('items-by-material', {
        layout: 'layout',
        title: 'Items by Material',
        result: data
      })
    })
  })
})

router.get('/items-by-material/:code', (req, res, next) => {
  const queryString = `
    SELECT DISTINCT 'i'||item_view.record_num||'a' as record_num
    FROM sierra_view.bib_view
    LEFT JOIN sierra_view.bib_record_item_record_link
    ON sierra_view.bib_view.id=sierra_view.bib_record_item_record_link.bib_record_id
    LEFT JOIN sierra_view.item_view
    ON sierra_view.bib_record_item_record_link.item_record_id=sierra_view.item_view.id
    WHERE bcode3='-'
    AND icode2='-'
    AND item_status_code='-'
    AND bcode2='${req.params.code}'
  `
  sierra.query(queryString, function (err, result) {
    if (err) console.log(err)

    let itemRecordsString = ''
    result.rows.forEach(itemRecord => {
      itemRecordsString += `${itemRecord.record_num}\n`
    })

    // write the bib and item records to respective files
    fs.writeFile('./public/downloads/item_records.txt', itemRecordsString, function (err) {
      if (err) console.log(Chalk.red(err))
      res.render('item-records-by-material', {
        layout: 'layout',
        title: 'Item List for ' + String(req.query.name).replace(/\w\S*/g, function (txt) { return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase() }),
        result: result.rows
      })
    })
  })
})

module.exports = router
