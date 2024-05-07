import fs from "fs";

export const TYPES = {
  Number: "Number",
  Uint8Array: "Uint8Array",
  Boolean: "Boolean",
  Array: "Array",
};

export const readFile = (path, json = false) => {
  return new Promise((resolve, reject) => {
    fs.readFile(path, "utf8", (err, data) => {
      if (err) {
        reject(err);
      }
      if (json) {
        data = JSON.parse(data);
      }
      resolve(data);
    });
  });
};

export const delay = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

export const typeOf = (v) => {
  return Object.prototype.toString.call(v).slice(8, -1);
};

export const assertEqual = (a, b, message) => {
  if (a !== b) {
    throw new Error(message);
  }
}