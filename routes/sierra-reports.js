var express = require('express');
var router = express.Router();
var moment = require('moment');
var Config = require('../config');
var Async = require ('async');
var _ = require('lodash');
var passport = require('passport');
var sites = require('../sites');

//DBs
var sierra = require('../dbs/sierra');

/* GET root */
router.get('/', function(req, res, next){
  res.redirect('/login');
});

/* GET and POST to login page */
router.get('/login', function(req, res, next){
    
      res.render('login', {
        layout: 'layout',
        title: '--- Login ---',
        failure: (req.query.failure) //Failed login attempt
      });
    });
    
// router.post('/login', 
//     passport.authenticate('ldapauth', {
//         //failureRedirect: '/login?failure=true'
//     }), function(req, res) {
//         console.log(req.user)
//         if (!req.user) res.redirect('/login?failure=true&' + ((req.query.path) ? 'path=' + req.query.path : ''));
//         else res.redirect('/' + ((req.query.path) ? req.query.path : 'dashboard'));
//     }
// );

router.post('/login', function(req, res, next) {
    passport.authenticate('ldapauth', function(err, user, info) {
        if (err || !user) res.redirect('/login?failure=true&' + ((req.query.path) ? 'path=' + req.query.path : ''));
        else {
          req.logIn(user, function(err) {
            if (err) console.log(Chalk.red(err));
            res.redirect('/' + ((req.query.path) ? req.query.path : 'dashboard'));
          });
        }
    })(req, res, next);
});

router.get('/logout', function(req, res){
    req.logout();
    res.redirect('/login');
});

/* GET the dashboard page */
router.get('/dashboard', Config.ensureAuthenticated, function(req, res, next){
  res.render('dashboard', {
    layout: 'layout',
    user: req.user.cn,
    title: 'Dashboard',
    sites: sites
  });
});

/* GET duplicate-patrons */
router.get('/duplicate-patrons', Config.ensureAuthenticated, function(req, res, next){

  //Run Query on sierra
  var query = sierra.query("SELECT  e.field_content " +
      "FROM sierra_view.patron_record p " +
      "JOIN sierra_view.patron_view v ON p.id = v.id " +
      "JOIN sierra_view.patron_record_fullname n ON p.id = n.patron_record_id " +
      "LEFT JOIN sierra_view.varfield e ON e.record_id = p.id AND e.varfield_type_code = 'z' " +
      "WHERE  LOWER(e.field_content) IS not NULL " +
      "GROUP BY   e.field_content " +
      "HAVING ( COUNT(e.field_content) >1) ", function(err, result){

      var allResults = [];
        Async.each (result.rows, function(row, callback) {
          var query = sierra.query("SELECT 'p' || v.record_num ||'a' AS patron_record," +
            "n.first_name, n.last_name, LOWER(e.field_content), " +
            "extract (year from v.expiration_date_gmt)||'-'||lpad (cast((EXTRACT(MONTH from v.expiration_date_gmt)) as varchar), 2, '0')" +
            "||'-'||lpad (cast((EXTRACT(DAY from v.expiration_date_gmt)) as varchar), 2, '0') AS expiration_date, " +
            "p.ptype_code " +
            "FROM sierra_view.patron_record p " +
            "JOIN sierra_view.patron_view v ON p.id = v.id " +
            "JOIN sierra_view.patron_record_fullname n ON p.id = n.patron_record_id " +
            "LEFT JOIN sierra_view.varfield e ON e.record_id = p.id AND e.varfield_type_code = 'z' " +
            "WHERE  e.field_content = '" + row.field_content + "' ", function(err, result){
            for (i = 0; i < result.rows.length; ++i) {
              allResults.push(result.rows[i]);
            }
            callback();
          });
        }, function(err) {
            console.log(err);
            res.render('duplicate-patrons', {
              layout: 'layout',
              title: 'Duplicate patrons',
              result: allResults,
            });
        });
      });
});

/* GET price-list */
router.get('/price-list', Config.ensureAuthenticated, function(req, res, next){
  //Get start and end date
  var today = new Date();

  var startDate = (req.query.startDate) ? moment(req.query.startDate).format("YYYYMMDD") : moment().subtract(7, "days").format("YYYYMMDD");
  var endDate = (req.query.endDate) ? moment(req.query.endDate).format("YYYYMMDD") : moment().subtract(1, "days").format("YYYYMMDD");

  //Run Query on sierra
  var query = sierra.query("SELECT item_view.id AS id," +
  "bib_record_property.best_title AS best_title," +
   "item_view.barcode AS barcode," +
   "item_view.copy_num AS copy_num," +
   "replace(item_record_property.call_number,'|a','') callnumber," +
   "last_name||','||first_name AS current_patron," +
   "item_view.location_code AS location_code," +
   "item_status_code," +
   "location_name.name AS location_name," +
   "varfield_view.field_content AS item_volume " +

   "FROM sierra_view.item_view " +
   "LEFT JOIN sierra_view.bib_record_item_record_link " +
   "ON sierra_view.item_view.id=sierra_view.bib_record_item_record_link.item_record_id " +
   "LEFT JOIN sierra_view.bib_record_property " +
   "ON sierra_view.bib_record_item_record_link.bib_record_id=sierra_view.bib_record_property.bib_record_id " +
   "LEFT JOIN sierra_view.item_record_property " +
   "ON sierra_view.item_view.id=sierra_view.item_record_property.item_record_id " +
   "LEFT JOIN sierra_view.checkout " +
   "ON sierra_view.item_view.id=sierra_view.checkout.item_record_id " +
   "LEFT JOIN sierra_view.patron_record_fullname " +
   "ON sierra_view.checkout.patron_record_id=sierra_view.patron_record_fullname .patron_record_id " +
   "LEFT JOIN sierra_view.location " +
   "ON sierra_view.item_view.location_code = sierra_view.location.code " +
   "LEFT JOIN sierra_view.location_name " +
   "ON sierra_view.location.id = sierra_view.location_name.location_id " +
   "LEFT JOIN sierra_view.varfield_view " +
   "ON sierra_view.varfield_view.record_id = sierra_view.item_view.id " +
   "AND varfield_view.varfield_type_code LIKE 'v%' " +

   "WHERE item_view.price = 0 " +
   "AND to_char(due_gmt, 'yyyymmdd') >= '" + startDate + "' " +
   "AND to_char(due_gmt, 'yyyymmdd') <= '" + endDate + "' ", function(err, result){
      res.render('price-list', {
        layout: 'layout',
        title: 'Price List',
        result: result.rows,
        startDate: String(moment(startDate, "YYYYMMDD").format("MM/DD/YYYY")),
        endDate: String(moment(endDate, "YYYYMMDD").format("MM/DD/YYYY")),
      });
  });
});


