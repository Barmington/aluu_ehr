/** Creates an Error carrying an HTTP status (and optional extra payload). */
function httpError(status, message, extra = {}) {
  const err = new Error(message);
  err.status = status;
  err.extra = extra;
  return err;
}

module.exports = { httpError };
