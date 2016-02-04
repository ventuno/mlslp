var Q = require('q');

var GApiWrapper = require('./GApiWrapper');
var mlslpUtils = require('./mlslpUtils');

function onError(err) {
 console.log(err);
}

function onMessage(message) {
  subscription.ack(message.ackId, function () {
    console.log('ack', arguments);
  });
  var emailAddress = message.data.emailAddress;
  GApiWrapper.listMessages(mlslpUtils.decorateEmailAddress(emailAddress)).promise
    .then(function (messagesList) {
      console.log(messagesList);
      if (messagesList.resultSizeEstimate > 0) {
        var messages = messagesList.messages;
        var messagePromises = [];
        for (var i = 0; i < messages.length; i++) {
          messagePromises.push(GApiWrapper.getMessage(messages[i].id).promise);
        }
        return Q.all(messagePromises);
      }
      return [];
    })
    .then (function (messages) {
      var messageReadPromises = [];
      if (messages.length > 0) {
        var strippedMessages = [];
        for (var i = 0; i < messages.length; i++) {
          var message = messages[i];
          messageReadPromises.push(GApiWrapper.setMessageRead(message.id).promise);
          var strippedMessage = {
            id: message.id
          };
          var headers = message.payload.headers;
          for (var j = 0; j < headers.length; j++) {
            var header = headers[j];
            if (header.name.toLowerCase() === 'date') {
              strippedMessage.date = new Date(header.value).getTime();
              break;
            }
          }
          if (message.payload.mimeType.indexOf('multipart/' > -1)) {
            var regExps = [/^([\S\s]*)\r\n\r\nOn[\s\S]*<[\s\S]*>/, /^([\S\s]*)\r\n\r\n\d{4}-\d{2}-\d{2}\s{1}\d{2}:\d{2}\s{1}\S{3}\+\d{2}:\d{2}\s{1}<[\s\S]*>:/];
            var convertedMessage = new Buffer(message.payload.parts[0].body.data, 'base64').toString('utf8');
            for (var k = 0; k < regExps.length; k++) {
              var testedMessage = convertedMessage.match(regExps[k]);
              if (testedMessage.length > 1) {
                strippedMessage.text = testedMessage[1];
                break;
              }
            }
            if (!strippedMessage.text) {
              strippedMessage.text = message.snippet;
            }
          } else {
            strippedMessage.text = message.snippet;
          }
          strippedMessages.push(strippedMessage);
        }
        wssConnection.send(emailAddress, JSON.stringify(strippedMessages));
      }
      return Q.all(messageReadPromises);
    })
    .then (function (readMessages) {
      console.log('Read messages', readMessages)
    })
    .catch(function (err) {
      console.error('Failure in MessageClientListener', err);
    });
}

var subscription = null;
var wssConnection = null
function startListening (sub, wss) {
  subscription = sub;
  wssConnection = wss;
  subscription.on('error', onError);
  subscription.on('message', onMessage);
}

module.exports = {
  startListening: startListening
}