/* GET fund-report and fund-report/detail */
router.get('/fund-report', Config.ensureAuthenticated, function(req, res, next){
  
  var currentFiscalStartYear = ((new Date()).getMonth() < 6) ? String(Number((new Date()).getFullYear()) - 1) : String(Number((new Date()).getFullYear()));
  var currentFiscalEndYear = ((new Date()).getMonth() < 6) ? String(Number((new Date()).getFullYear())) : String(Number((new Date()).getFullYear()) + 1);

  var query = sierra.query("" +
      "SELECT *," +
      "fund_master_id, " +
      "name, " +
      "to_char((appropriation::decimal)/100::float8, '999999.99') as appropriation, " +
      "to_char((expenditure::decimal)/100::float8, '999999.99') as expenditure, " +
      "to_char((encumbrance::decimal)/100::float8, '999999.99') as encumbrance, " +
      "to_char(((appropriation::decimal)/100::float8 -(encumbrance::decimal)/100::float8 -(expenditure::decimal)/100::float8), '999999.99') AS free_balance, " +
      "to_char(((appropriation::decimal)/100::float8 -(expenditure::decimal)/100::float8), '999999.99') as cash_balance " +
      "FROM sierra_view.fund_myuser " +
      "WHERE  fund_type='fbal' " +
      "and acct_unit='3' " +
      "AND (note1='Departmental Funds'" +
      "OR note1='Fund Report')", function(err, result){
          if (err) console.log(err);

          //For each department we need to run detailed query and sum the price amount of the results
          Async.eachOf(result.rows, function(department, index, callback){

              var queryStartDate = (req.query.year) ? String(Number(req.query.year) - 1) + "-07-01" : currentFiscalStartYear + "-07-01";
              var queryEndDate = (req.query.year) ? String(Number(req.query.year)) + "-06-30" : currentFiscalEndYear + "-06-30";
              var query = sierra.query("" +
                  "SELECT " +

                  //"sum(round(((((invoice_record_line.paid_amt/subtotal_amt)*(shipping_amt+discount_amt))+invoice_record_line.paid_amt)), 2)) AS paid_amt " +
                  "sum(round(order_record_paid.paid_amount, 2)) AS paid_amt " +

                  "From sierra_view.order_record_cmf " +
                  "LEFT JOIN sierra_view.fund_master " +
                  "ON sierra_view.fund_master.code_num::text=ltrim(sierra_view.order_record_cmf.fund_code, '0') " +
                  "Left Join sierra_view.order_view " +
                  "ON sierra_view.order_view.record_id=sierra_view.order_record_cmf.order_record_id " +
                  "Left Join sierra_view.order_status_property_myuser " +
                  "ON sierra_view.order_status_property_myuser.code=sierra_view.order_view.order_status_code " +
                  //"LEFT JOIN sierra_view.invoice_record_line " +
                  //"ON sierra_view.invoice_record_line.order_record_metadata_id=sierra_view.order_view.record_id " +
                  "LEFT JOIN sierra_view.user_defined_ocode3_myuser " +
                  "ON sierra_view.user_defined_ocode3_myuser.code=sierra_view.order_view.ocode3 " +
                  "LEFT JOIN sierra_view.bib_record_order_record_link " +
                  "ON sierra_view.bib_record_order_record_link.order_record_id=sierra_view.order_view.record_id " +
                  "LEFT JOIN sierra_view.bib_record_property " +
                  "ON sierra_view.bib_record_property.bib_record_id=sierra_view.bib_record_order_record_link.bib_record_id " +
                  "LEFT JOIN sierra_view.material_property_myuser " +
                  "ON sierra_view.material_property_myuser.code=sierra_view.bib_record_property.material_code " +
                  //"LEFT JOIN sierra_view.invoice_view " +
                  //"ON sierra_view.invoice_record_line.invoice_record_id=sierra_view.invoice_view.id " +

                  "LEFT JOIN sierra_view.order_record_paid " +
                  "ON sierra_view.order_record_paid.order_record_id=sierra_view.order_view.record_id " +

                  "where " +
                  "accounting_unit_id='4' " +
                  "and fund_master.id=" + department.fund_master_id + " " +
                  "and order_status_code !='z' " +
                  "and order_view.record_creation_date_gmt >= '"+ queryStartDate+"' " +
                  "and order_view.record_creation_date_gmt <= '"+ queryEndDate +"' ", function(err, result2){
                      if (err) console.log(err);
                      if (result2) {
                          result.rows[index].total_amt = (result2.rows[0].paid_amt) ? (result2.rows[0].paid_amt) : 0;
                      }
                      
                      callback();

                  });
          }, function(err, paid_amt_sum){
              if (err) console.log(err);
              console.log("CALLBACK");
              //Create an array of years, 2012 to present
              var years = [];
              var startYear = 2012;
              var iterYear = startYear;
              Async.whilst(function(){return iterYear <= Number(currentFiscalEndYear);}, function(callback){
                  years.push(iterYear);
                  iterYear++;
                  callback(null);
              }, function(err){
                  var selectedYear = (req.query.year) ? (req.query.year) : Number(currentFiscalEndYear);
                  res.render('fund-report', {
                      layout: 'layout',
                      title: 'Departmental Funds',
                      result: result.rows,
                      years: years,
                      selectedYear: selectedYear,
                      showAddFields: (selectedYear == Number(currentFiscalEndYear))
                  });
              });
          }) ;
      });
});

