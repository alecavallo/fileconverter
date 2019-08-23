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
async function registerImage(sessionId, imgObj, imgName) {
  if (typeof imgName === "undefined") {
    throw Error("ERROR: Object name is missing");
  }
  if (
    typeof imgObj.name === "undefined" ||
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
    let ref = db.ref(
      `/sessions/images/${sessionId}/${imgName.replace(".", "-")}`
    );
    let refObjs = db.ref(
      `/sessions/images/${sessionId}/${imgName.replace(".", "-")}/objects/`
    );

    await ref.update({ processing: true });
    var images = refObjs.push();
    return images.set(imgObj).then(data => {
      //console.log("The image %s has been published to firebase", imgObj.name);
      return data;
    });
  } catch (error) {
    console.error(error);
    console.error(error.stack);
  }
}
function setImageStatus(sessionId, imgName, val) {
  if (typeof val !== "boolean" && typeof val !== "string") {
    throw Error(
      "ERROR: the value to assing must be a boolean or a string, %s assigned",
      typeof val
    );
  }
  if (typeof imgName === "undefined") {
    throw Error("ERROR: Object name is missing");
  }
  if (typeof sessionId === "undefined") {
    throw Error("ERROR: session ID is not defined");
  }

  try {
    initialize();
    let db = admin.database();
    let ref = db.ref(
      `/sessions/images/${sessionId}/${imgName.replace(".", "-")}`
    );

    return ref.update({ processing: val });
  } catch (error) {
    console.error(error);
    console.error(error.stack);
  }
}

function setName(sessionId, imgName, eventDate) {
  if (typeof imgName === "undefined") {
    throw Error("ERROR: Object name is missing");
  }
  if (typeof sessionId === "undefined") {
    throw Error("ERROR: session ID is not defined");
  }
  try {
    initialize();
    let db = admin.database();
    let ref = db.ref(
      `/sessions/images/${sessionId}/${imgName.replace(".", "-")}`
    );

    return ref.update({ name: imgName, creationTime: eventDate });
  } catch (error) {
    console.error(error);
    console.error(error.stack);
  }
}

async function getUnprocessedImages(sessionId, imageName, totalPages) {
  if (typeof imageName !== "string") {
    throw Error("You must supply a valid image name");
  }
  let pagesToProcess = Array.from(Array(parseInt(totalPages)).keys());
  initialize();
  let db = admin.database();
  const formattedImgName = imageName.replace(".", "-");
  let ref = db.ref(`/sessions/images/${sessionId}/${formattedImgName}`);

  await ref.once("value").then(async snapshot => {
    if (!snapshot.exists()) {
      return pagesToProcess;
    }
    if (snapshot.child("processing").val() === false) {
      pagesToProcess = [];
    } else {
      await snapshot.child("objects").forEach(child => {
        let filenameArray = child
          .child("name")
          .val()
          .split(".")[0]
          .split("-");
        let existingPage = parseInt(filenameArray[filenameArray.length - 1]);
        //remove the page already processed in a previous run
        pagesToProcess.splice(pagesToProcess.indexOf(existingPage), 1);
      });
    }
  });

  return pagesToProcess;
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
module.exports.setImageStatus = setImageStatus;
module.exports.setName = setName;
module.exports.getUnprocessedImages = getUnprocessedImages;
