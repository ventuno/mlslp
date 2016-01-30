var promise_ize = require('./promise_ize').promise_ize;
var http = require('http');

function CaffeineClient (host) {
  this._isAwake = false;
  if (!host) {
    throw 'CaffeineClient hostname required';
  }
  this._hostname = host;
}

function httpRequest (hostname, path, method) {
  var options = {
    host: hostname,
    path: path,
    method: method
  };

  var req = promise_ize(http.request, [options]);
  req.ret.end();
  req.promise.then(function (data) {
    this._isAwake = true;
    console.log(data);
  });
}



CaffeineClient.prototype.wakeUp = function () {
  httpRequest(this._hostname, '/api/wakeup', 'GET');
};

CaffeineClient.prototype.isAwake = function () {
  return this._isAwake;
};

module.exports = CaffeineClient;