router.get('/fund-report/detail/:id', Config.ensureAuthenticated, function(req, res, next){
  var currentFiscalStartYear = ((new Date()).getMonth() < 6) ? String(Number((new Date()).getFullYear()) - 1) : String(Number((new Date()).getFullYear()));
  var currentFiscalEndYear = ((new Date()).getMonth() < 6) ? String(Number((new Date()).getFullYear())) : String(Number((new Date()).getFullYear()) + 1);

  var queryStartDate = (req.query.year) ? String(Number(req.query.year) - 1) + "-07-01" : currentFiscalStartYear + "-07-01";
  var queryEndDate = (req.query.year) ? String(Number(req.query.year)) + "-06-30" : currentFiscalEndYear + "-06-30";
  var query = sierra.query("" +
      "SELECT " +
      "best_title AS title, " + 
      "fund_master.id, " +
      "sierra_view.material_property_myuser.name AS material_type, " +
      "order_view.record_num AS record_number, " +
      "'o'||order_view.record_num||'a' AS order_record, " +
      "user_defined_ocode3_myuser.name AS request_source, " +

      //"(((invoice_record_line.paid_amt/subtotal_amt)*(shipping_amt+discount_amt))+invoice_record_line.paid_amt) AS paid_amt, " +
      "round(order_record_paid.paid_amount, 2) AS paid_amt, " +

      "round(estimated_price, 2) AS Encumbrance, " +
      "sierra_view.order_status_property_myuser.name AS order_status, " +
      "to_char(order_view.record_creation_date_gmt, 'MM/DD/YYYY') AS order_creation_date " +

      "From sierra_view.order_record_cmf " +
      "LEFT JOIN sierra_view.fund_master " +
      "ON sierra_view.fund_master.code_num::text=ltrim(sierra_view.order_record_cmf.fund_code, '0') " +
      "Left Join sierra_view.order_view " +
      "ON sierra_view.order_view.record_id=sierra_view.order_record_cmf.order_record_id " +
      "Left Join sierra_view.order_status_property_myuser " +
      "ON sierra_view.order_status_property_myuser.code=sierra_view.order_view.order_status_code " +
      //"LEFT JOIN sierra_view.invoice_record_line " +
      //"ON sierra_view.invoice_record_line.order_record_metadata_id=sierra_view.order_view.record_id " +
      "LEFT JOIN sierra_view.user_defined_ocode3_myuser " +
      "ON sierra_view.user_defined_ocode3_myuser.code=sierra_view.order_view.ocode3 " +
      "LEFT JOIN sierra_view.bib_record_order_record_link " +
      "ON sierra_view.bib_record_order_record_link.order_record_id=sierra_view.order_view.record_id " +
      "LEFT JOIN sierra_view.bib_record_property " +
      "ON sierra_view.bib_record_property.bib_record_id=sierra_view.bib_record_order_record_link.bib_record_id " +
      "LEFT JOIN sierra_view.material_property_myuser " +
      "ON sierra_view.material_property_myuser.code=sierra_view.bib_record_property.material_code " +
      //"LEFT JOIN sierra_view.invoice_view " +
      //"ON sierra_view.invoice_record_line.invoice_record_id=sierra_view.invoice_view.id " +

      "LEFT JOIN sierra_view.order_record_paid " +
      "ON sierra_view.order_record_paid.order_record_id=sierra_view.order_view.record_id " +

      "where " +
      "accounting_unit_id='4' " +
      "and fund_master.id=" + req.params.id + " " +
      "and order_status_code !='z' " +
      "and order_view.record_creation_date_gmt >= '"+ queryStartDate+"' " +
      "and order_view.record_creation_date_gmt <= '"+ queryEndDate +"' ", function(err, result){
          if (err) console.log(err);
          
          if (result) Async.eachOf(result.rows, function(row, index, callback){
              var query = sierra.query("" +
                  "Select field_content " +
                  "FROM sierra_view.varfield_view " +
                  "LEFT JOIN  sierra_view.order_view " +
                  "ON sierra_view.varfield_view.record_num=sierra_view.order_view.record_num " +
                  "where varfield_view.varfield_type_code = 'r' " +
                  "and order_view.record_num = " + row.record_number, function(err, result2){
                      if (result2.rows && result2.rows[0]) result.rows[index].selector = result2.rows[0].field_content;
                      var query = sierra.query("" +
                          "Select field_content " +
                          "FROM sierra_view.varfield_view " +
                          "LEFT JOIN  sierra_view.order_view " +
                          "ON sierra_view.varfield_view.record_num=sierra_view.order_view.record_num " +
                          "where varfield_view.varfield_type_code = 's' " +
                          "and order_view.record_num = " + row.record_number, function(err, result3){
                              if (err) console.log(err);
                              if (result3.rows && result3.rows[0]) result.rows[index].requestor = result3.rows[0].field_content;
                              callback();
                          });
                      
              });
          }, function(err){

              //Create an array of years, 2012 to present
              var years = [];
              var startYear = 2012;
              var iterYear = startYear;
              Async.whilst(function(){return iterYear <= Number(currentFiscalEndYear);}, function(callback){
                  years.push(iterYear);
                  iterYear++;
                  callback(null);
              }, function(err){
                  var selectedYear = (req.query.year) ? (req.query.year) : Number(currentFiscalEndYear);
                  var resultRowsCopy = result.rows;
                  var totalPaidAmt = 0;
                  _.forEach(resultRowsCopy, function(value){

                      if (value.paid_amt == null) value.paid_amt = 0;

                      totalPaidAmt += parseFloat(value.paid_amt);              
                  });

                  var appropriation = 0;
                  var encumbrance = 0;
                  var free_balance = 0;
                  var cash_balance = 0;
                  var addFields = {};

                  var query = sierra.query("" +
                  "SELECT " +
                  "fund_myuser.fund_master_id, " +
                  "name, " +
                  "to_char((appropriation::decimal)/100::float8, '999999.99') as appropriation, " +
                  "to_char((expenditure::decimal)/100::float8, '999999.99') as expenditure, " +
                  "to_char((encumbrance::decimal)/100::float8, '999999.99') as encumbrance, " +
                  "to_char(((appropriation::decimal)/100::float8 -(encumbrance::decimal)/100::float8 -(expenditure::decimal)/100::float8), '999999.99') AS free_balance, " +
                  "to_char(((appropriation::decimal)/100::float8 -(expenditure::decimal)/100::float8), '999999.99') as cash_balance " +
                  "FROM sierra_view.fund_myuser " +
                  "WHERE  fund_type='fbal' " +
                  "and acct_unit='3' " +
                  "AND note1='Departmental Funds'" +
                  "AND fund_master_id=" + req.params.id + " " +
                  "OR note1='Fund Report'", function(err, result4){
                      if (err) console.log(err);
                      if (result4.rows && result4.rows[0]) {
                          appropriation = result4.rows[0].appropriation;
                          encumbrance = result4.rows[0].encumbrance;
                          free_balance = result4.rows[0].free_balance;
                          cash_balance = result4.rows[0].cash_balance;     
                          
                          addFields = {
                              appropriation: appropriation,
                              encumbrance: encumbrance,
                              free_balance: free_balance,
                              cash_balance: cash_balance
                          };

                          console.log (totalPaidAmt);

                          res.render('fund-report-detail', {
                              layout: 'layout',
                              title: 'Departmental Funds',
                              result: result.rows,
                              years: years,
                              selectedYear: selectedYear,
                              selectedDepartment: req.query.department,
                              totalPaidAmt: Math.round(totalPaidAmt * 100) / 100,
                              addFields: (selectedYear == Number(currentFiscalEndYear)) ? addFields : null,
                          });
                      }
                  });

              });
          });
          else res.send("There was an error processing the request.");
      });
});

//GET summon-deletes route
router.get('/summon-deletes', Config.ensureAuthenticated, function(req, res, next){
  //Get start and end date
  var today = new Date();

  var startDate = (req.query.startDate) ? moment(req.query.startDate).format("YYYYMMDD") : moment().subtract(10, "days").format("YYYYMMDD");
  var endDate = (req.query.endDate) ? moment(req.query.endDate).format("YYYYMMDD") : moment().format("YYYYMMDD");
  //Run Query on sierra
  var query = sierra.query("SELECT COUNT ( deletion_date_gmt ), deletion_date_gmt " +
      "FROM  sierra_view.record_metadata " +
      "where record_type_code='b' " +
      "and deletion_date_gmt >= '" + startDate + "' " +
      "and deletion_date_gmt < '" + endDate + "' " +
      "GROUP BY deletion_date_gmt " +
      "ORDER BY deletion_date_gmt ", function(err, result){
    res.render('summon-deletes', {
      layout: 'layout',
      title: 'Summon Deletes',
      result: result.rows,
      startDate: String(moment(startDate, "YYYYMMDD").format("MM/DD/YYYY")),
      endDate: String(moment(endDate, "YYYYMMDD").format("MM/DD/YYYY")),
    });
  });
});

//Summon Deletes Details route
router.get('/summon-deletes/:date', Config.ensureAuthenticated, function(req, res, next){
  //Get start and end date
  var dateToUse = moment(req.params.date, "YYYY-MM-DD");

  var startDate = moment(dateToUse).format("YYYYMMDD");
  var endDate = moment(dateToUse).add(1, 'days').format("YYYYMMDD");

  //Run Query on sierra
  var query = sierra.query("SELECT 'b'||record_num||'a' AS record_number," +
      "deletion_date_gmt " +
      "FROM  sierra_view.record_metadata " +
      "where record_type_code='b' " +
      "and deletion_date_gmt >= '" + startDate + "' " +
      "and deletion_date_gmt < '" + endDate + "' " +
      "ORDER BY deletion_date_gmt ", function(err, result){

    //If downloading text File
    var fileText = '';
    result.rows.forEach(function(row) {
      fileText += row.record_number;
      fileText += '\r\n';
    });

    res.render('summon-deletes-detail', {
      layout: 'layout',
      title: 'Summon Deletes',
      result: result.rows,
      startDate: String(moment(startDate, "YYYYMMDD").format("MM/DD/YYYY")),
      endDate: String(moment(endDate, "YYYYMMDD").format("MM/DD/YYYY")),
    });
  });
});

// Overdue items search list
router.get('/overdue-items', Config.ensureAuthenticated, function(req, res, next){
    //Get start and end date
    var today = new Date();
  
    var startDate = (req.query.startDate) ? moment(req.query.startDate).format("YYYYMMDD") : moment().subtract(7, "days").format("YYYYMMDD");
    var endDate = (req.query.endDate) ? moment(req.query.endDate).format("YYYYMMDD") : moment().subtract(1, "days").format("YYYYMMDD");

    //Run Query on sierra
    var query = sierra.query("" +
    "SELECT item_view.id AS id, " +
    "bib_record_property.best_title AS best_title, " +
    "item_view.barcode AS barcode, " +
    "item_view.copy_num AS copy_num, " +
    "replace(item_record_property.call_number,'|a','') callnumber, " +
    "last_name||','||first_name AS current_patron, " +
    "item_view.location_code AS location_code, " +
    "item_status_code, " +
    "location_name.name AS location_name " +
    
    "FROM sierra_view.item_view " +
    "LEFT JOIN sierra_view.bib_record_item_record_link " +
    "ON sierra_view.item_view.id=sierra_view.bib_record_item_record_link.item_record_id " +
    "LEFT JOIN sierra_view.bib_record_property " +
    "ON sierra_view.bib_record_item_record_link.bib_record_id=sierra_view.bib_record_property.bib_record_id " +
    "LEFT JOIN sierra_view.item_record_property " +
    "ON sierra_view.item_view.id=sierra_view.item_record_property.item_record_id " +
    "LEFT JOIN sierra_view.checkout " +
    "ON sierra_view.item_view.id=sierra_view.checkout.item_record_id " +
    "LEFT JOIN sierra_view.patron_record_fullname " +
    "ON sierra_view.checkout.patron_record_id=sierra_view.patron_record_fullname .patron_record_id " +
    "LEFT JOIN sierra_view.location " +
    "ON sierra_view.item_view.location_code = sierra_view.location.code " +
    "LEFT JOIN sierra_view.location_name " +
    "ON sierra_view.location.id = sierra_view.location_name.location_id " +

    "WHERE overdue_count>=3 " +
    "AND to_char(overdue_gmt, 'yyyymmdd') >= '"+ startDate +"' " +
    "AND to_char(overdue_gmt, 'yyyymmdd') <= '"+ endDate +"' ", function(err, result){

        res.render('overdue-items', {
            layout: 'layout',
            title: 'Overdue Items',
            result: result.rows,
            startDate: String(moment(startDate, "YYYYMMDD").format("MM/DD/YYYY")),
            endDate: String(moment(endDate, "YYYYMMDD").format("MM/DD/YYYY")),
        });
    });

});

