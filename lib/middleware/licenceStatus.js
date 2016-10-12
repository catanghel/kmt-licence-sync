const logger = require('./../logger');
//const Promise = require('bluebird');
const KMTError = require('./../error');
const licenceService = require('./../services/licenceService');

const licenceStatus = {
  checkAndRegister: (req, res, next) => {
    req.execStartTimer = new Date().getTime();

    logger.debug({operation: 'licenceStatus.checkAndRegister'});

    const mainLicences = [req.licenceId];
    // create an array with the other licences (removing the current one)
    const otherLicences = req.session.kmtLoggedIn.licenceList.filter((item) => item.licenceId !== req.licenceId).map((item) => item.licenceId);

    // check the main licence
    licenceStatus.processMainLicence(mainLicences, req, res, next).then((res) => {
      //check the other licences
      return licenceStatus.processOtherLicences(otherLicences, req, res, next);
    });
  },

  processMainLicence(mainLicences, req, res, next) {
    logger.debug({operation: 'licenceStatus.processMainLicence', mainLicences});

    return licenceService.getUnregistered(mainLicences)
      .then((results) => {
        const currentLicence = results[0];

        // if we get the licence data and if it has our custom flag => no need to register
        if (currentLicence.uuid === req.licenceId && currentLicence.kmtRegistrationDate !== undefined) {
          logger.info({operation: 'licenceStatus.processMainLicence', msg: 'Licence up-to-date', licenceId: req.licenceId});
          return null;
        }

        logger.info({operation: 'licenceStatus.processMainLicence', msg: 'Licence needs to be registered', licenceId: req.licenceId});

        // register the licence
        return licenceService.register(mainLicences, req.currentUser, results);
      }).then((res) => {
        next();
        return res;
      }).catch(error => {
        next(error);
      });
  },

  processOtherLicences(otherLicences, req, res, next) {
    logger.debug({operation: 'licenceStatus.processOtherLicences', otherLicences});

    return licenceService.getUnregistered(otherLicences)
      .then((results) => {
        const remainingData = [];
        const remaining = otherLicences.filter((licenceId, i) => {
          // if we get the licence data => no need to register
          if (results[i].uuid === licenceId) {
            logger.info({operation: 'licenceStatus.processOtherLicences', msg: 'Licence up-to-date', licenceId: licenceId});
            return false;
          }

          logger.info({operation: 'licenceStatus.processOtherLicences', msg: 'Licence needs to be registered', licenceId: licenceId});

          // store the data for the filtered licences
          remainingData.push(results[i]);
          return true;
        });

        // register the remaining licences
        return remaining.length > 0 ? licenceService.register(remaining, req.currentUser, remainingData) : null;
      }).then((res) => {
      }).catch(error => {
        logger.error({operation: 'licenceStatus.processOtherLicences', error});
      });
  }
};

module.exports = licenceStatus;
