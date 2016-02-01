var fs = require('fs');

function MIMEBase (mainType, subType) {
  this.init(mainType, subType);
}

MIMEBase.prototype.init = function (mainType, subType) {
  this._mainType = mainType;
  this._subType = subType;
  this._headers = {};
};

MIMEBase.prototype.setHeader = function (header, val, values) {
  if (arguments.length == 2) {
    this._headers[header] = val;
  } else if (arguments.length === 3) {
    this._headers[header] = val + '; ' + this._getHeaderValues(values);
  }
};

MIMEBase.prototype._getContentType = function () {
  return this._mainType + '/' + this._subType;
}

MIMEBase.prototype._getHeaderValues = function (values) {
  var returnValues = [];
  if (typeof values === 'object') {
    for (var key in values) {
      var value = values[key];
      returnValues.push(key + '="' + value + '"');
    }
  }
  return returnValues.join('; ');
}

MIMEBase.prototype._setContentTypeHeader = function (values) {
  var contentType = this._getContentType();
  this.setHeader('content-type', contentType, values);
}

MIMEBase.prototype.to = function (to) {
  this.setHeader('to', to);
};

MIMEBase.prototype.from = function (from) {
  this.setHeader('from', from);
};

MIMEBase.prototype.subject = function (subject) {
  this.setHeader('subject', subject);
};

MIMEBase.prototype.asString = function () {
  var mimeAsString = '';
  for (var header in this._headers) {
    var value = this._headers[header];
    mimeAsString += header + ': ' + value + '\n';
  }
  return mimeAsString;
};

MIMEBase.prototype.asBase64url = function () {
  return base64(this.asString(), null, true);
};


function MIMEMultipart () {
  MIMEBase.call(this, 'multipart', 'mixed');
  this._boundary = this._generateBoundary();
  this._setContentTypeHeader({
    boundary: this._boundary
  });
  this._attachments = [];
}

MIMEMultipart.prototype = Object.create(MIMEBase.prototype);
MIMEMultipart.prototype.constructor = MIMEMultipart;

MIMEMultipart.prototype._generateBoundary = function () {
  return '001a11379d323968e3052a678fa4';
};

MIMEMultipart.prototype.attach = function (mime) {
  if (mime instanceof MIMEBase) {
    this._attachments.push(mime);
  }
};

MIMEMultipart.prototype.asString = function () {
  var mimeAsString = MIMEBase.prototype.asString.call(this);
  mimeAsString += '\n';
  var attachments = this._attachments;
  for (var i = 0; i < attachments.length; i++) {
    mimeAsString += '--' + this._boundary + '\n';
    mimeAsString += attachments[i].asString();
  }
  mimeAsString += '--' + this._boundary + '--\n';
  return mimeAsString;
};

function MIMEText (text, date, subType, charset) {
  MIMEBase.call(this, 'text', subType || 'plain');
  this._setContentTypeHeader({
    charset: charset || 'us-ascii'
  });
  var date = new Date(date).toLocaleString('en-US', {timeZone: 'America/Los_Angeles'});
  this._content = date + '\n\n' + text + '\n---';
}

MIMEText.prototype = Object.create(MIMEBase.prototype);
MIMEText.prototype.constructor = MIMEText;

MIMEText.prototype.asString = function () {
  var mimeAsString = MIMEBase.prototype.asString.call(this);
  mimeAsString += '\n';
  mimeAsString += this._content + '\n';
  return mimeAsString;
};

function MIMEImage (imageData, fileName, encoding, subType) {
  MIMEBase.call(this, 'image', subType);
  this.setHeader('content-disposition', 'attachment', {filename: fileName});
  this.setHeader('content-transfer-encoding', 'base64');
  this._encoding = encoding;
  this._content = imageData;
}

MIMEImage.prototype = Object.create(MIMEBase.prototype);
MIMEImage.prototype.constructor = MIMEImage;

MIMEImage.prototype.asString = function () {
  var mimeAsString = MIMEBase.prototype.asString.call(this);
  mimeAsString += '\n';
  mimeAsString += base64(this._content, this._encoding, false) + '\n';
  return mimeAsString;
};

function base64 (data, encoding, url) {
  encoding = encoding || 'ascii';
  var base64data = new Buffer(data, encoding).toString('base64');
  if (url) {
    base64data = base64data.replace(/\+/g, '-').replace(/\//g, '_').replace(/\=+$/, '');
  }
  return base64data;
}

function MIMEMultipartFromObject (obj) {
  var multipart = new MIMEMultipart();
  multipart.to(obj.to);
  multipart.from(obj.from);
  multipart.subject(obj.subject);
  var text = new MIMEText(obj.content, obj.date);
  multipart.attach(text);
  for (var i = 0; i < obj.attachments.length; i++) {
    var attachment = obj.attachments[i];
    var mimeType = attachment.mimetype.split('/');
    if (mimeType[0] === 'image') {
      var encoding = 'binary';
      var attachmentData = attachment.data;
      var image = new MIMEImage(attachmentData, attachment.originalname, encoding, mimeType[1]);
      multipart.attach(image);
    }
  }
  return multipart;
}

module.exports = {
  MIMEBase: MIMEBase,
  MIMEMultipart: MIMEMultipart,
  MIMEText: MIMEText,
  MIMEImage: MIMEImage,
  MIMEMultipartFromObject: MIMEMultipartFromObject
}