// Item status reports
router.get('/item-status', Config.ensureAuthenticated, function(req, res, next){
    //Get start and end date
    var today = new Date();
    
    var startDate = (req.query.startDate) ? moment(req.query.startDate).format("YYYYMMDD") : moment().subtract(7, "days").format("YYYYMMDD");
    var endDate = (req.query.endDate) ? moment(req.query.endDate).format("YYYYMMDD") : moment().subtract(1, "days").format("YYYYMMDD");

    var type = (req.query.type) ? (req.query.type) : 'n';
    var queryDate = (req.query.queryDate) ? Number(req.query.queryDate) : 0;

    var queryDateArray = [
        'checkout.overdue_gmt',
        'checkout.due_gmt',
        'checkout.checkout_gmt',
        'item_view.last_checkin_gmt',
        'item_view.last_checkout_gmt',
        'record_metadata.record_last_updated_gmt',
        null]

    queryDate = queryDateArray[queryDate];

    //Run Query on sierra
    var sql = "" +
    "SELECT item_view.id AS id, " +
    "bib_record_property.best_title AS best_title, " +
    "item_view.barcode AS barcode, " +
    "item_view.copy_num AS copy_num, " +
    "replace(item_record_property.call_number,'|a','') callnumber, " +
    "location_name.name AS location_name " +
    "FROM sierra_view.item_view " +
    "LEFT JOIN sierra_view.bib_record_item_record_link " +
    "ON sierra_view.item_view.id=sierra_view.bib_record_item_record_link.item_record_id " +
    "LEFT JOIN sierra_view.bib_record_property " +
    "ON sierra_view.bib_record_item_record_link.bib_record_id=sierra_view.bib_record_property.bib_record_id " +
    "LEFT JOIN sierra_view.item_record_property " +
    "ON sierra_view.item_view.id=sierra_view.item_record_property.item_record_id " +
    "LEFT JOIN sierra_view.checkout " +
    "ON sierra_view.item_view.id=sierra_view.checkout.item_record_id " +
    "LEFT JOIN sierra_view.location " +
    "ON sierra_view.item_view.location_code = sierra_view.location.code " +
    "LEFT JOIN sierra_view.location_name " +
    "ON sierra_view.location.id = sierra_view.location_name.location_id " + 
    "WHERE item_status_code = '"+ type +"' ";
    sql += (queryDate) ? "AND to_char("+queryDate+", 'yyyymmdd') >= '" + startDate + "' " : ""; 
    sql += (queryDate) ? "AND to_char("+queryDate+", 'yyyymmdd') <= '" + endDate + "' " : "";
    
    var query = sierra.query(sql, function(err, result){
        if (err) console.log(err);

        res.render('item-status-reports', {
            layout: 'layout',
            title: 'Item Status Reports',
            result: result.rows,
            startDate: String(moment(startDate, "YYYYMMDD").format("MM/DD/YYYY")),
            endDate: String(moment(endDate, "YYYYMMDD").format("MM/DD/YYYY")),
            type: type,
            queryDate: req.query.queryDate,
        });

    });
});

//GET continuing resources routes
router.get('/continuing-resources', Config.ensureAuthenticated, function(req, res, next){
    res.redirect('/continuing-resources/main');
});

router.get('/continuing-resources/main', Config.ensureAuthenticated, function(req, res, next){
    // show the UNCW Subscription overview
    var query = sierra.query("SELECT " +
    "fund_master_id, " +
    "name, " +
    "to_char((appropriation::decimal)/100::float8, '9999999.99') as appropriation,  to_char((expenditure::decimal)/100::float8, '9999999.99') as expenditure, " + 
    "to_char((encumbrance::decimal)/100::float8, '9999999.99') as encumbrance, " +
    "to_char(((appropriation::decimal)/100::float8 -((expenditure::decimal)/100::float8 + (encumbrance::decimal)/100::float8)), '9999999.99') as free_balance, " +
    "to_char(((appropriation::decimal)/100::float8 -(expenditure::decimal)/100::float8), '9999999.99') as cash_balance " +
    "FROM sierra_view.fund_myuser " +
    "WHERE  fund_type='fbal' " +
    "and (fund_code='ser' or fund_code='sere') " +
    "and acct_unit='3' ", function (err, result){

        var startYear = ((new Date()).getMonth() < 6) ? String(Number((new Date()).getFullYear()) - 1) : String(Number((new Date()).getFullYear()));
        var endYear = ((new Date()).getMonth() < 6) ? String(Number((new Date()).getFullYear())) : String(Number((new Date()).getFullYear()) + 1);

          //For each department we need to run detailed query and sum the price amount of the results
          Async.eachOf(result.rows, function(department, index, callback){
                          var queryStartDate = (req.query.year) ? String(Number(req.query.year) - 1) + "-07-01" : startYear + "-07-01";
                          var queryEndDate = (req.query.year) ? String(Number(req.query.year)) + "-06-30" : endYear + "-06-30";
                          var query = sierra.query("select sum(round(((discount_amt/nullif(subtotal_amt,0))*paid_amt)+((shipping_amt/nullif(subtotal_amt,0)))*paid_amt)+paid_amt,2)) " +
                            "From sierra_view.order_record_cmf " +
                            
                            "LEFT JOIN sierra_view.fund_master " +
                            "ON sierra_view.fund_master.code_num::text=ltrim(sierra_view.order_record_cmf.fund_code, '0') " +
                            
                            "Left Join sierra_view.order_view " +
                            "ON sierra_view.order_view.record_id=sierra_view.order_record_cmf.order_record_id " +
                            
                            "Left Join sierra_view.order_status_property_myuser " +
                            "ON sierra_view.order_status_property_myuser.code=sierra_view.order_view.order_status_code " +
                            
                            "LEFT JOIN sierra_view.invoice_record_line " +
                            "ON sierra_view.invoice_record_line.order_record_metadata_id=sierra_view.order_view.record_id " +
                            
                            "LEFT JOIN sierra_view.invoice_view " +
                            "ON sierra_view.invoice_record_line.invoice_record_id=sierra_view.invoice_view.id " +
                            
                            "LEFT JOIN sierra_view.user_defined_ocode3_myuser " +
                            "ON sierra_view.user_defined_ocode3_myuser.code=sierra_view.order_view.ocode3 " +
                            
                            "LEFT JOIN sierra_view.bib_record_order_record_link " +
                            "ON sierra_view.bib_record_order_record_link.order_record_id=sierra_view.order_view.record_id " +
                            
                            "LEFT JOIN sierra_view.bib_record_property " +
                            "ON sierra_view.bib_record_property.bib_record_id=sierra_view.bib_record_order_record_link.bib_record_id " +
                            
                            "LEFT JOIN sierra_view.material_property_myuser " +
                            "ON sierra_view.material_property_myuser.code=sierra_view.bib_record_property.material_code " +
                            
                            "where " +
                            
                            
                            "fund_master.id='" + department.fund_master_id + "' " +
                            "and posted_date_gmt>='"+ queryStartDate +"' " +
                            "and posted_date_gmt<='"+ queryEndDate +"' ", function(err, result2){
                                  if (err) console.log(err);

                                  if (result2) {
                                      result.rows[index].total_amt = (result2.rows[0].sum) ? (result2.rows[0].sum) : 0;
                                  } else {
                                      result.rows[index].total_amt = 0;
                                  }
                                  
                                  callback();
            
                              });
                      }, function(err, paid_amt_sum){
                          if (err) console.log(err);
                          console.log("CALLBACK");
                          console.log(result.rows);
                          //Create an array of years, 2012 to present
                          var years = [];
                          var startYear = 2012;
                          var iterYear = startYear;
                          Async.whilst(function(){return iterYear <= Number(endYear);}, function(callback){
                              years.push(iterYear);
                              iterYear++;
                              callback(null);
                          }, function(err){
                              var selectedYear = (req.query.year) ? (req.query.year) : Number(endYear);
                              res.render('continuing-resources-main', {
                                  layout: 'layout',
                                  title: 'UNCW Subscriptions',
                                  result: result.rows,
                                  years: years,
                                  selectedYear: selectedYear,
                                  showAddFields: (selectedYear == Number(endYear))
                              });
                          });
                      }) ;










        // res.render('continuing-resources-main', {
        //     layout: 'layout',
        //     title: 'UNCW Subscriptions',
        //     result: result.rows,
        //     startYear,
        //     endYear,
        // });
    });
});

