var WebSocketServer = require("ws").Server;
var cookieParser = require('cookie-parser');

var promise_ize = require('./promise_ize').promise_ize;

var CLIENT_SECRET = process.env.CLIENT_SECRET;
var WS_KALIVE_TIMEOUT = process.env.WS_KALIVE_TIMEOUT;

var parser = cookieParser(CLIENT_SECRET);

function WSS (server, store) {
  var wss = new WebSocketServer({server: server});
  var _this = this;
  this._connections = {};
  console.log('websocket server created');

  wss.on("connection", function(ws) {
    if (!ws.upgradeReq && !ws.upgradeReq.headers && !ws.upgradeReq.headers.cookie) {
      return;
    }
    var cookie = cookieParser.signedCookie(decodeURIComponent(ws.upgradeReq.headers.cookie.split('=')[1]), CLIENT_SECRET);
    promise_ize(store.get, [cookie], store).promise.then(function (session) {
      var emailAddress = session.emailAddress;
      var intervalId = null;
      console.log('websocket connection open by', emailAddress);
      _this._connections[session.emailAddress] = ws;

      intervalId = setInterval(function () {
        ws.send(JSON.stringify({msg: "kalive"}));
      }, WS_KALIVE_TIMEOUT);

      ws.on("message", function(msg) {
        console.log('websocket msg', msg, 'by:', emailAddress);
      });

      ws.on("close", function() {
        clearInterval(intervalId);
        _this._connections[session.emailAddress] = null;
        console.log('websocket connection closed by', emailAddress);
      });
    });
  });

  return {
    send: function (emailAddress, msg) {
      var ws = _this._connections[emailAddress];
      if (ws) {
        ws.send(msg);
      }
    }
  };
};

module.exports = WSS
