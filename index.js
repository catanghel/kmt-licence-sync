'use strict';

const fs = require('fs');

const paths = [
  __dirname + '/lib/middleware',
  __dirname + '/lib/services'
];

module.exports.init = () => {
  paths.forEach((path) => {
    fs.readdirSync(path).forEach((file) => {
      if (~file.indexOf('.js')) {
        module.exports[file.replace(/\.js/, '')] = require(path + '/' + file);
      }
    });
  });
};