router.get('/continuing-resources/physical', Config.ensureAuthenticated, function(req, res, next){
    var currentFiscalStartYear = ((new Date()).getMonth() < 6) ? String(Number((new Date()).getFullYear()) - 1) : String(Number((new Date()).getFullYear()));
    var currentFiscalEndYear = ((new Date()).getMonth() < 6) ? String(Number((new Date()).getFullYear())) : String(Number((new Date()).getFullYear()) + 1);
    var queryStartDate = (req.query.year) ? String(Number(req.query.year) - 1) + "-07-01" : currentFiscalStartYear + "-07-01";
    var queryEndDate = (req.query.year) ? String(Number(req.query.year)) + "-06-30" : currentFiscalEndYear + "-06-30";
    
    var query = sierra.query("Select best_title,sierra_view.material_property_myuser.name,'o'||order_view.record_num||'a' AS order_record,user_defined_ocode3_myuser.name,round(((discount_amt/nullif(subtotal_amt,0))*paid_amt)+((shipping_amt/nullif(subtotal_amt,0))*paid_amt)+paid_amt,2)::text as amt_paid ,to_char(posted_date_gmt, 'YYYYMMDD')::text,replace(replace(replace(replace(replace(ocode1,'p','PERIODICAL'),'f','ELECTRONIC RES'),'l','MICROFILM'),'s','SERIAL'),'m','MONOGRAPH'),vendor_record_code,replace(replace(replace(replace(order_status_code,'g','SERIAL LIENED'),'f','SERIAL NO ENC'),'a','FULLY PAID'),'z','CANCELLED') " +   
    "From sierra_view.order_record_cmf " + 

    "Left Join sierra_view.order_view " +
    "ON sierra_view.order_view.record_id=sierra_view.order_record_cmf.order_record_id " +
    
    "Left Join sierra_view.order_status_property_myuser " +
    "ON sierra_view.order_status_property_myuser.code=sierra_view.order_view.order_status_code " +
    
    "LEFT JOIN sierra_view.invoice_record_line " +
    "ON sierra_view.invoice_record_line.order_record_metadata_id=sierra_view.order_view.record_id " +
    
    "LEFT JOIN sierra_view.invoice_view " +
    "ON sierra_view.invoice_record_line.invoice_record_id=sierra_view.invoice_view.id " +
    
    "LEFT JOIN sierra_view.user_defined_ocode3_myuser " + 
    "ON sierra_view.user_defined_ocode3_myuser.code=sierra_view.order_view.ocode3 " +
    
    "LEFT JOIN sierra_view.bib_record_order_record_link " +
    "ON sierra_view.bib_record_order_record_link.order_record_id=sierra_view.order_view.record_id " +
    
    "LEFT JOIN sierra_view.bib_record_property " + 
    "ON sierra_view.bib_record_property.bib_record_id=sierra_view.bib_record_order_record_link.bib_record_id " +
    
    "LEFT JOIN sierra_view.material_property_myuser " +
    "ON sierra_view.material_property_myuser.code=sierra_view.bib_record_property.material_code " +
    
    "where " +
    
    "invoice_record_line.fund_code='00027' " +/*print subscriptions =00027 and electronic is 00032 */
    
    "and posted_date_gmt>='" + queryStartDate + "' " +/*current fiscal year start */
    "and posted_date_gmt<='" + queryEndDate + "' " +/*current fiscal year end */    
    
    "union all " +
    
    "( " +
    
    "Select best_title,sierra_view.material_property_myuser.name,'o'||order_view.record_num||'a' AS order_record,user_defined_ocode3_myuser.name,'0' as amt_paid ,'-' as posted_date_gmt, replace(replace(replace(replace(replace(ocode1,'p','PERIODICAL'),'f','ELECTRONIC RES'),'l','MICROFILM'),'s','SERIAL'),'m','MONOGRAPH'),vendor_record_code,replace(replace(replace(replace(order_status_code,'g','SERIAL LIENED'),'f','SERIAL NO ENC'),'a','FULLY PAID'),'z','CANCELLED') " +
    
    "From sierra_view.order_record_cmf " +
    
    "Left Join sierra_view.order_view " +
    "ON sierra_view.order_view.record_id=sierra_view.order_record_cmf.order_record_id " +
    
    "Left Join sierra_view.order_status_property_myuser " +
    "ON sierra_view.order_status_property_myuser.code=sierra_view.order_view.order_status_code " +
    
    
    
    "LEFT JOIN sierra_view.user_defined_ocode3_myuser " +
    "ON sierra_view.user_defined_ocode3_myuser.code=sierra_view.order_view.ocode3 " +
    
    "LEFT JOIN sierra_view.bib_record_order_record_link " +
    "ON sierra_view.bib_record_order_record_link.order_record_id=sierra_view.order_view.record_id " +
    
    "LEFT JOIN sierra_view.bib_record_property " +
    "ON sierra_view.bib_record_property.bib_record_id=sierra_view.bib_record_order_record_link.bib_record_id " +
    
    "LEFT JOIN sierra_view.material_property_myuser " +
    "ON sierra_view.material_property_myuser.code=sierra_view.bib_record_property.material_code " +
    
    "where " +
    
    "order_record_cmf.fund_code='00027' " +
    "and  order_status_code !='z' " +
    
    
    "except " +
    
    
    "Select best_title,sierra_view.material_property_myuser.name,'o'||order_view.record_num||'a' AS order_record,user_defined_ocode3_myuser.name,'0' as amt_paid ,'-' as posted_date_gmt,replace(replace(replace(replace(replace(ocode1,'p','PERIODICAL'),'f','ELECTRONIC RES'),'l','MICROFILM'),'s','SERIAL'),'m','MONOGRAPH'),vendor_record_code,replace(replace(replace(replace(order_status_code,'g','SERIAL LIENED'),'f','SERIAL NO ENC'),'a','FULLY PAID'),'z','CANCELLED') " +
    
    "From sierra_view.order_record_cmf " +
    
    
    
    "Left Join sierra_view.order_view " +
    "ON sierra_view.order_view.record_id=sierra_view.order_record_cmf.order_record_id " +
    
    "Left Join sierra_view.order_status_property_myuser " +
    "ON sierra_view.order_status_property_myuser.code=sierra_view.order_view.order_status_code " +
    
    "LEFT JOIN sierra_view.invoice_record_line " + 
    "ON sierra_view.invoice_record_line.order_record_metadata_id=sierra_view.order_view.record_id " +
    
    "LEFT JOIN sierra_view.invoice_view " +
    "ON sierra_view.invoice_record_line.invoice_record_id=sierra_view.invoice_view.id " +
    
    "LEFT JOIN sierra_view.user_defined_ocode3_myuser " +
    "ON sierra_view.user_defined_ocode3_myuser.code=sierra_view.order_view.ocode3 " +
    
    "LEFT JOIN sierra_view.bib_record_order_record_link " +
    "ON sierra_view.bib_record_order_record_link.order_record_id=sierra_view.order_view.record_id " +
    
    "LEFT JOIN sierra_view.bib_record_property " +
    "ON sierra_view.bib_record_property.bib_record_id=sierra_view.bib_record_order_record_link.bib_record_id " +
    
    "LEFT JOIN sierra_view.material_property_myuser " +
    "ON sierra_view.material_property_myuser.code=sierra_view.bib_record_property.material_code " +
    
    "where " +
    
    "invoice_record_line.fund_code='00027' " +
    
    "and posted_date_gmt>='" + queryStartDate + "' " +/*current fiscal year start */
    "and posted_date_gmt<='" + queryEndDate + "' " +/*current fiscal year end */    
    
    ")", function(err, result){
        if (err) console.log(err);

        //Create an array of years, 2012 to present
        var years = [];
        var startYear = 2012;
        var iterYear = startYear;
        Async.whilst(function(){return iterYear <= Number(currentFiscalEndYear);}, function(callback){
            years.push(iterYear);
            iterYear++;
            callback(null);
        }, function(err){
            if (err) console.log(err);
            var selectedYear = (req.query.year) ? (req.query.year) : Number(currentFiscalEndYear);
            res.render('continuing-resources-physical-electronic', {
                layout: 'layout',
                title: 'UNCW Subscriptions - Physical',
                result: result.rows,
                startYear: currentFiscalStartYear,
                endYear: currentFiscalEndYear,
                years,
                selectedYear,
            });
        });
    });
});

