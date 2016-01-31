//mlslputils
var util = require('util');

var MLSLP_LABEL_NAME = 'MLSLP';

function getJSONError (msg) {
  return {error: msg};
}

function decorateEmailAddress (emailAddress) {
  var emailAddressParts = emailAddress.split('@');
  return util.format('%s+%s@%s', emailAddressParts[0], MLSLP_LABEL_NAME, emailAddressParts[1]);
}

module.exports = {
  decorateEmailAddress: decorateEmailAddress,
  getJSONError: getJSONError
}