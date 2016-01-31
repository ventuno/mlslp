//gapi wrapper

var util = require('util');
var google = require('googleapis');
var promise_ize = require('./promise_ize').promise_ize;

var CLIENT_ID = process.env.CLIENT_ID;
var CLIENT_SECRET = process.env.CLIENT_SECRET;
var REDIRECT_URL = process.env.REDIRECT_URL;

var OAuth2 = google.auth.OAuth2;
var oauth2Client = new OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URL);
var gmail = google.gmail('v1');

var extend = util._extend;

function getOptions(options) {
  var baseOptions = extend({}, {auth: oauth2Client, userId: 'me'});
  if (options) {
    return extend(baseOptions, options)
  } else {
    return baseOptions;
  }
}

function genericGApiAction(fn, options, handler) {
  var options = getOptions(options);
  return promise_ize(fn, [options], handler);
}

/* oauth2Client specific */
function getToken(code) {
  return promise_ize(oauth2Client.getToken, [code], oauth2Client);
}

function setCredentials () {
  return oauth2Client.setCredentials.apply(oauth2Client, arguments);
}

function generateAuthUrl () {
  return oauth2Client.generateAuthUrl.apply(oauth2Client, arguments);
}

/* gmail api specific */
function sendMessage(email, threadId) {
  var options = {
    resource: {
      raw: email,
      threadId: threadId
    }
  };
  return genericGApiAction(gmail.users.messages.send, options);
}

function listMessages(emailAddress) {
  var options = {
    q: util.format('to:%s is:unread', emailAddress)
  };
  return genericGApiAction(gmail.users.messages.list, options);
}

function getMessage(id) {
  var options = {
    id: id
  };
  return genericGApiAction(gmail.users.messages.get, options);
}

function modifyMessage(id, addLabelIds, removeLabelIds) {
  var options = {
    id: id,
    resource: {
      addLabelIds: addLabelIds || [],
      removeLabelIds: removeLabelIds || []
    }
  };
  return genericGApiAction(gmail.users.messages.modify, options);
}

function setMessageRead(id) {
  return modifyMessage(id, null, ['UNREAD']);
}

function getProfile() {
  return genericGApiAction(gmail.users.getProfile);
}

function watch(topicName) {
  var options = {
    resource: {
      topicName: topicName
    }
  };
  return genericGApiAction(gmail.users.watch, options)
}

module.exports = {
  setCredentials: setCredentials,
  generateAuthUrl: generateAuthUrl,
  getToken: getToken,
  getProfile: getProfile,
  watch: watch,
  sendMessage: sendMessage,
  listMessages: listMessages,
  getMessage: getMessage,
  modifyMessage: modifyMessage,
  setMessageRead: setMessageRead
}