router.get('/continuing-resources/electronic', Config.ensureAuthenticated, function(req, res, next){
    var currentFiscalStartYear = ((new Date()).getMonth() < 6) ? String(Number((new Date()).getFullYear()) - 1) : String(Number((new Date()).getFullYear()));
    var currentFiscalEndYear = ((new Date()).getMonth() < 6) ? String(Number((new Date()).getFullYear())) : String(Number((new Date()).getFullYear()) + 1);
    var queryStartDate = (req.query.year) ? String(Number(req.query.year) - 1) + "-07-01" : currentFiscalStartYear + "-07-01";
    var queryEndDate = (req.query.year) ? String(Number(req.query.year)) + "-06-30" : currentFiscalEndYear + "-06-30";

    var query = sierra.query("Select best_title,sierra_view.material_property_myuser.name,'o'||order_view.record_num||'a' AS order_record,user_defined_ocode3_myuser.name,round(((discount_amt/nullif(subtotal_amt,0))*paid_amt)+((shipping_amt/nullif(subtotal_amt,0))*paid_amt)+paid_amt,2)::text as amt_paid ,to_char(posted_date_gmt, 'YYYYMMDD')::text,replace(replace(replace(replace(replace(ocode1,'p','PERIODICAL'),'f','ELECTRONIC RES'),'l','MICROFILM'),'s','SERIAL'),'m','MONOGRAPH'),vendor_record_code,replace(replace(replace(replace(order_status_code,'g','SERIAL LIENED'),'f','SERIAL NO ENC'),'a','FULLY PAID'),'z','CANCELLED') " +   
    "From sierra_view.order_record_cmf " + 

    "Left Join sierra_view.order_view " +
    "ON sierra_view.order_view.record_id=sierra_view.order_record_cmf.order_record_id " +
    
    "Left Join sierra_view.order_status_property_myuser " +
    "ON sierra_view.order_status_property_myuser.code=sierra_view.order_view.order_status_code " +
    
    "LEFT JOIN sierra_view.invoice_record_line " +
    "ON sierra_view.invoice_record_line.order_record_metadata_id=sierra_view.order_view.record_id " +
    
    "LEFT JOIN sierra_view.invoice_view " +
    "ON sierra_view.invoice_record_line.invoice_record_id=sierra_view.invoice_view.id " +
    
    "LEFT JOIN sierra_view.user_defined_ocode3_myuser " + 
    "ON sierra_view.user_defined_ocode3_myuser.code=sierra_view.order_view.ocode3 " +
    
    "LEFT JOIN sierra_view.bib_record_order_record_link " +
    "ON sierra_view.bib_record_order_record_link.order_record_id=sierra_view.order_view.record_id " +
    
    "LEFT JOIN sierra_view.bib_record_property " + 
    "ON sierra_view.bib_record_property.bib_record_id=sierra_view.bib_record_order_record_link.bib_record_id " +
    
    "LEFT JOIN sierra_view.material_property_myuser " +
    "ON sierra_view.material_property_myuser.code=sierra_view.bib_record_property.material_code " +
    
    "where " +
    
    "invoice_record_line.fund_code='00032' " +/*print subscriptions =00027 and electronic is 00032 */
    
    "and posted_date_gmt>='" + queryStartDate + "' " +/*current fiscal year start */
    "and posted_date_gmt<='" + queryEndDate + "' " +/*current fiscal year end */    

    "union all " +
    
    "( " +
    
    "Select best_title,sierra_view.material_property_myuser.name,'o'||order_view.record_num||'a' AS order_record,user_defined_ocode3_myuser.name,'0' as amt_paid ,'-' as posted_date_gmt, replace(replace(replace(replace(replace(ocode1,'p','PERIODICAL'),'f','ELECTRONIC RES'),'l','MICROFILM'),'s','SERIAL'),'m','MONOGRAPH'),vendor_record_code,replace(replace(replace(replace(order_status_code,'g','SERIAL LIENED'),'f','SERIAL NO ENC'),'a','FULLY PAID'),'z','CANCELLED') " +
    
    "From sierra_view.order_record_cmf " +
    
    "Left Join sierra_view.order_view " +
    "ON sierra_view.order_view.record_id=sierra_view.order_record_cmf.order_record_id " +
    
    "Left Join sierra_view.order_status_property_myuser " +
    "ON sierra_view.order_status_property_myuser.code=sierra_view.order_view.order_status_code " +
    
    
    
    "LEFT JOIN sierra_view.user_defined_ocode3_myuser " +
    "ON sierra_view.user_defined_ocode3_myuser.code=sierra_view.order_view.ocode3 " +
    
    "LEFT JOIN sierra_view.bib_record_order_record_link " +
    "ON sierra_view.bib_record_order_record_link.order_record_id=sierra_view.order_view.record_id " +
    
    "LEFT JOIN sierra_view.bib_record_property " +
    "ON sierra_view.bib_record_property.bib_record_id=sierra_view.bib_record_order_record_link.bib_record_id " +
    
    "LEFT JOIN sierra_view.material_property_myuser " +
    "ON sierra_view.material_property_myuser.code=sierra_view.bib_record_property.material_code " +
    
    "where " +
    
    "order_record_cmf.fund_code='00032' " +
    "and  order_status_code !='z' " +
    
    
    "except " +
    
    
    "Select best_title,sierra_view.material_property_myuser.name,'o'||order_view.record_num||'a' AS order_record,user_defined_ocode3_myuser.name,'0' as amt_paid ,'-' as posted_date_gmt,replace(replace(replace(replace(replace(ocode1,'p','PERIODICAL'),'f','ELECTRONIC RES'),'l','MICROFILM'),'s','SERIAL'),'m','MONOGRAPH'),vendor_record_code,replace(replace(replace(replace(order_status_code,'g','SERIAL LIENED'),'f','SERIAL NO ENC'),'a','FULLY PAID'),'z','CANCELLED') " +
    
    "From sierra_view.order_record_cmf " +
    
    
    
    "Left Join sierra_view.order_view " +
    "ON sierra_view.order_view.record_id=sierra_view.order_record_cmf.order_record_id " +
    
    "Left Join sierra_view.order_status_property_myuser " +
    "ON sierra_view.order_status_property_myuser.code=sierra_view.order_view.order_status_code " +
    
    "LEFT JOIN sierra_view.invoice_record_line " + 
    "ON sierra_view.invoice_record_line.order_record_metadata_id=sierra_view.order_view.record_id " +
    
    "LEFT JOIN sierra_view.invoice_view " +
    "ON sierra_view.invoice_record_line.invoice_record_id=sierra_view.invoice_view.id " +
    
    "LEFT JOIN sierra_view.user_defined_ocode3_myuser " +
    "ON sierra_view.user_defined_ocode3_myuser.code=sierra_view.order_view.ocode3 " +
    
    "LEFT JOIN sierra_view.bib_record_order_record_link " +
    "ON sierra_view.bib_record_order_record_link.order_record_id=sierra_view.order_view.record_id " +
    
    "LEFT JOIN sierra_view.bib_record_property " +
    "ON sierra_view.bib_record_property.bib_record_id=sierra_view.bib_record_order_record_link.bib_record_id " +
    
    "LEFT JOIN sierra_view.material_property_myuser " +
    "ON sierra_view.material_property_myuser.code=sierra_view.bib_record_property.material_code " +
    
    "where " +
    
    "invoice_record_line.fund_code='00032' " +
    
    "and posted_date_gmt>='" + queryStartDate + "' " +/*current fiscal year start */
    "and posted_date_gmt<='" + queryEndDate + "' " +/*current fiscal year end */
    
    ")", function(err, result){
        if (err) console.log(err);

        var currentFiscalStartYear = ((new Date()).getMonth() < 6) ? String(Number((new Date()).getFullYear()) - 1) : String(Number((new Date()).getFullYear()));
        var currentFiscalEndYear = ((new Date()).getMonth() < 6) ? String(Number((new Date()).getFullYear())) : String(Number((new Date()).getFullYear()) + 1);

        //Create an array of years, 2012 to present
        var years = [];
        var startYear = 2012;
        var iterYear = startYear;
        Async.whilst(function(){return iterYear <= Number(currentFiscalEndYear);}, function(callback){
            years.push(iterYear);
            iterYear++;
            callback(null);
        }, function(err){
            if (err) console.log(err);
            var selectedYear = (req.query.year) ? (req.query.year) : Number(currentFiscalEndYear);
            res.render('continuing-resources-physical-electronic', {
                layout: 'layout',
                title: 'UNCW Subscriptions - Electronic',
                result: result.rows,
                startYear: currentFiscalStartYear,
                endYear: currentFiscalEndYear,
                selectedYear,
                years
            });
        });
    });
});

