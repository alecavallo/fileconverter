"use strict";

const convert = require("./lib/convert.js");
const util = require("util");

module.exports.hello = async event => {
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: "Go Serverless v1.0! Your function executed successfully!",
      input: event
    })
  };

  // Use this code if you don't use the http event with the LAMBDA-PROXY integration
  // return { message: 'Go Serverless v1.0! Your function executed successfully!', event };
};

module.exports.processFile = async event => {
  await convert
    .process(event.Records[0].s3)
    .then(function(result) {
      return convert
        .clear(
          event.Records[0].s3.bucket.name,
          event.Records[0].s3.object.key,
          "/tmp"
        )
        .then(() => {
          console.log("Environment cleared successfully");
          console.log("Finished convert process");
          return result;
        });
    })
    .catch(err => {
      console.log("ERROR in handler: %s", err);
      console.error(err.stack);
      throw ("Error: %s", err);
    });
  return true;
};
