const utils = require("./utils.js");
const imagemin = require("imagemin");
const imageminJpegtran = require("imagemin-jpegtran");
const imageminPngquant = require("imagemin-pngquant");
const imageminGifsicle = require("imagemin-gifsicle");
const sharp = require("sharp");
const sizeOf = require("image-size");
const fs = require("fs-extra");
var path = require("path");

const convert = {
  resize: function(filePath, sw, sh, bw, bh) {
    if (typeof filePath !== "string") {
      throw Error("A readable stream is required");
    }
    let dimensions = sizeOf(filePath);
    let files = { original: filePath };
    let smallThumbSize;
    let bigThumbSize;
    console.log(
      "The original image size is %s X %s pixels",
      dimensions.width,
      dimensions.height
    );

    if (dimensions.width <= sw || dimensions.height <= sh) {
      files.smallThumb = filePath;
    } else {
      files.smallThumbBuffer = sharp(filePath)
        .resize(sw, sh, { fit: "inside" })
        .toBuffer();
    }
    if (dimensions.width <= bw || dimensions.height <= bh) {
      files.bigThumbBuffer = filePath;
    } else {
      files.bigThumbBuffer = sharp(filePath)
        .resize(bw, bh, { fit: "inside" })
        .toBuffer();
    }
    files.smallThumbBuffer.then(buffer => {
      smallThumbSize = sizeOf(buffer);
      console.log(
        "Generating small thumbnails of %s X %s pixels",
        smallThumbSize.width,
        smallThumbSize.height
      );
      return smallThumbSize;
    });
    files.bigThumbBuffer.then(buffer => {
      bigThumbSize = sizeOf(buffer);
      console.log(
        "Generating big thumbnails of %s X %s pixels",
        bigThumbSize.width,
        bigThumbSize.height
      );
    });
    return files;
  },
  processJpg: async function(s3) {
    console.log("Processing JPG");
    const filename = path.basename(s3.object.key);
    const ext = path.extname(s3.object.key);
    const name = path.basename(s3.object.key, ext);
    const dirname = path.dirname(s3.object.key);
    const tmpFile = `/tmp/${filename}`;

    console.log(
      `starting the download of https://${s3.bucket.name}/${
        s3.object.key
      } the file into a tmp file`
    );
    return new Promise((resolve, reject) => {
      utils
        .s3Download(s3.bucket.name, s3.object.key, tmpFile)
        .on("finish", () => {
          //generate file's thumbnails
          let images = this.resize(tmpFile, 50, 50, 128, 128);
          //generate big thumbnails
          var dstBucket = process.env.DST_BUCKET;
          let bigThumbSaved = images.bigThumbBuffer.then(buffer => {
            //compress thumbnail
            return imagemin
              .buffer(buffer, {
                plugins: [imageminJpegtran({ progressive: true })]
              })
              .then(buff => {
                var upload = utils
                  .s3UploadfromBuffer(
                    dstBucket,
                    dirname + "/bigThumbs/" + filename,
                    buff,
                    utils.constants.JPG
                  )
                  .then(data => {
                    console.log(
                      "Big thumbnail uploaded successfully: %s",
                      JSON.stringify(data)
                    );
                  })
                  .catch(err => {
                    console.log(
                      "Error calling s3Upload to %s: %s",
                      dstBucket,
                      err
                    );
                    console.log(err.stack);
                    reject(err);
                  });
                return upload;
              })
              .catch(err => {
                console.log(err.stack);
              });
          });
          //generate small thumbnail
          let smallThumbSaved = images.smallThumbBuffer.then(buffer => {
            //compress thumbnail
            return imagemin
              .buffer(buffer, {
                plugins: [imageminJpegtran({ progressive: true })]
              })
              .then(buff => {
                var upload = utils
                  .s3UploadfromBuffer(
                    dstBucket,
                    dirname + "/smallThumbs/" + filename,
                    buff,
                    utils.constants.JPG
                  )
                  .then(data => {
                    console.log(
                      "Small thumbnail uploaded successfully: %s",
                      JSON.stringify(data)
                    );
                  })
                  .catch(err => {
                    console.log(
                      "Error calling s3Upload to %s: %s",
                      dstBucket,
                      err
                    );
                    console.log(err.stack);
                    reject(err);
                  });
                return upload;
              })
              .catch(err => {
                console.log(err.stack);
              });
          });

          // uploading original file to the S3 bucket, appending the '-orig' in order to
          // identify the original file uploaded by the user
          let origFileSaved = utils
            .s3Upload(
              dstBucket,
              dirname + "/" + name + "-orig" + ext,
              tmpFile,
              utils.constants.JPG
            )
            .then(() => {
              console.log(
                "Original file uploaded successfuly with the name: %s",
                name + "-orig" + ext
              );
            });
          let compressedFileSaved = imagemin([tmpFile], {
            destination: "/tmp/dest",
            plugins: [imageminJpegtran({ progressive: true })]
          }).then(async () => {
            console.log("File compressed successfully");
            console.log("Uploading compressed file to S3 bucket");
            var compTmpFile = `/tmp/dest/${path.basename(s3.object.key)}`;
            try {
              const data = await utils.s3Upload(
                dstBucket,
                s3.object.key,
                compTmpFile,
                utils.constants.JPG
              );
              console.log(
                "Compressed file upload status: %s",
                JSON.stringify(data)
              );
            } catch (err) {
              console.log("Error calling s3Upload to %s: %s", dstBucket, err);
            }
          });

          resolve(
            Promise.all([
              images.bigThumbBuffer,
              images.smallThumbBuffer,
              smallThumbSaved,
              bigThumbSaved,
              origFileSaved,
              compressedFileSaved
            ]).then(() => {
              console.log("Clearing tmp files");
              return this.clear(s3.bucket.name, s3.object.key, "/tmp").then(
                () => {
                  console.log("All temporary files has been cleared");
                }
              );
            })
          );
        });
    });
  },

  processPng: async function(s3) {
    console.log("Processing PNG");
    const filename = path.basename(s3.object.key);
    const ext = path.extname(s3.object.key);
    const name = path.basename(s3.object.key, ext);
    const dirname = path.dirname(s3.object.key);
    const tmpFile = `/tmp/${filename}`;

    console.log(
      `starting the download of https://${s3.bucket.name}/${
        s3.object.key
      } the file into a tmp file`
    );
    return new Promise((resolve, reject) => {
      utils
        .s3Download(s3.bucket.name, s3.object.key, tmpFile)
        .on("finish", () => {
          //generate file's thumbnails
          let images = this.resize(tmpFile, 50, 50, 128, 128);
          //generate big thumbnails
          var dstBucket = process.env.DST_BUCKET;
          let bigThumbSaved = images.bigThumbBuffer.then(buffer => {
            //compress thumbnail
            return imagemin
              .buffer(buffer, {
                plugins: [
                  imageminPngquant({
                    quality: [0.6, 0.8]
                  })
                ]
              })
              .then(buff => {
                var upload = utils
                  .s3UploadfromBuffer(
                    dstBucket,
                    dirname + "/bigThumbs/" + filename,
                    buff,
                    utils.constants.PNG
                  )
                  .then(data => {
                    console.log(
                      "Big thumbnail uploaded successfully: %s",
                      JSON.stringify(data)
                    );
                  })
                  .catch(err => {
                    console.log(
                      "Error calling s3Upload to %s: %s",
                      dstBucket,
                      err
                    );
                    console.log(err.stack);
                    reject(err);
                  });
                return upload;
              })
              .catch(err => {
                console.log(err.stack);
              });
          });
          //generate small thumbnail
          let smallThumbSaved = images.smallThumbBuffer.then(buffer => {
            //compress thumbnail
            return imagemin
              .buffer(buffer, {
                plugins: [
                  imageminPngquant({
                    quality: [0.6, 0.8]
                  })
                ]
              })
              .then(buff => {
                var upload = utils
                  .s3UploadfromBuffer(
                    dstBucket,
                    dirname + "/smallThumbs/" + filename,
                    buff,
                    utils.constants.PNG
                  )
                  .then(data => {
                    console.log(
                      "Small thumbnail uploaded successfully: %s",
                      JSON.stringify(data)
                    );
                  })
                  .catch(err => {
                    console.log(
                      "Error calling s3Upload to %s: %s",
                      dstBucket,
                      err
                    );
                    console.log(err.stack);
                    reject(err);
                  });
                return upload;
              })
              .catch(err => {
                console.log(err.stack);
              });
          });

          // uploading original file to the S3 bucket, appending the '-orig' in order to
          // identify the original file uploaded by the user
          let origFileSaved = utils
            .s3Upload(
              dstBucket,
              dirname + "/" + name + "-orig" + ext,
              tmpFile,
              utils.constants.PNG
            )
            .then(() => {
              console.log(
                "Original file uploaded successfuly with the name: %s",
                name + "-orig" + ext
              );
            });
          let compressedFileSaved = imagemin([tmpFile], {
            destination: "/tmp/dest",
            plugins: [
              imageminPngquant({
                quality: [0.6, 0.8]
              })
            ]
          }).then(async () => {
            console.log("File compressed successfully");
            console.log("Uploading compressed file to S3 bucket");
            var compTmpFile = `/tmp/dest/${path.basename(s3.object.key)}`;
            try {
              const data = await utils.s3Upload(
                dstBucket,
                s3.object.key,
                compTmpFile,
                utils.constants.PNG
              );
              console.log(
                "Compressed file upload status: %s",
                JSON.stringify(data)
              );
            } catch (err) {
              console.log("Error calling s3Upload to %s: %s", dstBucket, err);
            }
          });

          resolve(
            Promise.all([
              images.bigThumbBuffer,
              images.smallThumbBuffer,
              smallThumbSaved,
              bigThumbSaved,
              origFileSaved,
              compressedFileSaved
            ]).then(() => {
              console.log("Clearing tmp files");
              return this.clear(s3.bucket.name, s3.object.key, "/tmp").then(
                () => {
                  console.log("All temporary files has been cleared");
                }
              );
            })
          );
        });
    });
  },

  processGif: async function(s3) {
    console.log("Processing GIF");
    const filename = path.basename(s3.object.key);
    const ext = path.extname(s3.object.key);
    const name = path.basename(s3.object.key, ext);
    const dirname = path.dirname(s3.object.key);
    const tmpFile = `/tmp/${filename}`;

    console.log(
      `starting the download of https://${s3.bucket.name}/${
        s3.object.key
      } the file into a tmp file`
    );
    return new Promise((resolve, reject) => {
      utils
        .s3Download(s3.bucket.name, s3.object.key, tmpFile)
        .on("finish", () => {
          //generate file's thumbnails
          let images = this.resize(tmpFile, 50, 50, 128, 128);
          //generate big thumbnails
          var dstBucket = process.env.DST_BUCKET;
          let bigThumbSaved = images.bigThumbBuffer.then(buffer => {
            //compress thumbnail
            return imagemin
              .buffer(buffer, {
                plugins: [
                  imageminGifsicle({
                    interlaced: true,
                    optimizationLevel: 3
                  })
                ]
              })
              .then(buff => {
                var upload = utils
                  .s3UploadfromBuffer(
                    dstBucket,
                    dirname + "/bigThumbs/" + filename,
                    buff,
                    utils.constants.GIF
                  )
                  .then(data => {
                    console.log(
                      "Big thumbnail uploaded successfully: %s",
                      JSON.stringify(data)
                    );
                  })
                  .catch(err => {
                    console.log(
                      "Error calling s3Upload to %s: %s",
                      dstBucket,
                      err
                    );
                    console.log(err.stack);
                    reject(err);
                  });
                return upload;
              })
              .catch(err => {
                console.log(err.stack);
              });
          });
          //generate small thumbnail
          let smallThumbSaved = images.smallThumbBuffer.then(buffer => {
            //compress thumbnail
            return imagemin
              .buffer(buffer, {
                plugins: [
                  imageminGifsicle({
                    interlaced: true,
                    optimizationLevel: 3
                  })
                ]
              })
              .then(buff => {
                var upload = utils
                  .s3UploadfromBuffer(
                    dstBucket,
                    dirname + "/smallThumbs/" + filename,
                    buff,
                    utils.constants.GIF
                  )
                  .then(data => {
                    console.log(
                      "Small thumbnail uploaded successfully: %s",
                      JSON.stringify(data)
                    );
                  })
                  .catch(err => {
                    console.log(
                      "Error calling s3Upload to %s: %s",
                      dstBucket,
                      err
                    );
                    console.log(err.stack);
                    reject(err);
                  });
                return upload;
              })
              .catch(err => {
                console.log(err.stack);
              });
          });

          // uploading original file to the S3 bucket, appending the '-orig' in order to
          // identify the original file uploaded by the user
          let origFileSaved = utils
            .s3Upload(
              dstBucket,
              dirname + "/" + name + "-orig" + ext,
              tmpFile,
              utils.constants.GIF
            )
            .then(() => {
              console.log(
                "Original file uploaded successfuly with the name: %s",
                name + "-orig" + ext
              );
            });
          let compressedFileSaved = imagemin([tmpFile], {
            destination: "/tmp/dest",
            plugins: [
              imageminGifsicle({
                interlaced: true,
                optimizationLevel: 3
              })
            ]
          }).then(async () => {
            console.log("File compressed successfully");
            console.log("Uploading compressed file to S3 bucket");
            var compTmpFile = `/tmp/dest/${path.basename(s3.object.key)}`;
            try {
              const data = await utils.s3Upload(
                dstBucket,
                s3.object.key,
                compTmpFile,
                utils.constants.GIF
              );
              console.log(
                "Compressed file upload status: %s",
                JSON.stringify(data)
              );
            } catch (err) {
              console.log("Error calling s3Upload to %s: %s", dstBucket, err);
            }
          });

          resolve(
            Promise.all([
              images.bigThumbBuffer,
              images.smallThumbBuffer,
              smallThumbSaved,
              bigThumbSaved,
              origFileSaved,
              compressedFileSaved
            ]).then(() => {
              console.log("Clearing tmp files");
              return this.clear(s3.bucket.name, s3.object.key, "/tmp").then(
                () => {
                  console.log("All temporary files has been cleared");
                }
              );
            })
          );
        });
    });
  },

  processDoc: s3 => {
    throw "Method not implemented";
  },
  processPpt: s3 => {
    throw "Method not implemented";
  },
  processPdf: s3 => {
    throw "Method not implemented";
  },
  processBmp: s3 => {
    throw "Method not implemented";
  },
  processIco: s3 => {
    throw "Method not implemented";
  },
  processPct: s3 => {
    throw "Method not implemented";
  },
  processTiff: s3 => {
    throw "Method not implemented";
  },

  //private
  clear: async function(srcBucket, srcKey, tmpFolder) {
    const uploadedFile = tmpFolder + "/" + path.basename(srcKey);
    try {
      let s3Del = utils
        .s3Delete(srcBucket, srcKey)
        .then(() => {
          console.log(
            "File removed from temporary S3 bucket: s3://%s/%s",
            srcBucket,
            srcKey
          );
          return true;
        })
        .catch(e => {
          console.log("ERROR removing object from source: %s", e);
        });

      let fileDel = fs
        .remove(uploadedFile)
        .then(() => {
          console.log("Removing file: %s", uploadedFile);
          return true;
        })
        .catch(error => {
          console.log("ERROR removing file from lambda tmp: %s", error);
        });

      return Promise.all([fileDel, s3Del]);
    } catch (error) {
      console.log("ERROR removing file from s3: %s", error);
      console.log(error.stack);
    }
  }
};

