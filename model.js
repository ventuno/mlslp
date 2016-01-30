var mongoose = require('mongoose');

var MessageSchema = new mongoose.Schema({
  id : String,
  date: Date,
  to : String,
  from : String,
  subject : String,
  content: String,
  attachments: Array,
  threadId: String
});
var Message = mongoose.model('Message', MessageSchema);

var AuthSchema = new mongoose.Schema({
  id : String,
  tokens: Object
});
var Auth = mongoose.model('Auth', AuthSchema);

module.exports = {
  Message: Message,
  Auth: Auth
};