router.get('/continuing-resources/physical/:vendor', Config.ensureAuthenticated, function(req, res, next){
    var vendor = req.params.vendor;
    var currentFiscalStartYear = ((new Date()).getMonth() < 6) ? String(Number((new Date()).getFullYear()) - 1) : String(Number((new Date()).getFullYear()));
    var currentFiscalEndYear = ((new Date()).getMonth() < 6) ? String(Number((new Date()).getFullYear())) : String(Number((new Date()).getFullYear()) + 1);
    var queryStartDate = (req.query.year) ? String(Number(req.query.year) - 1) + "-07-01" : currentFiscalStartYear + "-07-01";
    var queryEndDate = (req.query.year) ? String(Number(req.query.year)) + "-06-30" : currentFiscalEndYear + "-06-30";

    var query = sierra.query("Select replace(Title,',','') as Title,'o'||order_view.record_num||'a' AS order_record,round(((discount_amt/nullif(subtotal_amt,0))*paid_amt)+((shipping_amt/nullif(subtotal_amt,0))*paid_amt)+paid_amt,2) as amt_paid ,to_char(posted_date_gmt, 'YYYYMMDD') as posted_date,replace(replace(replace(replace(replace(ocode1,'p','PERIODICAL'),'f','ELECTRONIC RES'),'l','MICROFILM'),'s','SERIAL'),'m','MONOGRAPH') as Material_Type,invoice_view.record_type_code||invoice_view.record_num||'a' as invoice_record,invoice_view.invoice_number_text,invoice_record_line.note as invoice_note " +
    "From sierra_view.order_record_cmf " +

    "Left Join sierra_view.order_view " +
    "ON sierra_view.order_view.record_id=sierra_view.order_record_cmf.order_record_id " +

    "Left Join sierra_view.order_status_property_myuser " +
    "ON sierra_view.order_status_property_myuser.code=sierra_view.order_view.order_status_code " +

    "LEFT JOIN sierra_view.invoice_record_line " +
    "ON sierra_view.invoice_record_line.order_record_metadata_id=sierra_view.order_view.record_id " +

    "LEFT JOIN sierra_view.invoice_view " +
    "ON sierra_view.invoice_record_line.invoice_record_id=sierra_view.invoice_view.id " +

    "LEFT JOIN sierra_view.user_defined_ocode3_myuser " +
    "ON sierra_view.user_defined_ocode3_myuser.code=sierra_view.order_view.ocode3 " +

    "LEFT JOIN sierra_view.bib_record_order_record_link " +
    "ON sierra_view.bib_record_order_record_link.order_record_id=sierra_view.order_view.record_id " + 

    "LEFT JOIN sierra_view.bib_record_property " +
    "ON sierra_view.bib_record_property.bib_record_id=sierra_view.bib_record_order_record_link.bib_record_id " +

    "LEFT JOIN sierra_view.material_property_myuser " +
    "ON sierra_view.material_property_myuser.code=sierra_view.bib_record_property.material_code " +

    "where " +
    "(invoice_record_line.fund_code='00027' ) " +
    "and vendor_record_code='" + vendor + "' " +
    "and posted_date_gmt>='" + queryStartDate + "' " +/*current fiscal year start */
    "and posted_date_gmt<='" + queryEndDate + "' " +/*current fiscal year end */

    "order by best_title ", function(err, result){
        if (err) console.log(err);
        var currentFiscalStartYear = ((new Date()).getMonth() < 6) ? String(Number((new Date()).getFullYear()) - 1) : String(Number((new Date()).getFullYear()));
        var currentFiscalEndYear = ((new Date()).getMonth() < 6) ? String(Number((new Date()).getFullYear())) : String(Number((new Date()).getFullYear()) + 1);

        //Create an array of years, 2012 to present
        var years = [];
        var startYear = 2012;
        var iterYear = startYear;
        Async.whilst(function(){return iterYear <= Number(currentFiscalEndYear);}, function(callback){
            years.push(iterYear);
            iterYear++;
            callback(null);
        }, function(err){
            if (err) console.log(err);
            var selectedYear = (req.query.year) ? (req.query.year) : Number(currentFiscalEndYear);
            res.render('continuing-resources-vendor', {
                layout: 'layout',
                title: 'UNCW Subscriptions - Physical -- ' + vendor,
                result: result.rows,
                startYear: currentFiscalStartYear,
                endYear: currentFiscalEndYear,
                selectedYear,
                years
            });
        });
    });
});

