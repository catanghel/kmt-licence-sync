const Promise = require('bluebird');
const logger = require('./../logger');
const KMTError = require('./../error');
const myFt = require('./myFtService');
const membership = require('./membershipService');
const maxRetry = 5;
const retryCount = {};

function _filterExistingUsers(seatHolders, existing) {
  return seatHolders.filter((user) => {
    // if there are no items or if this id is not already added
    return !(Array.isArray(existing.items)) || !(existing.items.some((item) => item.uuid === user.id));
  });
}

const licenceService = {
  getUnregistered: (licences) => {
    logger.debug({operation: 'licenceService.getUnregistered', licences});

    const promises = [];
    // create an array with all the licence retrieval promises
    licences.forEach((licenceId) => {
      promises.push(myFt.getLicence(licenceId));
    });

    // join the promises together
    return Promise.join(...promises, // spread the array as .join needs the promises as params
                        (...results) => results);// get the rest params as an array and return it
  },

  register: (licences, currentUser, licencesData) => {
    logger.debug({operation: 'licenceService.register', licences});

    const rel = {
      "byTool": "KMT",
      "byUser": currentUser.uuid || "[UNKNOWN USER]"
    };

    const promises = [];
    licences.forEach((licenceId, i) => {
      // if the counter is not initialized
      if (retryCount[licenceId] === undefined) {
        retryCount[licenceId] = 0;
      }

      const tmpPromise = new Promise((resolve, reject) => {
        // if we have the licence data
        if (licencesData[i].uuid === licenceId) {
          logger.info({operation: 'licenceService.register', msg: 'Licence data up-to-date', licenceId});
          return resolve(null);
        }

        logger.info({operation: 'licenceService.register', msg: 'Licence data needs to be registered', licenceId});
        // register the licence to myft
        return resolve(myFt.setLicence({uuid: licenceId}));
      })
      .then((res) => {
        return myFt.getGroup(licenceId)// get group data
          .then((groupData) => {
            // if we get the group data
            if (groupData.uuid === licenceId) {
              logger.info({operation: 'licenceService.register', msg: 'Group data up-to-date', licenceId});
              return null;
            }

            logger.info({operation: 'licenceService.register', msg: 'Group data needs to be registered', licenceId});
            // register the group to myft
            return myFt.setGroup(licenceId, {"uuid": licenceId, "_rel": rel});
          });
      })
      .then((res) => {
        // get membership users for this licence
        const membershipDataPromise = membership.readLicence(licenceId);
        // get myFT users for this licence
        const myftLicenceDataPromise = myFt.getUsers(licenceId, "license");
        // get myFT users for this group
        const myftGroupDataPromise = myFt.getUsers(licenceId, "group");

        // get the new users by comparing membershipData with myftData
        return Promise.join(
          membershipDataPromise,
          myftLicenceDataPromise,
          myftGroupDataPromise,
          (membershipData, myftLicenceData, myftGroupData) => {
            return licenceService.extractNewUsers(myftLicenceData, myftGroupData, membershipData);
          });
      })
      .then(([newLicenceUsers, newGroupUsers] = [...params]) => {
        logger.info({operation: 'licenceService.register', msg: 'Users that are going to be added:', licenceId,  newLicenceUsers: newLicenceUsers.length, newGroupUsers: newGroupUsers.length});
        return licenceService.setUsers(licenceId, newLicenceUsers, newGroupUsers, rel);
      })
      .then(([licenceUserRes, groupUserRes] = [...params]) => {
        //return null;
        logger.info({operation: 'licenceService.register', msg: 'Mark licence as registered', licenceId});
        return myFt.updateLicence(licenceId, {"kmtRegistrationDate": new Date().getTime()});
      })
      .catch((error) => {
        // retry the request
        if (retryCount[licenceId] < 5) {
          retryCount[licenceId]++;

          logger.info({operation: 'licenceService.register', msg: `Retry #${retryCount[licenceId]}`, licenceId});

          return licenceService.register([licenceId], currentUser, [licencesData[i]]);
        }
        throw error;
      });

      promises.push(tmpPromise);
    });

    //return null;
    return Promise.join(...promises, (...results) => results);
  },

  setUsers: (licenceId, newLicenceUsers, newGroupUsers, rel) => {
    const newLicenceUsersLen = newLicenceUsers.length;
    const newGroupUsersLen = newGroupUsers.length;

    logger.debug({operation: 'licenceService.setUsers', licenceId, newLicenceUsers: newLicenceUsersLen, newGroupUsers: newGroupUsersLen});

    const userLicenceData = {};
    const userGroupData = {};
    userLicenceData.ids = [licenceId];
    userGroupData.ids = [licenceId];
    userLicenceData.subjects = newLicenceUsers.map((user) => {
      return {
        "uuid": user.id,
        "_rel": rel
      };
    });
    userGroupData.subjects = newGroupUsers.map((user) => {
      return {
        "uuid": user.id,
        "_rel": rel
      };
    });

    const licencePromise = newLicenceUsersLen > 0 ? myFt.setLicenceUsers(userLicenceData) : new Promise(resolve => resolve(null));
    const groupPromise = newGroupUsersLen > 0 ? myFt.setGroupUsers(userGroupData) : new Promise(resolve => resolve(null));

    return Promise.join(licencePromise, groupPromise, (...results) => results);
  },

  extractNewUsers: (myftLicenceData, myftGroupData, membershipData) => {
    logger.debug({operation: 'licenceService.extractNewUsers'});

    let newLicenceUsers = [];
    let newGroupUsers = [];
    // if the seatHolders are received
    if (Array.isArray(membershipData.seatHolders)) {
      // extract the ones that are not already added
      newLicenceUsers = _filterExistingUsers(membershipData.seatHolders, myftLicenceData);
      // extract the ones that are not already added
      newGroupUsers = _filterExistingUsers(membershipData.seatHolders, myftGroupData);
    }

    return [newLicenceUsers, newGroupUsers];
  }
};

module.exports = licenceService;
