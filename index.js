var express  = require('express');
var session = require('express-session');
var bodyParser = require('body-parser');
var multer  = require('multer');
var mongoose = require('mongoose');
var http = require("http");
var fs = require("fs");

var util = require('util');
var google = require('googleapis');
var CronJob = require('cron').CronJob;
var Q = require('q');

var WSS = require('./wsindex');
var MIME  = require('./MIME');
var CaffeineClient = require('./CaffeineClient');
var promise_ize = require('./promise_ize').promise_ize;
var model = require('./model');
var Message = model.Message;
var Auth = model.Auth;
var subscription = require('./GPubSubMessageClient').subscription;
var MessageClientListener = require('./GPubSubMessageClientListener');
var GApiWrapper = require('./GApiWrapper');
var mlslpUtils = require('./mlslpUtils');
var decorateEmailAddress = mlslpUtils.decorateEmailAddress;
var getJSONError = mlslpUtils.getJSONError;

var CLIENT_SECRET = process.env.CLIENT_SECRET;

var GCLOUD_PROJECT_ID = process.env.GCLOUD_PROJECT_ID;
var GCLOUD_SUBSCRIPTION_NAME = process.env.GCLOUD_SUBSCRIPTION_NAME;

var DEFAULT_RECIPIENT = process.env.DEFAULT_RECIPIENT;
var QUIET_PERIOD_START = process.env.QUIET_PERIOD_START;
var QUIET_PERIOD_END = process.env.QUIET_PERIOD_END;
var CAFFEINE_CLIENT = process.env.CAFFEINE_CLIENT;

var upload = multer({ dest: 'uploads/' });
var caffeineClient = new CaffeineClient(CAFFEINE_CLIENT);
var sessionStore = new session.MemoryStore();
var expressSession = session({secret: CLIENT_SECRET, store: sessionStore});
var app = express();
var server = http.createServer(app);
var wssConnection = WSS(server, sessionStore);

mongoose.connect(process.env.MONGOLAB_URI, function (error) {
  if (error) console.error(error);
  else console.log('mongo connected');
});

new CronJob(util.format('0', '13', QUIET_PERIOD_END, '*', '*', '*'), function() {
  console.log('End of quiet period, sending messages now', new Date());
  Message.aggregate([{$group: {_id: {to: '$to', from: '$from'}, messages: {$push: '$$ROOT'}}}])
    .exec()
    .then(function (data) {
      for (var i = 0; i < data.length; i++) {
        var to = data[i]._id.to;
        var from = data[i]._id.from;
        var messages = data[i].messages;
        //need to search based on the undecorated version of the email
        promise_ize(Auth.findOne, [{id: from.replace(/(\+\S*)@/, '@')}], Auth).promise.then(function (auth) {
          var tokens = auth.get('tokens');
          GApiWrapper.setCredentials(tokens);
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
  var threadId = message.threadId;
  var email = MIME.MIMEMultipartFromObject(message).asBase64url();
  return GApiWrapper.sendMessage(email, threadId).promise;
}

app
  .use(bodyParser.json())
  .use(bodyParser.urlencoded({ extended: true }))
  .use(expressSession)
  .get('/auth', function (req, res) {
    var url = GApiWrapper.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.modify']
    });
    return res.redirect(url);
  })
  .get('/oauth2callback', function (req, res) {
    var code = req.query.code;
    //get oauth2 token
    GApiWrapper.getToken(code).promise
      .then(function (tokens) {
        GApiWrapper.setCredentials(tokens);
        req.session.googleaccesstoken = tokens;
        MessageClientListener.startListening(subscription, wssConnection);
        return GApiWrapper.watch(util.format('projects/%s/topics/%s',GCLOUD_PROJECT_ID, GCLOUD_SUBSCRIPTION_NAME)).promise;
      })
      //get user profile information
      .then(function () {
        return GApiWrapper.getProfile().promise;
      })
      //find auth info
      .then(function (profile) {
        req.session.emailAddress = profile.emailAddress;
        return promise_ize(Auth.findOne, [{id: profile.emailAddress}], Auth).promise;
      })
      //create or update auth info
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
          req.session.threadId = auth.get('threadId');
        }
        return promise_ize(auth.save, [], auth).promise;
      })
      //finally render the index
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
    GApiWrapper.setCredentials(tokens);
    var subject = req.body.subject || 'no subject';
    var content = req.body.content;
    var to = req.body.to || DEFAULT_RECIPIENT;
    var from = req.session.emailAddress;
    var files = req.files || [];
    if (files.length > 0) {
      for (var i = 0; i < files.length; i++) {
        var file = files[i];
        file.data = fs.readFileSync(file.path, {encoding: 'binary'});
      }
    }
    if (content) {
      var messageObject = {
        date: Date.now(),
        content: content,
        subject: subject,
        to: to,
        from: decorateEmailAddress(from),
        attachments: files,
        threadId: threadId,
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
            return promise_ize(Auth.findOne, [{id: req.session.emailAddress}], Auth).promise;
          })
          .then(function (auth) {
            auth.set('threadId', req.session.threadId)
            return promise_ize(auth.save, [], auth).promise;
          }).
          then(function () {
            return res.status(201).json({message: 'sent'});
          })
          .catch(function (err) {
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

server.listen(process.env.PORT || 5100)
