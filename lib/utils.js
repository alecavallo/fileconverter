const AWS = require("aws-sdk");
const https = require("https");
const fs = require("fs");
const stream = require("stream");

const JPG = "image/jpeg";
const PNG = "image/png";
const GIF = "image/gif";
const BMP = "image/bmp";
const ICO = "image/x-icon";
const PCT = "image/x-pict";
const TIFF = "image/tiff";
const DOC = "application/msword";
const PPT = "application/mspowerpoint";
const PDF = "application/pdf";
const NOT_SUPPORTED = "others";

AWS.config.setPromisesDependency();
/**
 * Constants to be used to identify the allowed mime types
 */
module.exports.constants = {
  JPG,
  PNG,
  GIF,
  BMP,
  ICO,
  PCT,
  TIFF,
  DOC,
  PPT,
  PDF,
  NOT_SUPPORTED
};
/**
 * Detects the file type having into consideration the file extension only
 * @see https://docs.aws.amazon.com/AmazonS3/latest/dev/notification-content-structure.html
 * @returns {String} mime type
 */
module.exports.detectFile = s3 => {
  const file = s3.object.key.toLowerCase();
  let ext = file.split(".")[1];
  switch (ext) {
    case "jpg":
      return JPG;
    case "jpeg":
      return JPG;
    case "png":
      return PNG;
    case "gif":
      return GIF;
    case "pdf":
      return PDF;
    case "bmp":
      return BMP;
    case "ico":
      return ICO;
    case "PCT":
      return PCT;
    case "tiff":
      return TIFF;
    case "doc":
      return DOC;
    case "docx":
      return DOC;
    case "ppt":
      return PPT;
    case "pptx":
      return PPT;

    default:
      return NOT_SUPPORTED;
  }
};
/**
 * Downloads the file from an S3 bucket
 * @param {String} bucketName Name of the S3 bucket
 * @param {String} keyName Name of the object key, including the full path to it
 * @param {String} localDest Location to store the file (inclding the file name)
 */
module.exports.s3Download = (bucketName, keyName, localDest) => {
  var s3 = new AWS.S3();
  if (typeof localDest == "undefined") {
    throw "The local directory must be specified";
  }

  var params = {
    Bucket: bucketName,
    Key: keyName
  };

  var file = fs.createWriteStream(localDest);

  //console.log("BEFORE getting object from S3");
  return s3
    .getObject(params)
    .createReadStream()
    .on("error", err => {
      //console.error(err);
      console.error(`ERROR getting the object from S3: %s`, err);
    })
    .pipe(file);
};
/**
 * Downloads the file from an S3 bucket into a buffer
 * @param {String} bucketName Name of the S3 bucket
 * @param {String} keyName Name of the object key, including the full path to it
 * @returns {Buffer} Buffer with the file content
 */
module.exports.s3DownloadtoStream = (bucketName, keyName) => {
  var s3 = new AWS.S3();
  let output = stream.Writable();
  var params = {
    Bucket: bucketName,
    Key: keyName
  };

  //console.log("BEFORE getting object from S3");
  s3.getObject(params)
    .createReadStream()
    .once("error", err => {
      console.log(`ERROR getting the object from S3: %s`, err);
    })
    .pipe(output);
  return output;
};
/**
 * Uploads the file into an S3 bucket
 * @param {String} bucketName Name of the S3 bucket
 * @param {String} keyName Name of the object key, including the full path to it
 * @param {String} src Path of the file to be uploaded into an S3 bucket
 * @param {utils.constants} mime Mime type
 */
module.exports.s3Upload = (bucketName, keyName, src, mime) => {
  try {
    let file = fs.readFileSync(src);
    let s3 = new AWS.S3();

    console.log("Uploading: %s => %s", src, "https://" + bucketName + keyName);
    return s3
      .putObject({
        Bucket: bucketName,
        Key: keyName,
        Body: file,
        ACL: "public-read",
        ContentType: mime
      })
      .promise();
  } catch (error) {
    console.log("Throwing error not caputred by readfile: %s", error);
  }
};
/**
 * Uploads a buffer content into an S3 bucket
 * @param {String} bucketName Name of the S3 bucket
 * @param {String} keyName Name of the object key, including the full path to it
 * @param {Buffer} src Buffer with the file to be uploaded
 * @param {utils.constants} mime Mime type
 */
module.exports.s3UploadfromBuffer = (bucketName, keyName, src, mime) => {
  try {
    if (!Buffer.isBuffer(src)) {
      throw new Error(
        "The parameter specified to s3UploadfromBuffer is not a buffer: %s provided",
        typeof src
      );
    }
    //workaround required in order to eliminate emitter warning in AWS Lambda
    var myAgent = new https.Agent({ rejectUnauthorized: true });
    myAgent.setMaxListeners(0);
    let s3 = new AWS.S3({ httpOptions: { agent: myAgent } });
    //let s3 = new AWS.S3();

    /* console.log(
      "Uploading processed image to %s",
      "https://" + bucketName + keyName
    ); */
    return s3
      .putObject({
        Bucket: bucketName,
        Key: keyName,
        Body: src,
        ACL: "public-read",
        ContentType: mime
      })
      .promise();
  } catch (error) {
    console.log("Throwing error not caputred by readfile: %s", error);
  }
};
/**
 * Deletes an object from an S3 bucket
 * @param {String} bucketName Name of the bucket
 * @param {String} keyName Full path to the object in the S3 bucket
 * @returns {Promise}
 */
module.exports.s3Delete = async (bucketName, keyName) => {
  //return true;
  let s3 = new AWS.S3();
  let result = s3
    .deleteObject({
      Bucket: bucketName,
      Key: keyName
    })
    .promise();
  return result;
};

module.exports.memUsage = () => {
  const used = process.memoryUsage();
  for (let key in used) {
    console.log(
      `${key} ${Math.round((used[key] / 1024 / 1024) * 100) / 100} MB`
    );
  }
};
