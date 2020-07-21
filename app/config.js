
class Config {
  static ensureAuthenticated (req, res, next) {
    if (req.isAuthenticated()) {
      return next()
    } else {
      res.redirect('/login?path=' + req.path.substr(1, req.path.length))
    }
  }
}

module.exports = Config
