const AWS = require("aws-sdk");
const fs = require("fs");

const filePath = "./tmp/tux.jpg";
const bucketName = "tt-test-tmp2alejandro-uploads";
const key = "uploads/tux.jpg";
AWS.config.setPromisesDependency();
//MY USER
/* AWS.config.update({
  accessKeyId: "AKIAIWMIEEXZ4CKGZOAA",
  secretAccessKey: "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",
  region: "us-east-1"
}); */
AWS.config.update({
  accessKeyId: "AKIA5MKIBJB6NUTJHDG6",
  secretAccessKey: "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",
  region: "us-east-1"
});
var s3 = new AWS.S3();
console.log("hola hola amiguitos");
const utilClass = {
  delete: async function(bucketName, keyName) {
    console.log("Deleting %s from %s", keyName, bucketName);
    return await s3
      .deleteObject({
        Bucket: bucketName,
        Key: keyName
      })
      .promise();
  }
};

//const bucketName = "tt-test-tmp2alejandro-uploads";
const object = "uploads/superhash/tux.jpg";

var t = utilClass
  .delete(bucketName, object)
  .then(data => {
    console.log("Deleted file:");
    console.log(data);
  })
  .catch(e => {
    console.log("Error deleting file : %s", e);
  });
console.log(t);
