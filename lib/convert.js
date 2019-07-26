const utils = require("./utils.js");
const firebase = require("./firebase.js");
firebase.initialize();
const imagemin = require("imagemin");
const imageminJpegtran = require("imagemin-jpegtran");
const imageminPngquant = require("imagemin-pngquant");
const imageminGifsicle = require("imagemin-gifsicle");
const sharp = require("sharp");
const sizeOf = require("image-size");
const fs = require("fs-extra");
var path = require("path");
var pdf2img;
if (process.env.IS_LOCAL) {
  pdf2img = require("pdf2img");
} else {
  pdf2img = require("pdf2img-lambda-friendly");
}

const convert = {
  resize: function(filePath, sw, sh, bw, bh) {
    if (typeof filePath !== "string") {
      throw Error("A readable stream is required");
    }
    let dimensions = sizeOf(filePath);
    let files = { original: filePath };
    let smallThumbSize;
    let bigThumbSize;

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
        "Generating SMALL thumbnails: reducing the page from %s X %s pixels to %s X %s pixels",
        dimensions.width,
        dimensions.height,
        smallThumbSize.width,
        smallThumbSize.height
      );
      return smallThumbSize;
    });
    files.bigThumbBuffer.then(buffer => {
      bigThumbSize = sizeOf(buffer);
      console.log(
        "Generating BIG thumbnails: reducing the page from %s X %s pixels to %s X %s pixels",
        dimensions.width,
        dimensions.height,
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
  processPpt: function(s3) {
    throw "Method not implemented";
  },
  processPdf: function(s3) {
    console.log("Processing PDF");
    const filename = path.basename(s3.object.key);
    const ext = path.extname(s3.object.key);
    const name = path.basename(s3.object.key, ext);
    const dirname = path.dirname(s3.object.key);
    const tmpFile = `/tmp/${filename}`;
    const dstBucket = process.env.DST_BUCKET;
    var convert = this;

    console.log(
      `starting the download of https://${s3.bucket.name}/${
        s3.object.key
      } the file into a tmp file`
    );
    return new Promise((resolve, reject) => {
      utils
        .s3Download(s3.bucket.name, s3.object.key, tmpFile)
        .on("finish", () => {
          var uploadOriginal = utils
            .s3Upload(dstBucket, s3.object.key, tmpFile, utils.constants.PDF)
            .then(() => {
              console.log("Original PDF file uploaded successfully");
            });
          try {
            pdf2img.setOptions({
              type: "png", // png or jpg, default jpg
              density: 600, // default 600
              outputdir: "/tmp" + path.sep + "converted" // output folder, default null (if null given, then it will create folder name same as file name)
              //outputname: "test" // output file name, dafault null (if null given, then it will create image name same as input name)
            });
            pdf2img.convert(tmpFile, function(err, info) {
              if (err) {
                console.log("ERROR [pdf2img]: converting the PDF into PNG");
                console.log(err);
                console.log(err.stack);
                reject(err);
              } else {
                //console.log(info);
                let fileUploadPromise = [];
                let i = 0;
                info.message.forEach(function(itm) {
                  console.log(
                    "Processing the page %s of the file %s",
                    itm.page,
                    itm.path
                  );
                  let process = convert.uploadFile(
                    dstBucket,
                    `${dirname}/${name}_${i}.png`,
                    itm.path,
                    utils.constants.PNG
                  );

                  fileUploadPromise.push(process);
                  i++;
                });
                //adding the original document upload
                fileUploadPromise.push(uploadOriginal);
                resolve(
                  Promise.all(fileUploadPromise)
                    .then(() => {
                      firebase.disconnect();
                    })
                    .catch(err => {
                      console.log(err);
                      console.log(err.stack);
                    })
                );
              }
            });
          } catch (error) {
            console.log("ERROR converting the PDF into PNG");
            console.log(error);
            console.log(error.stack);
          }
        });
    }) /* .then(function() {
      return convert.clear(s3.bucket.name, s3.object.key, "/tmp").then(() => {
        console.log("Environment cleared successfully");
      });
    }) */;
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
  uploadFile: async function(dstBucket, key, tmpFile, fileType) {
    //generate thumbails;
    const smallThumb = { width: 50, height: 50 };
    const bigThumb = { width: 128, height: 128 };
    const dirname = path.dirname(key);
    const filename = path.basename(key);
    let thumbnails = this.generateThumbnails(
      tmpFile,
      fileType,
      smallThumb,
      bigThumb
    );
    let smallThumbs = thumbnails.smallThumbnails.then(sThumbs => {
      return utils.s3UploadfromBuffer(
        dstBucket,
        `${dirname}/smallThumbs/${filename}`,
        sThumbs,
        fileType
      );
    });
    let bigThumbs = thumbnails.bigThumbnails.then(bThumbs => {
      return utils.s3UploadfromBuffer(
        dstBucket,
        `${dirname}/bigThumbs/${filename}`,
        bThumbs,
        fileType
      );
    });
    let fullSizeImg = this.compressFile(tmpFile, fileType)
      .then(img => {
        console.log("Uploading the file %s", `${dstBucket}${key}`, fileType);
        let aux = utils
          .s3UploadfromBuffer(dstBucket, key, img[0].data, fileType)
          .then(data => {
            console.log(
              "Uploaded successfully the file %s to the bucket %s. Response: %s",
              key,
              dstBucket,
              data.ETag
            );
            return data;
          })
          .catch(err => {
            console.log("Error uploading file to S3: %s", err);
            console.error(err.stack);
          });
        return aux;
      })
      .catch(err => {
        console.log(err);
      });
    return Promise.all([smallThumbs, bigThumbs, fullSizeImg]).then(() => {
      const imgObj = {
        name: filename,
        url: `https://${dstBucket}/${key}`,
        smallThumbUrl: `${dirname}/smallThumbs/${filename}`,
        bigThumbUrl: `${dirname}/bigThumbs/${filename}`
      };
      const sessId = dirname.split("/")[0];

      return firebase.registerImage(sessId, imgObj);
    });
  },
  generateThumbnails: function(buffer, fileType, smallThumbSize, bigThumbSize) {
    let images = this.resize(
      buffer,
      smallThumbSize.width,
      smallThumbSize.height,
      bigThumbSize.width,
      bigThumbSize.height
    );
    var superthis = this;
    return {
      bigThumbnails: images.bigThumbBuffer.then(function(buffer) {
        return superthis.compressFile(buffer, fileType);
      }),
      smallThumbnails: images.smallThumbBuffer.then(function(buffer) {
        return superthis.compressFile(buffer, fileType);
      })
    };
  },
  compressFile: async function(input, fileType) {
    let compressionPlugins;
    switch (fileType) {
      case utils.constants.PNG:
        compressionPlugins = [
          imageminPngquant({
            quality: [0.6, 0.8]
          })
        ];
        break;

      default:
        break;
    }
    console.log("Compressing file of type %s", fileType);
    if (Buffer.isBuffer(input)) {
      return imagemin.buffer(input, {
        //destination: "/tmp/dest",
        plugins: compressionPlugins
      });
    }
    if (typeof input === "string") {
      return imagemin([input], {
        //destination: "/tmp/dest",
        plugins: compressionPlugins
      });
    } else {
      throw Error("Only strings or buffers are allowed");
    }
  },
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
      console.log("Detected a file of type JPG");
      return convert.processJpg(s3);
    case utils.constants.PNG:
      console.log("Detected a file of type PNG");
      return convert.processPng(s3);
      break;
    case utils.constants.GIF:
      console.log("Detected a file of type GIF");
      return convert.processGif(s3);
      break;
    case utils.constants.BMP:
      console.log("Detected a file of type BMP");
      break;
    case utils.constants.ICO:
      console.log("Detected a file of type ICO");
      break;
    case utils.constants.PCT:
      console.log("Detected a file of type PCT");
      break;
    case utils.constants.TIFF:
      console.log("Detected a file of type TIFF");
      break;
    case utils.constants.DOC:
      console.log("Detected a file of type DOC");
      break;
    case utils.constants.PPT:
      console.log("Detected a file of type PPT");
      break;
    case utils.constants.PDF:
      console.log("Detected a file of type PDF");
      return convert.processPdf(s3);
      break;
    case utils.constants.NOT_SUPPORTED:
      throw `The files with extension ${fileExt} are not supported`;
      break;
    default:
      throw `The files with extension ${fileExt} are not supported`;
      break;
  }
};
