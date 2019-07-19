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
    .then(result => {
      console.log("Finished convert process");
      return result;
    })
    .catch(err => {
      console.log("ERROR in handler: %s", err);
      throw ("Error: %s", err);
    });
  return true;
};