const AWS = require("aws-sdk");
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
      console.log(`ERROR getting the object from S3: %s`, err);
    })
    .pipe(file);
};

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

module.exports.s3UploadfromBuffer = (bucketName, keyName, src, mime) => {
  try {
    if (!Buffer.isBuffer(src)) {
      throw new Error(
        "The parameter specified to s3UploadfromBuffer is not a buffer: %s provided",
        typeof src
      );
    }
    let s3 = new AWS.S3();

    console.log(
      "Uploading processed image to %s",
      "https://" + bucketName + keyName
    );
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
