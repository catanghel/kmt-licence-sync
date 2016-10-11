'use strict';

function KMTError(message, status = 500) {
  this.name = "KMTError";
  this.status = status;
  this.message = message || "Unknown KMTError";
  this.stack = (new Error(message)).stack;
}
KMTError.prototype = Object.create(Error.prototype);
KMTError.prototype.constructor = KMTError;

module.exports = KMTError;
