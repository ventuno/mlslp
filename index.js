var express  = require('express');
var session = require('express-session');
var bodyParser = require('body-parser');
var multer  = require('multer');
var mongoose = require('mongoose');

var util = require('util');
var google = require('googleapis');
var CronJob = require('cron').CronJob;
var Q = require('q');

var MIME  = require('./MIME');
var CaffeineClient = require('./CaffeineClient');
var promise_ize = require('./promise_ize').promise_ize;
var model = require('./model');
var Message = model.Message;
var Auth = model.Auth;

var CLIENT_ID = process.env.CLIENT_ID;
var CLIENT_SECRET = process.env.CLIENT_SECRET;
var REDIRECT_URL = process.env.REDIRECT_URL;
var QUIET_PERIOD_START = process.env.QUIET_PERIOD_START;
var QUIET_PERIOD_END = process.env.QUIET_PERIOD_END;
var DEFAULT_RECIPIENT = process.env.DEFAULT_RECIPIENT;
var GCLOUD_PROJECT_ID = process.env.GCLOUD_PROJECT_ID;
var CAFFEINE_CLIENT = process.env.CAFFEINE_CLIENT;

var OAuth2 = google.auth.OAuth2;
var oauth2Client = new OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URL);
var gmail = google.gmail('v1');
var upload = multer({ dest: 'uploads/' });
var caffeineClient = new CaffeineClient(CAFFEINE_CLIENT);

mongoose.connect(process.env.MONGOLAB_URI, function (error) {
  if (error) console.error(error);
  else console.log('mongo connected');
});

new CronJob(util.format('0', '26', QUIET_PERIOD_END, '*', '*', '*'), function() {
  console.log('End of quiet period, sending messages now', new Date());
  Message.aggregate([{$group: {_id: {to: '$to', from: '$from'}, messages: {$push: '$$ROOT'}}}])
    .exec()
    .then(function (data) {
      for (var i = 0; i < data.length; i++) {
        var to = data[i]._id.to;
        var from = data[i]._id.from;
        var messages = data[i].messages;
        promise_ize(Auth.findOne, [{id: from}], Auth).promise.then(function (auth) {
          var tokens = auth.get('tokens');
          oauth2Client.setCredentials(tokens);
          var emailPromises = [];
          for (var j = 0; j < messages.length; j++) {
            emailPromises.push(sendEmail(messages[j]));
          }
          return Q.all(emailPromises)
            .then(function () {
              return promise_ize(mongoose.connection.db.dropCollection, ['messages'], mongoose.connection.db).promise;
            })
            .then(function () {
              console.log('Successfully sent & removed messages');
            });
        })
        .catch(function (err) {
          console.error('Failure', err);
        });
      }
    },
    function (err) {
      console.error('Failure retrieving data', err);
    }
  );
}, null, true, 'UTC');

function sendEmail (message) {
  var threadId = message.threadId
  var email = MIME.MIMEMultipartFromObject(message).asBase64url();
  var options = {
    auth: oauth2Client,
    userId: 'me',
    resource: {
      raw: email,
      threadId: threadId
    }
  };
  return promise_ize(gmail.users.messages.send, [options]).promise;
}

function getJSONError (msg) {
  return {error: msg};
}

express()
  .use(bodyParser.json())
  .use(bodyParser.urlencoded({ extended: true }))
  .use(session({
    secret: CLIENT_SECRET
  }))
  .get('/auth', function (req, res) {
    var url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.readonly']
    });
    return res.redirect(url);
  })
  .get('/oauth2callback', function (req, res) {
    var code = req.query.code;
    promise_ize(oauth2Client.getToken, [code], oauth2Client).promise
      .then(function (tokens) {
        oauth2Client.setCredentials(tokens);
        var options = {auth: oauth2Client, userId: 'me'};
        req.session.googleaccesstoken = tokens;
        return promise_ize(gmail.users.getProfile, [options]).promise;
      })
      .then(function (profile) {
        req.session.emailAddress = profile.emailAddress;
        return promise_ize(Auth.findOne, [{id: profile.emailAddress}], Auth).promise;
      })
      .then(function (auth) {
        var emailAddress = req.session.emailAddress;
        var newTokens = req.session.googleaccesstoken;
        if (!auth) {
          auth = new Auth({
            id: req.session.emailAddress,
            tokens: newTokens
          });
        } else {
          if (newTokens.refresh_token) {
            auth.set('tokens.refresh_token', newTokens.refresh_token);
          }
          auth.set('tokens.access_token', newTokens.access_token);
        }
        return promise_ize(auth.save, [], auth).promise;
      })
      .then(function () {
        return res.redirect('/index.html');
      })
      .catch(function (err) {
        console.log('Failure', err);
        res.json(400).json(getJSONError(err));
      });
  })
  .get('/api', function (req, res) {
    res.status(200).json({msg: 'OK' });
  })
  .post('/api/message', upload.array('pictures'), function (req, res) {
    var tokens = req.session.googleaccesstoken;
    if (!tokens) {
      return res.status(401).json(getJSONError('need auth'));
    }
    var threadId = req.session.threadId || null;
    oauth2Client.setCredentials(tokens);
    var subject = req.body.subject || 'no subject';
    var content = req.body.content;
    var to = req.body.to || DEFAULT_RECIPIENT;
    var from = req.session.emailAddress;
    if (content) {
      var messageObject = {
        date: Date.now(),
        content: content,
        subject: subject,
        to: to,
        from: from,
        attachments: req.files,
        threadId: threadId
      };
      var now = new Date();
      if (now.getUTCHours() >= QUIET_PERIOD_START && now.getUTCHours() <= QUIET_PERIOD_END) {
        if (!caffeineClient.isAwake()) {
          caffeineClient.wakeUp();
        }
        var message = new Message(messageObject);
        message.id = message._id;
        promise_ize(message.save, [], message).promise
          .then(function (message) {
            res.status(200).json({message: message, queued: true});
          }).catch(function (err) {
            res.status(400).json(getJSONError(err));
          });
      } else {
        return sendEmail(messageObject)
          .then(function (msgInfo) {
            if (!threadId) {
              req.session.threadId = msgInfo.threadId;
            }
            console.log('Email successfully delivered');
            return res.status(201).json({message: 'sent'});
          }, function (err) {
            return res.status(400).json(getJSONError(err));
          });
      }
    } else {
      res.status(400).json(getJSONError(err));
    }
  })
  .get(['/', '/index.html'], function (req, res) {
    if (req.session.googleaccesstoken) {
      res.sendFile(__dirname + '/index.html');
    } else {
      res.redirect('/auth');
    }
  })
  .use(express.static(__dirname + '/'))
  .listen(process.env.PORT || 5100);