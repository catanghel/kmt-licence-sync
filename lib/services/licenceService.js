const Promise = require('bluebird');
const logger = require('./../logger');
const myFt = require('./myFtService');
const membership = require('./membershipService');
const maxRetry = 5;

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

  register: (licences, currentUserId, licencesData) => {
    logger.debug({operation: 'licenceService.register', licences});

    const rel = {
      "byTool": "KMT",
      "byUser": currentUserId
    };

    const promises = [];
    licences.forEach((licenceId, i) => {
      let retryCount = 0;

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
        return licenceService.getNewUsers(licenceId);
      })
      .then(([newLicenceUsers, newGroupUsers] = [...params]) => {
        logger.info({operation: 'licenceService.register', msg: 'Users that are going to be added:', licenceId, newLicenceUsers: newLicenceUsers.length, newGroupUsers: newGroupUsers.length});
        return licenceService.setUsers(licenceId, newLicenceUsers, newGroupUsers, rel);
      })
      .then(([licenceUserRes, groupUserRes] = [...params]) => {
        logger.info({operation: 'licenceService.register', msg: 'Mark licence as registered', licenceId});
        return myFt.updateLicence(licenceId, {"kmtRegistrationDate": new Date().getTime()});
      })
      .catch((error) => {
        // retry the request
        if (retryCount < maxRetry) {
          retryCount++;

          logger.info({operation: 'licenceService.register', msg: `Retry #${retryCount}`, licenceId});

          return licenceService.register([licenceId], currentUserId, [licencesData[i]]);
        }
        throw error;
      });

      promises.push(tmpPromise);
    });

    return Promise.join(...promises, (...results) => results);
  },

  getNewUsers: (licenceId) => {
    logger.debug({operation: 'licenceService.getNewUsers', licenceId});

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
  },

  setUsers: (licenceId, newLicenceUsers, newGroupUsers, rel) => {
    const newLicenceUsersLen = newLicenceUsers.length;
    const newGroupUsersLen = newGroupUsers.length;

    logger.debug({operation: 'licenceService.setUsers', licenceId, newLicenceUsers: newLicenceUsersLen, newGroupUsers: newGroupUsersLen});

    const userLicenceData = newLicenceUsers.map((user) => {
      return {
        "uuid": user.id,
        "_rel": rel
      };
    });
    const userGroupData = newGroupUsers.map((user) => {
      return {
        "uuid": user.id,
        "_rel": rel
      };
    });

    let licencePromise;
    let groupPromise;
    if (newLicenceUsersLen > 0) {
      licencePromise = licenceService.setUsersInChunks(userLicenceData, licenceId, "license");
    } else {
      licencePromise = new Promise(resolve => resolve(null));
    }
    if (newGroupUsersLen > 0) {
      groupPromise = licenceService.setUsersInChunks(userGroupData, licenceId, "group");
    } else {
      groupPromise = new Promise(resolve => resolve(null));
    }

    return Promise.join(licencePromise, groupPromise, (...results) => results);
  },

  setUsersInChunks(userData, licenceId, type) {
    logger.debug({operation: 'licenceService.setUsersInChunks', type, licenceId});
    const promises = [];
    let count = 0;
    const userDataClone = [...userData];

    // while we still have users
    while (userDataClone.length) {
      count++;
      let retryCount = 0;
      const chunkCount = count;
      // get the chunk
      const chunk = userDataClone.splice(0, 100);

      logger.info({operation: 'licenceService.setUsersInChunks', msg: `Chunk #${chunkCount}`, type, licenceId});

      // create the request data
      const requestData = {ids: [licenceId], subjects: chunk};

      // trigger the request
      const chunkReq = myFt.setUsers(requestData, type)
        .catch((error) => {
          // retry the request
          if (retryCount < maxRetry) {
            retryCount++;

            logger.info({operation: 'licenceService.setUsersInChunks', msg: `Retry #${retryCount} of chunk #${chunkCount}`, type, licenceId});

            return myFt.setUsers(requestData, type);
          }
          throw error;
        });

      promises.push(chunkReq);
    }

    return Promise.join(...promises, (...results) => results);
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