router.get('/continuing-resources/electronic/:vendor', Config.ensureAuthenticated, function(req, res, next){
    var vendor = req.params.vendor;
    var currentFiscalStartYear = ((new Date()).getMonth() < 6) ? String(Number((new Date()).getFullYear()) - 1) : String(Number((new Date()).getFullYear()));
    var currentFiscalEndYear = ((new Date()).getMonth() < 6) ? String(Number((new Date()).getFullYear())) : String(Number((new Date()).getFullYear()) + 1);
    var queryStartDate = (req.query.year) ? String(Number(req.query.year) - 1) + "-07-01" : currentFiscalStartYear + "-07-01";
    var queryEndDate = (req.query.year) ? String(Number(req.query.year)) + "-06-30" : currentFiscalEndYear + "-06-30";
    
    var query = sierra.query("Select replace(Title,',','') as Title,'o'||order_view.record_num||'a' AS order_record,round(((discount_amt/nullif(subtotal_amt,0))*paid_amt)+((shipping_amt/nullif(subtotal_amt,0))*paid_amt)+paid_amt,2) as amt_paid ,to_char(posted_date_gmt, 'YYYYMMDD') as posted_date,replace(replace(replace(replace(replace(ocode1,'p','PERIODICAL'),'f','ELECTRONIC RES'),'l','MICROFILM'),'s','SERIAL'),'m','MONOGRAPH') as Material_Type,invoice_view.record_type_code||invoice_view.record_num||'a' as invoice_record,invoice_view.invoice_number_text,invoice_record_line.note as invoice_note " +
    "From sierra_view.order_record_cmf " +

    "Left Join sierra_view.order_view " +
    "ON sierra_view.order_view.record_id=sierra_view.order_record_cmf.order_record_id " +

    "Left Join sierra_view.order_status_property_myuser " +
    "ON sierra_view.order_status_property_myuser.code=sierra_view.order_view.order_status_code " +

    "LEFT JOIN sierra_view.invoice_record_line " +
    "ON sierra_view.invoice_record_line.order_record_metadata_id=sierra_view.order_view.record_id " +

    "LEFT JOIN sierra_view.invoice_view " +
    "ON sierra_view.invoice_record_line.invoice_record_id=sierra_view.invoice_view.id " +

    "LEFT JOIN sierra_view.user_defined_ocode3_myuser " +
    "ON sierra_view.user_defined_ocode3_myuser.code=sierra_view.order_view.ocode3 " +

    "LEFT JOIN sierra_view.bib_record_order_record_link " +
    "ON sierra_view.bib_record_order_record_link.order_record_id=sierra_view.order_view.record_id " + 

    "LEFT JOIN sierra_view.bib_record_property " +
    "ON sierra_view.bib_record_property.bib_record_id=sierra_view.bib_record_order_record_link.bib_record_id " +

    "LEFT JOIN sierra_view.material_property_myuser " +
    "ON sierra_view.material_property_myuser.code=sierra_view.bib_record_property.material_code " +

    "where " +
    "(invoice_record_line.fund_code='00032' ) " +
    "and vendor_record_code='" + vendor + "' " +
    "and posted_date_gmt>='" + queryStartDate + "' " +/*current fiscal year start */
    "and posted_date_gmt<='" + queryEndDate + "' " +/*current fiscal year end */

    "order by best_title ", function(err, result){
        if (err) console.log(err);
        var currentFiscalStartYear = ((new Date()).getMonth() < 6) ? String(Number((new Date()).getFullYear()) - 1) : String(Number((new Date()).getFullYear()));
        var currentFiscalEndYear = ((new Date()).getMonth() < 6) ? String(Number((new Date()).getFullYear())) : String(Number((new Date()).getFullYear()) + 1);

        //Create an array of years, 2012 to present
        var years = [];
        var startYear = 2012;
        var iterYear = startYear;
        Async.whilst(function(){return iterYear <= Number(currentFiscalEndYear);}, function(callback){
            years.push(iterYear);
            iterYear++;
            callback(null);
        }, function(err){
            if (err) console.log(err);
            var selectedYear = (req.query.year) ? (req.query.year) : Number(currentFiscalEndYear);
            res.render('continuing-resources-vendor', {
                layout: 'layout',
                title: 'UNCW Subscriptions - Electronic -- ' + vendor,
                result: result.rows,
                startYear: currentFiscalStartYear,
                endYear: currentFiscalEndYear,
                selectedYear,
                years
            });
        });
    });    
});

router.get('/continuing-resources/title/:order', Config.ensureAuthenticated, function(req, res, next){
    var orderRecord = String(req.params.order).substring(1, req.params.order.length - 1);
    var view = (req.query.view) ? (req.query.view) : "table"

    var query = sierra.query("" +
        "Select Title,sierra_view.material_property_myuser.name as MaterialTypeName,'o'||order_view.record_num||'a' AS order_record,user_defined_ocode3_myuser.name as ocode3,round(((discount_amt/nullif(subtotal_amt,0))*paid_amt)+((shipping_amt/nullif(subtotal_amt,0))*paid_amt)+paid_amt,2) as amt_paid ,to_char(posted_date_gmt, 'YYYYMMDD') as posted_date,replace(replace(ocode1,'p','PERIODICAL'),'f','ELECTRONIC RES'),vendor_record_code " +
        "From sierra_view.order_record_cmf " +
        
        "Left Join sierra_view.order_view " +
        "ON sierra_view.order_view.record_id=sierra_view.order_record_cmf.order_record_id " +
        
        "Left Join sierra_view.order_status_property_myuser " +
        "ON sierra_view.order_status_property_myuser.code=sierra_view.order_view.order_status_code " +
        
        "LEFT JOIN sierra_view.invoice_record_line " + 
        "ON sierra_view.invoice_record_line.order_record_metadata_id=sierra_view.order_view.record_id " +
        
        "LEFT JOIN sierra_view.invoice_view " +
        "ON sierra_view.invoice_record_line.invoice_record_id=sierra_view.invoice_view.id " + 
        
        "LEFT JOIN sierra_view.user_defined_ocode3_myuser " +
        "ON sierra_view.user_defined_ocode3_myuser.code=sierra_view.order_view.ocode3 " +
        
        "LEFT JOIN sierra_view.bib_record_order_record_link " +
        "ON sierra_view.bib_record_order_record_link.order_record_id=sierra_view.order_view.record_id " +
        
        "LEFT JOIN sierra_view.bib_record_property " +
        "ON sierra_view.bib_record_property.bib_record_id=sierra_view.bib_record_order_record_link.bib_record_id " +
        
        "LEFT JOIN sierra_view.material_property_myuser " +
        "ON sierra_view.material_property_myuser.code=sierra_view.bib_record_property.material_code " +
        
        "where " +
        
        "order_view.record_num='" + orderRecord + "' " +
        
        "order by posted_date desc ", function(err, result){
            if (err) {
                console.log(err);
                res.send('There was an error processing the request.');
            } else {
                if (view == 'table') {
                    res.render('continuing-resources-title-table', {
                        layout: 'layout',
                        title: 'Title Stats',
                        result: result.rows,
                    });
                } else {
                    var currentFiscalStartYear = ((new Date()).getMonth() < 6) ? String(Number((new Date()).getFullYear()) - 1) : String(Number((new Date()).getFullYear()));
                    var currentFiscalEndYear = ((new Date()).getMonth() < 6) ? String(Number((new Date()).getFullYear())) : String(Number((new Date()).getFullYear()) + 1);
            
                    //Create an array of fiscal years, 2012 to present
                    var fiscalYears = [];
                    var startYear = 2005;
                    var iterYear = startYear;
                    Async.whilst(function(){return iterYear <= Number(currentFiscalEndYear);}, function(callback){
                        var yearObject = {
                            name: String(iterYear) + '/' + String(iterYear + 1),
                            startDate: String(iterYear) + '-07-01',
                            endDate: String(iterYear + 1) + '-06-30',
                            totalAmount: 0,
                        }
                        fiscalYears.push(yearObject);
                        iterYear++;
                        callback(null);
                    }, function(err){
                        if (err) console.log(err);

                        Async.eachOf(result.rows, function(row, index, callback){
                            var rowDate = moment(row.posted_date).format('YYYY-MM-DD');
                            
                            var fiscalYear = fiscalYears.find(o => ( (moment(rowDate) >= moment(o.startDate)) && (moment(rowDate) <= moment(o.endDate)) ) );
                            fiscalYear.totalAmount += Number(row.amt_paid);
                            callback(null);
                        }, function (err){
                            if (err) console.log(err);
                            console.log(fiscalYears);
                            res.render('continuing-resources-title-graph', {
                                layout: 'layout',
                                title: 'Title Stats Visualization',
                                data: fiscalYears,
                                name: result.rows[0].title
                            });
                        });
                    });
                }
            }
        });

});

module.exports = router;