module.exports.process = s3 => {
  const fileExt = s3.object.key.split(".")[1];
  const fileType = utils.detectFile(s3);
  switch (fileType) {
    case utils.constants.JPG:
      console.log("Detected file of type JPG");
      return convert.processJpg(s3);
    case utils.constants.PNG:
      console.log("Detected file of type PNG");
      return convert.processPng(s3);
      break;
    case utils.constants.GIF:
      console.log("Detected file of type GIF");
      return convert.processGif(s3);
      break;
    case utils.constants.BMP:
      console.log("Detected file of type BMP");
      break;
    case utils.constants.ICO:
      console.log("Detected file of type ICO");
      break;
    case utils.constants.PCT:
      console.log("Detected file of type PCT");
      break;
    case utils.constants.TIFF:
      console.log("Detected file of type TIFF");
      break;
    case utils.constants.DOC:
      console.log("Detected file of type DOC");
      break;
    case utils.constants.PPT:
      console.log("Detected file of type PPT");
      break;
    case utils.constants.PDF:
      console.log("Detected file of type PDF");
      convert.processPdf(s3);
      break;
    case utils.constants.NOT_SUPPORTED:
      throw `The files with extension ${fileExt} are not supported`;
      break;
    default:
      throw `The files with extension ${fileExt} are not supported`;
      break;
  }
};
