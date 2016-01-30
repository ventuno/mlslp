var MIME = require('../MIME');

var sampleData = {
  to: 'e.m@email.email',
  from: 'em@email.email',
  subject: 'This email is for you',
  date: 123456789
};

var expectedEmailHeader = 'to: ' + sampleData.to + '\n';
expectedEmailHeader += 'from: ' + sampleData.from + '\n';
expectedEmailHeader += 'subject: ' + sampleData.subject + '\n';

var emailText = 'Hello there!';
var emailDecoratedText = new Date(sampleData.date).toLocaleString('en-US', {timeZone: 'America/Los_Angeles'}) + '\n\n' + emailText + '\n---\n'

var expectedTextEmail = 'content-type: text/plain; charset="us-ascii"\n\n' + emailDecoratedText;

var expectedCompleteTextEmail = 'content-type: text/plain; charset="us-ascii"\n'
expectedCompleteTextEmail += expectedEmailHeader + '\n' + emailDecoratedText;

describe('Testing MIMEBase type', function() {
  var base = new MIME.MIMEBase();
  base.to(sampleData.to);
  base.from(sampleData.from);
  base.subject(sampleData.subject);
  var emailAsString = base.asString();
  it('Should return the correct header info', function() {
    expect(emailAsString).toBe(expectedEmailHeader);
  });
});


describe('Testing MIMEText type', function() {
  var emailText = 'Hello there!';
  var text = new MIME.MIMEText(emailText, sampleData.date);
  var emailAsString = text.asString();
  it('Should return the correct text info', function() {
    expect(emailAsString).toBe(expectedTextEmail);
  });
  it('Should return the correct full mail info', function() {
    text.to(sampleData.to);
    text.from(sampleData.from);
    text.subject(sampleData.subject);
    emailAsString = text.asString();
    expect(emailAsString).toBe(expectedCompleteTextEmail);
  });
});

describe('Testing MIMEMultipart type', function() {
  var text = new MIME.MIMEText(emailText, sampleData.date);
  var multipart = new MIME.MIMEMultipart();
  multipart.to(sampleData.to);
  multipart.from(sampleData.from);
  multipart.subject(sampleData.subject);
  multipart.attach(text);
  var emailAsString = multipart.asString();
  var boundary = multipart._boundary;
  it('Should return the correct header info', function() {
    
    var expectedMultipartEmail = 'content-type: multipart/mixed; boundary="'+ boundary +'"\n' + expectedEmailHeader;
    expectedMultipartEmail += '\n--' + boundary + '\n';
    expectedMultipartEmail += expectedTextEmail;
    expectedMultipartEmail += '--' + boundary + '--\n';
    expect(emailAsString).toBe(expectedMultipartEmail);
  });
});