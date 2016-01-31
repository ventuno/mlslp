var gcloud = require('gcloud');

var GCLOUD_PROJECT_ID = process.env.GCLOUD_PROJECT_ID;
var GCLOUD_CLIENT_EMAIL = process.env.GCLOUD_CLIENT_EMAIL;
var GCLOUD_PRIVATE_KEY = process.env.GCLOUD_PRIVATE_KEY;
var GCLOUD_SUBSCRIPTION_NAME = process.env.GCLOUD_SUBSCRIPTION_NAME;
var GCLOUD_SUBSCRIPTION_NAME_SUB = process.env.GCLOUD_SUBSCRIPTION_NAME_SUB;

var pubsub = gcloud.pubsub({
  projectId: GCLOUD_PROJECT_ID,
  credentials: {
    private_key: GCLOUD_PRIVATE_KEY.replace(/\\n/g, '\n'), //ensures \n are interpreted as new line chars
    client_email: GCLOUD_CLIENT_EMAIL
  }
});

var topic = pubsub.topic(GCLOUD_SUBSCRIPTION_NAME, function (err, topic) {
  if (err) {
    console.error('cannot create topic', err);
  }
});

//http://stackoverflow.com/questions/30952979/topic-is-created-on-cloud-pub-sub-but-unable-to-create-watch-on-that-topic
var subscription = topic.subscription(GCLOUD_SUBSCRIPTION_NAME_SUB);

module.exports = {
  topic: topic,
  subscription: subscription
}