//const logger = require('./../logger');
//const Promise = require('bluebird');
const KMTError = require('./../error');
const licenceService = require('./../services/licenceService');

const licenceStatus = {
  checkAndRegister: (req, res, next) => {
    req.execStartTimer = new Date().getTime();

    const mainLicences = [req.licenceId];
    // create an array with the other licences (removing the current one)
    const otherLicences = req.session.kmtLoggedIn.licenceList.filter((item) => item.licenceId !== req.licenceId).map((item) => item.licenceId);

    // check the main licence
    licenceStatus.processMainLicence(mainLicences, req, res, next);

    //check the other licences
    licenceStatus.processOtherLicences(otherLicences, req, res, next);
  },

  processMainLicence(mainLicences, req, res, next) {
    return licenceService.getUnregistered(mainLicences)
      .then((results) => {
        const currentLicence = results[0];
        // if we get an error => throw the error
        if (currentLicence instanceof KMTError) {
          throw currentLicence;

          // if we get the licence data and if it has our custom flag => no need to register
        } else if (currentLicence.uuid === req.licenceId && currentLicence.byTool === "KMT") {
          return null;
        }

        // register the licence
        return licenceService.register(mainLicences, req.currentUser, results);
      }).then((res) => {
        next();
      }).catch(error => {
        next(error);
      });
  },

  processOtherLicences(otherLicences, req, res, next) {
    return licenceService.getUnregistered(otherLicences)
      .then((results) => {
        const remainingData = [];
        const remaining = otherLicences.filter((licenceId, i) => {
          // if we get an error => ignore the licence
          if (results[i] instanceof KMTError) {
            return false;

          // if we get the licence data => no need to register
          } else if (results[i].uuid === licenceId) {
            return false;
          }

          // store the data for the filtered licences
          remainingData.push(results[i]);
          return true;
        });

        // register the remaining licences
        return remaining.length > 0 ? licenceService.register(remaining, req.currentUser, remainingData) : null;
      }).then((res) => {

      }).catch(error => {

      });
  }
};

module.exports = licenceStatus;
