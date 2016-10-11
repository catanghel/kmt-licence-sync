const Promise = require('bluebird');
const logger = require('./../logger');
const KMTError = require('./../error');
const myFt = require('./myFtService');
const membership = require('./membershipService');

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
                        (...results) => results)// get the rest params as an array and return it
                  .catch((error) => {
                    throw error;
                  });
  },

  register: (licences, currentUser) => {
    logger.debug({operation: 'licenceService.register', licences});

    const rel = {
      "byTool": "KMT",
      "byUser": currentUser.uuid || "[UNKNOWN USER]"
    };

    const promises = [];
    licences.forEach((licenceId) => {
      // get membership users for this licence
      const tmpPromise = licenceService.readLicence(licenceId)
        .then(membershipData => {
          // get myft users for this licence
          return licenceService.getUsers(licenceId, membershipData);
        })
        .then(params => {
          // extract new users
          return licenceService.extractNewUsers(...params);
        })
        .then(newUsers => {
          // register the licence to myft
          return licenceService.setLicence(licenceId, newUsers);
        })
        .then(([res, newUsers] = [...params]) => {
          // register the group to myft
          return licenceService.setGroup(licenceId, rel, newUsers);
        })
        .then(([res, newUsers] = [...params]) => {
          // register the users to myft
          return licenceService.setUsers(licenceId, newUsers, rel);
        }).catch(error => {
          throw error;
        });

      promises.push(tmpPromise);
    });

    //return null;
    return Promise.join(...promises, (...results) => results);
  },

  readLicence: (licenceId) => {
    return membership.readLicence(licenceId) // get membership users for this licence
      .then((membershipData) => {
        // if we get an error => throw the error
        if (membershipData instanceof KMTError) {
          throw membershipData;
        }

        return membershipData;
      }).catch((error) => {
        throw error;
      });
  },

  getUsers: (licenceId, ...extraParams) => {
    return myFt.getUsers(licenceId)
      .then((myftData) => {
        // if we get an error => throw the error
        if (myftData instanceof KMTError) {
          throw myftData;
        }

        if (extraParams.length > 0) {
          return [myftData, ...extraParams];
        }

        return myftData;
      }).catch((error) => {
        throw error;
      });
  },

  setLicence: (licenceId, ...extraParams) => {
    return myFt.setLicence({uuid: licenceId})
      .then(res => {
        // if we get an error => throw the error
        if (res instanceof KMTError) {
          throw res;
        }

        if (extraParams.length > 0) {
          return [res, ...extraParams];
        }

        return res;
      }).catch((error) => {
        throw error;
      });
  },

  setGroup: (licenceId, rel, ...extraParams) => {
    const data = {
      "uuid": licenceId,
      "_rel": rel
    };

    return myFt.setGroup(licenceId, data)
      .then(res => {
        // if we get an error => throw the error
        if (res instanceof KMTError) {
          throw res;
        }

        if (extraParams.length > 0) {
          return [res, ...extraParams];
        }

        return res;
      }).catch((error) => {
        throw error;
      });
  },

  setUsers: (licenceId, newUsers, rel) => {
    const userData = {};
    userData.ids = [licenceId];
    userData.subjects = newUsers.map((user, i) => {
      return {
        "uuid": user.id,
        "_rel": rel
      };
    });

    return Promise.join(
                        licenceService.setLicenceUsers(userData),
                        licenceService.setGroupUsers(userData),
                        (...results) => results);
  },

  setGroupUser: (licenceId, data) => {
    return myFt.setGroupUser(licenceId, data)
      .catch((error) => {
        throw error;
      });
  },

  setLicenceUser: (licenceId, data) => {
    return myFt.setLicenceUser(licenceId, data)
      .catch((error) => {
        throw error;
      });
  },

  setGroupUsers: (data) => {
    return myFt.setGroupUsers(data)
      .catch((error) => {
        throw error;
      });
  },

  setLicenceUsers: (data) => {
    return myFt.setLicenceUsers(data)
      .catch((error) => {
        throw error;
      });
  },

  extractNewUsers: (myftData, membershipData) => {
    // TODO: extract new users by comparing membershipData with myftData
    const newUsers = membershipData.seatHolders;

    return newUsers;
  }
};

module.exports = licenceService;
