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
  /**
   * Generate the thumbnails of the uploaded file
   * @param {String} filePath path to file in the local environment
   * @param {Number} sw small thumb max width
   * @param {Number} sh small thumb max height
   * @param {Number} bw big thumb max width
   * @param {Number} bh big thumb max height
   * @returns {smallThumbBuffer: Promise<Buffer>, bigThumbBuffer: Promise<Buffer>} Object with 2 promises one for the smal thumbnails and the other for the big thumbnails. Both are resolved into a buffer
   */
  resize: function(filePath, sw, sh, bw, bh) {
    if (typeof filePath !== "string" && !Buffer.isBuffer(filePath)) {
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

      return smallThumbSize;
    });
    files.bigThumbBuffer.then(buffer => {
      bigThumbSize = sizeOf(buffer);
    });
    return files;
  },
  /**
   * Process JPEG images, download it from source container, generate small and big thumbnails,
   * compress it and upload to the destination bucket the original file, the compressed file and the compressed smal and big thumbnails
   * @see https://docs.aws.amazon.com/AmazonS3/latest/dev/notification-content-structure.html
   * @param {Object} s3
   * @returns {Promise} Resolves into an array
   */
  processJpg: async function(s3) {
    console.log("Processing JPG");
    const filename = path.basename(s3.object.key);
    const ext = path.extname(s3.object.key);
    const name = path.basename(s3.object.key, ext);
    const dirname = path.dirname(s3.object.key);
    const tmpFile = `/tmp/${filename}`;
    const dstBucket = process.env.DST_BUCKET;

    console.log(
      `starting the download of https://${s3.bucket.name}/${
        s3.object.key
      } the file into a tmp file`
    );
    return new Promise((resolve, reject) => {
      utils
        .s3Download(s3.bucket.name, s3.object.key, tmpFile)
        .on("finish", () => {
          // uploading original file to the S3 bucket, appending the '-orig' in order to
          // identify the original file uploaded by the user
          let uploadOriginal = utils
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
          let uploadThumbnails = convert.uploadFile(
            dstBucket,
            s3.object.key,
            tmpFile,
            utils.constants.JPG,
            filename
          );
          Promise.all([uploadOriginal, uploadThumbnails])
            .then(result => {
              firebase.disconnect();
              resolve(result);
            })
            .catch(err => {
              reject(err);
            });
        });
    });
  },
  /**
   * Process PNG images, download it from source container, generate small and big thumbnails,
   * compress it and upload to the destination bucket the original file, the compressed file and the compressed smal and big thumbnails
   * @see https://docs.aws.amazon.com/AmazonS3/latest/dev/notification-content-structure.html
   * @param {Object} s3
   * @returns {Promise} Resolves into an array
   */
  processPng: async function(s3) {
    console.log("Processing PNG");
    const filename = path.basename(s3.object.key);
    const ext = path.extname(s3.object.key);
    const name = path.basename(s3.object.key, ext);
    const dirname = path.dirname(s3.object.key);
    const tmpFile = `/tmp/${filename}`;
    const dstBucket = process.env.DST_BUCKET;

    console.log(
      `starting the download of https://${s3.bucket.name}/${
        s3.object.key
      } the file into a tmp file`
    );
    return new Promise((resolve, reject) => {
      utils
        .s3Download(s3.bucket.name, s3.object.key, tmpFile)
        .on("finish", () => {
          // uploading original file to the S3 bucket, appending the '-orig' in order to
          // identify the original file uploaded by the user
          let uploadOriginal = utils
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
          let uploadThumbnails = convert.uploadFile(
            dstBucket,
            s3.object.key,
            tmpFile,
            utils.constants.PNG,
            filename
          );
          Promise.all([uploadOriginal, uploadThumbnails])
            .then(result => {
              firebase.disconnect();
              resolve(result);
            })
            .catch(err => {
              reject(err);
            });
        });
    });
  },
  /**
   * Process GIF images, download it from source container, generate small and big thumbnails,
   * compress it and upload to the destination bucket the original file, the compressed file and the compressed smal and big thumbnails
   * @see https://docs.aws.amazon.com/AmazonS3/latest/dev/notification-content-structure.html
   * @param {Object} s3
   * @returns {Promise} Resolves into an array
   */
  processGif: async function(s3) {
    console.log("Processing GIF");
    const filename = path.basename(s3.object.key);
    const ext = path.extname(s3.object.key);
    const name = path.basename(s3.object.key, ext);
    const dirname = path.dirname(s3.object.key);
    const tmpFile = `/tmp/${filename}`;
    const dstBucket = process.env.DST_BUCKET;

    console.log(
      `starting the download of https://${s3.bucket.name}/${
        s3.object.key
      } the file into a tmp file`
    );
    return new Promise((resolve, reject) => {
      utils
        .s3Download(s3.bucket.name, s3.object.key, tmpFile)
        .on("finish", () => {
          // uploading original file to the S3 bucket, appending the '-orig' in order to
          // identify the original file uploaded by the user
          let uploadOriginal = utils
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
          let uploadThumbnails = convert.uploadFile(
            dstBucket,
            s3.object.key,
            tmpFile,
            utils.constants.PNG,
            filename
          );
          Promise.all([uploadOriginal, uploadThumbnails])
            .then(result => {
              firebase.disconnect();
              resolve(result);
            })
            .catch(err => {
              reject(err);
            });
        });
    });
  },
  /**
   * Process DOC images, download it from source container, generate small and big thumbnails,
   * compress it and upload to the destination bucket the original file, the compressed file and the compressed smal and big thumbnails
   * @see https://docs.aws.amazon.com/AmazonS3/latest/dev/notification-content-structure.html
   * @param {Object} s3
   * @returns {Promise} Resolves into an array
   */
  processDoc: s3 => {
    throw "Method not implemented";
  },
  /**
   * Process PPT images, download it from source container, generate small and big thumbnails,
   * compress it and upload to the destination bucket the original file, the compressed file and the compressed smal and big thumbnails
   * @see https://docs.aws.amazon.com/AmazonS3/latest/dev/notification-content-structure.html
   * @param {Object} s3
   * @returns {Promise} Resolves into an array
   */
  processPpt: function(s3) {
    throw "Method not implemented";
  },
  /**
   * Process PDF images, download it from source container, generate small and big thumbnails,
   * compress it and upload to the destination bucket the original file, the compressed file and the compressed smal and big thumbnails
   * @see https://docs.aws.amazon.com/AmazonS3/latest/dev/notification-content-structure.html
   * @param {Object} s3
   * @returns {Promise} Resolves into an array
   */
  processPdf: async function(s3) {
    console.log("Processing PDF");

    const filename = path.basename(s3.object.key);

    const dirname = path.dirname(s3.object.key);
    const sessId = dirname.split("/")[0];
    const tmpFile = `/tmp/${filename}`;
    const dstBucket = process.env.DST_BUCKET;
    const pLimit = require("p-limit");
    const limit = pLimit(process.env.MAX_CONCURRENT);
    var PDFImage = require("pdf-image").PDFImage;
    var pdfImage = new PDFImage(tmpFile, {
      convertOptions: {
        "-resize": "744x1052",
        "-quality": "80"
      }
    });
    pdfImage.outputDirectory = `/tmp/${dirname}/`;
    const toPX = require("to-px");

    var convert = this;

    console.log(
      `starting the download of https://${s3.bucket.name}/${
        s3.object.key
      } the file into a tmp file`
    );
    return new Promise(function(resolve, reject) {
      utils
        .s3Download(s3.bucket.name, s3.object.key, tmpFile)
        .on("finish", async () => {
          utils
            .s3Upload(dstBucket, s3.object.key, tmpFile, utils.constants.PDF)
            .then(() => {
              console.log("Original PDF file uploaded successfully");
            });
          try {
            const pdfInfo = await pdfImage.getInfo();
            const pageWidth = parseInt(
              toPX(pdfInfo["Page size"].split("x")[0].trim() + "pt")
            );
            const pageHeight = parseInt(
              toPX(
                pdfInfo["Page size"]
                  .split("x")[1]
                  .trim()
                  .split(" ")[0] + "pt"
              )
            );
            const pages = await pdfImage.numberOfPages();
            pdfImage.setConvertOptions({
              "-resize": `${pageWidth}x${pageHeight}`,
              "-quality": "100",
              "-flatten": null
            });
            console.log(
              "The pdf has %s pages with %s x %s px",
              pages,
              pageWidth,
              pageHeight
            );
            //let images = await pdfImage.convertFile(30);

            var uploadPromises = [];
            try {
              fs.ensureDirSync(`/tmp/${dirname}`);
            } catch (error) {
              throw Error(error);
            }

            await Promise.all([
              firebase.setName(sessId, filename),
              firebase.setImageStatus(sessId, filename, true)
            ]);

            let pagesToProcess = await firebase.getUnprocessedImages(
              sessId,
              filename,
              pages
            );
            pagesToProcess.forEach(i => {
              uploadPromises.push(
                limit(() => {
                  return pdfImage.convertPage(i).then(page => {
                    console.log(
                      "Processing page %s of file %s",
                      i,
                      s3.object.key
                    );
                    const key = dirname + "/" + path.basename(page);
                    return convert
                      .uploadFile(
                        dstBucket,
                        key,
                        page,
                        utils.constants.PNG,
                        filename
                      )
                      .then(data => {
                        console.log("Processed successfully the file %s", key);
                        return data;
                      });
                  });
                })
              );
            });

            const result = await Promise.all(uploadPromises).then(() => {
              console.log("All pages has been converted successfully");
            });
            await firebase.setImageStatus(sessId, filename, false);
            resolve(result);
          } catch (error) {
            firebase.setImageStatus(sessId, filename, "failed");
            console.log("ERROR converting the PDF into PNG");
            console.log(error);
            console.log(error.stack);
            reject(error);
          }
        });
    });
  },
  /**
   * Process BMP images, download it from source container, generate small and big thumbnails,
   * compress it and upload to the destination bucket the original file, the compressed file and the compressed smal and big thumbnails
   * @see https://docs.aws.amazon.com/AmazonS3/latest/dev/notification-content-structure.html
   * @param {Object} s3
   * @returns {Promise} Resolves into an array
   */
  processBmp: s3 => {
    throw "Method not implemented";
  },
  /**
   * Process ICO images, download it from source container, generate small and big thumbnails,
   * compress it and upload to the destination bucket the original file, the compressed file and the compressed smal and big thumbnails
   * @see https://docs.aws.amazon.com/AmazonS3/latest/dev/notification-content-structure.html
   * @param {Object} s3
   * @returns {Promise} Resolves into an array
   */
  processIco: s3 => {
    throw "Method not implemented";
  },
  /**
   * Process PCT images, download it from source container, generate small and big thumbnails,
   * compress it and upload to the destination bucket the original file, the compressed file and the compressed smal and big thumbnails
   * @see https://docs.aws.amazon.com/AmazonS3/latest/dev/notification-content-structure.html
   * @param {Object} s3
   * @returns {Promise} Resolves into an array
   */
  processPct: s3 => {
    throw "Method not implemented";
  },
  /**
   * Process TIFF images, download it from source container, generate small and big thumbnails,
   * compress it and upload to the destination bucket the original file, the compressed file and the compressed smal and big thumbnails
   * @see https://docs.aws.amazon.com/AmazonS3/latest/dev/notification-content-structure.html
   * @param {Object} s3
   * @returns {Promise} Resolves into an array
   */
  processTiff: s3 => {
    throw "Method not implemented";
  },

  //private
  /**
   * Method called to upload a file to an S3 bucket. It generates the thumbnails, compress them and uploads to the destination S3 bucket
   * @param {String} dstBucket Destionation bucket name
   * @param {String} key File name (including the full path in S3)
   * @param {String} tmpFile Path of the file to be uploaded to S3
   * @param {utils.constants} fileType mimetype of the file to upload
   * @param {String} origFilename name of the original file, before its conversion
   * @returns {Promise}
   */
  uploadFile: async function(dstBucket, key, tmpFile, fileType, origFilename) {
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
        let image;
        if (Buffer.isBuffer(img)) {
          image = img;
        } else {
          image = img[0].data;
        }
        let aux = utils
          .s3UploadfromBuffer(dstBucket, key, image, fileType)
          .then(data => {
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
        url: `https://${dstBucket}.s3.amazonaws.com/${key}`,
        smallThumbUrl: `https://${dstBucket}.s3.amazonaws.com/${dirname}/smallThumbs/${filename}`,
        bigThumbUrl: `https://${dstBucket}.s3.amazonaws.com/${dirname}/bigThumbs/${filename}`
      };
      const sessId = dirname.split("/")[0];

      return firebase.registerImage(sessId, imgObj, origFilename);
    });
  },
  /**
   *
   * @param {Buffer} buffer
   * @param {utils.constants} fileType
   * @param {width: Number, height: Number} smallThumbSize
   * @param {width: Number, height: Number} bigThumbSize
   * @returns {Object} Buffer with the resized image
   */
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
        return superthis.compressFile(buffer, fileType, true);
      }),
      smallThumbnails: images.smallThumbBuffer.then(function(buffer) {
        return superthis.compressFile(buffer, fileType, true);
      })
    };
  },
  /**
   * Compress the image using the right compressor having into consideration the declared mimetype in fileType
   * @param {Buffer|String|Array<String>} input A buffer or the path to a file to be compressed
   * @param {utils.constants} fileType Mimetype of the file
   * @param {Boolean} low sets low quality on
   * @returns {Promise<Array>} Buffer with the compressed file
   */
  compressFile: async function(input, fileType, low) {
    let compressionPlugins;
    switch (fileType) {
      case utils.constants.PNG:
        if (low === true) {
          compressionPlugins = [
            imageminPngquant({
              quality: [0.1, 0.3],
              strip: true
            })
          ];
        } else {
          compressionPlugins = [
            imageminPngquant({
              quality: [0.6, 0.8],
              strip: true
            })
          ];
        }

        break;
      case utils.constants.JPG:
        compressionPlugins = [imageminJpegtran({ progressive: true })];
        break;
      case utils.constants.GIF:
        compressionPlugins = [
          imageminGifsicle({
            interlaced: true,
            optimizationLevel: 3
          })
        ];
        break;
      default:
        break;
    }

    if (Buffer.isBuffer(input)) {
      return imagemin
        .buffer(input, {
          destination: "/tmp/dest",
          plugins: compressionPlugins
        })
        .catch(err => {
          console.error(err);
          console.error(err.stack);
        });
    }
    if (typeof input === "string") {
      return imagemin([input], {
        destination: "/tmp/dest",
        plugins: compressionPlugins
      }).catch(err => {
        console.error(err);
        console.error(err.stack);
      });
    } else if (Array.isArray(input)) {
      return imagemin(input, {
        destination: "/tmp/dest",
        plugins: compressionPlugins
      })
        .then(data => {
          console.log(data);
          return data;
        })
        .catch(err => {
          console.error(err);
          console.error(err.stack);
        });
    } else {
      throw Error("Only Arrays, Strings or Buffers are allowed");
    }
  },
  /**
   * Removes the file from the local disk and from the source S3 bucket
   * @param {String} srcBucket
   * @param {String} srcKey
   * @param {String} tmpFolder
   * @returns {Promise} Array with the result of deleting files in the local disk and source S3 bucket
   */
  clear: async function(srcBucket, srcKey, tmpFolder) {
    return;
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
  },
  testpdf: async function() {
    console.time("processing");
    var PDFImage = require("pdf-image").PDFImage;

    var pdfImage = new PDFImage("./tmp/A17_FlightPlan.pdf", {
      convertOptions: {
        "-resize": "744x1052",
        "-quality": "80"
      }
    });

    setTimeout(function() {
      utils.memUsage();
    }, 40000);
    const pdfInfo = await pdfImage.getInfo();

    const toPX = require("to-px");
    const pageWidth = parseInt(
      toPX(pdfInfo["Page size"].split("x")[0].trim() + "pt")
    );
    const pageHeight = parseInt(
      toPX(
        pdfInfo["Page size"]
          .split("x")[1]
          .trim()
          .split(" ")[0] + "pt"
      )
    );
    const pages = await pdfImage.numberOfPages();
    pdfImage.setConvertOptions({
      "-resize": `${pageWidth}x${pageHeight}`,
      "-quality": "99",
      "-flatten": null
    });
    pdfImage.outputDirectory = "/tmp/";
    console.log(
      "The pdf has %s pages with %s x %s px",
      pages,
      pageWidth,
      pageHeight
    );
    let t = await pdfImage.convertFile(30);
    console.log(t);

    /* const batchSize = 30;
    const batches = parseInt(pages / batchSize);
    for (let numBatch = 0; numBatch <= batches; numBatch++) {
      let batch = [];
      const maxBatch =
        pages - numBatch * batchSize < batchSize
          ? pages - numBatch * batchSize
          : batchSize;
      for (let j = 0; j < maxBatch; j++) {
        const numPage = batchSize * numBatch + j;
        batch.push(
          pdfImage.convertPage(numPage).then(function(imagePath) {
            console.log("converted page %s: %s", numPage, imagePath);
            //fs.unlinkSync(imagePath);
          })
        );
      }
      await Promise.all(batch).then(() => {
        console.log("THEN Procesed batch %s", numBatch);
      });
      console.log("AWAIT Procesed batch %s", numBatch);
    } */
    utils.memUsage();
    console.timeEnd("processing");
    return true;
    /* return pdfImage.convertFile().then(function(imagePaths) {
      // [ /tmp/slide-0.png, /tmp/slide-1.png ]
      console.log(imagePaths);
      utils.memUsage();
      console.timeEnd("processing");
    }); */
  }
};
/**
 * Detects the filetype using its extension and call the right function to process the file
 * @see https://docs.aws.amazon.com/AmazonS3/latest/dev/notification-content-structure.html
 */
module.exports.process = s3 => {
  const fileExt = s3.object.key.split(".")[1];
  const fileType = utils.detectFile(s3);

  switch (fileType) {
    case utils.constants.JPG:
      console.log("Detected a file of type JPG");
      return convert.processJpg(s3).then(function() {
        return convert.clear(s3.bucket.name, s3.object.key, "/tmp").then(() => {
          console.log("Environment cleared successfully");
        });
      });
    case utils.constants.PNG:
      console.log("Detected a file of type PNG");
      return convert.processPng(s3).then(function() {
        return convert.clear(s3.bucket.name, s3.object.key, "/tmp").then(() => {
          console.log("Environment cleared successfully");
        });
      });
      break;
    case utils.constants.GIF:
      console.log("Detected a file of type GIF");
      return convert.processGif(s3).then(function() {
        return convert.clear(s3.bucket.name, s3.object.key, "/tmp").then(() => {
          console.log("Environment cleared successfully");
        });
      });
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
module.exports.clear = convert.clear;
module.exports.testpdf = convert.testpdf;
