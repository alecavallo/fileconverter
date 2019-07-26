var admin = require("firebase-admin");

var serviceAccount = require("../" + process.env.FIREBASE_KEY_PATH);
/// eslint-disable-next-line node/no-unpublished-require
//var serviceAccount = require("../auth/firebase-sdk.json");

/**
 * Initialize firebase app
 */
function initialize() {
  try {
    if (admin.apps.length === 0) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: process.env.DATABASE_URL,
        databaseAuthVariableOverride: {
          uid: process.env.UID_OVERRIDE
        }
      });
    }
  } catch (error) {
    console.error(error);
    throw Error("Can't setup a connection to Firebase. Check logs");
  }
}

/**
 * Registers an image in firebase, this allows the frontend to show it in the file listing and access to each file properties like thumbnails, name and url
 * @param {String} sessionId
 * @param {name: String, url: String, smallThumbUrl: String, bigThumbUrl: String} imgObj
 * @returns {Promise}
 */
async function registerImage(sessionId, imgObj) {
  if (
    typeof imgObj.name === "undefined" ||
    typeof imgObj.url === "undefined" ||
    typeof imgObj.smallThumbUrl === "undefined" ||
    typeof imgObj.bigThumbUrl === "undefined"
  ) {
    console.error("ERROR imgObj is malformed");
    throw Error("ERROR imgObj is malformed");
  }
  try {
    initialize();
    let db = admin.database();
    let ref = db.ref(`/sessions/images/${sessionId}`);
    var images = ref.push();
    return images.set(imgObj).then(data => {
      console.log("The image %s has been published to firebase", imgObj.name);
      return data;
    });
  } catch (error) {
    console.error(error);
    console.error(error.stack);
  }
}
/**
 * Disconnect from firebase app
 */
function disconnect() {
  return admin.app().delete();
}

module.exports.registerImage = registerImage;
module.exports.disconnect = disconnect;
module.exports.initialize = initialize;
