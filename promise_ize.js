var http = require('http');
var Q = require('q');

function promise_izeHttpRequestCallback (args, promise) {
  var res = args[0];
  var data = '';
  res.on('data', function (dataReceived) {
    data += dataReceived;
  });
  res.on('end', function (dataReceived) {
    data += dataReceived;
    promise.resolve(data);
  });
}

function promise_izeStandardCallback (args, deferred) {
  if (args[0]) {
    deferred.reject(args[0]);
  } else {
    deferred.resolve.apply(null, Array.prototype.slice.call(args, 1));
  }
}

function promise_ize (func, args, handler) {
  args.push(promise_izeCallback);
  var ret = func.apply(handler, args);
  var deferred = new Q.defer();
  function promise_izeCallback () {
    var args = arguments;
    if (ret instanceof http.ClientRequest) {
      promise_izeHttpRequestCallback(args, deferred);
    } else {
      promise_izeStandardCallback(args, deferred);
    }
  }
  return {
    ret: ret,
    promise: deferred.promise
  };
}

module.exports = {
  promise_ize: promise_ize
}