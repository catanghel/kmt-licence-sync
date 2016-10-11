const Promise = require('bluebird');
const logger = require('./../logger');
const KMTError = require('./../error');
const myFt = require('./myFtService');
const membership = require('./membershipService');

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
      promises.push(licenceService.getLicence(licenceId));
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

      const tmpPromise = new Promise((resolve, reject) => {
        // if we have the licence data
        if (licencesData[i].uuid === licenceId) {
          return resolve(null);
        }

        // register the licence to myft
        return resolve(licenceService.setLicence(licenceId));
      })
      .then((res) => {
        return licenceService.getGroup(licenceId)// get group data
          .then((groupData) => {
            // if we get an error => throw the error
            if (groupData instanceof KMTError) {
              throw groupData;

              // if we get the group data
            } else if (groupData.uuid === licenceId) {
              return null;
            }

            // register the group to myft
            return licenceService.setGroup(licenceId, rel);
          });
      })
      .then((res) => {
        // get membership users for this licence
        const membershipDataPromise = licenceService.readLicence(licenceId);
        // get myFT users for this licence
        const myftLicenceDataPromise = licenceService.getUsers(licenceId, "license");
        // get myFT users for this group
        const myftGroupDataPromise = licenceService.getUsers(licenceId, "group");

        // get the new users by comparing membershipData with myftData
        return Promise.join(
          membershipDataPromise,
          myftLicenceDataPromise,
          myftGroupDataPromise,
          (membershipData, myftLicenceData, myftGroupData) => {
            // if we get an error => throw the error
            if (membershipData instanceof KMTError) {
              throw membershipData;
            }
            if (myftLicenceData instanceof KMTError) {
              throw myftLicenceData;
            }
            if (myftGroupData instanceof KMTError) {
              throw myftGroupData;
            }

            return licenceService.extractNewUsers(myftLicenceData, myftGroupData, membershipData);
          });
      })
      .then(([newLicenceUsers, newGroupUsers] = [...params]) => {
        return licenceService.setUsers(licenceId, newLicenceUsers, newGroupUsers, rel);
      })
      .then(([licenceUserRes, groupUserRes] = [...params]) => {
        //return null;
        return licenceService.updateLicence(licenceId, {"byTool": rel.byTool});
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

  getUsers: (licenceId, type, ...extraParams) => {
    return myFt.getUsers(licenceId, type)
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

  getLicence: (licenceId) => {
    return myFt.getLicence(licenceId)
      .then(res => {
        // if we get an error => throw the error
        if (res instanceof KMTError) {
          throw res;
        }

        return res;
      }).catch((error) => {
        throw error;
      });
  },

  updateLicence: (licenceId, data) => {
    return myFt.updateLicence(licenceId, data)
      .then(res => {
        // if we get an error => throw the error
        if (res instanceof KMTError) {
          throw res;
        }

        return res;
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

  getGroup: (licenceId) => {
    return myFt.getGroup(licenceId)
      .then(res => {
        // if we get an error => throw the error
        if (res instanceof KMTError) {
          throw res;
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

  setUsers: (licenceId, newLicenceUsers, newGroupUsers, rel) => {
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

    return Promise.join(
                        licenceService.setLicenceUsers(userLicenceData),
                        licenceService.setGroupUsers(userGroupData),
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

  extractNewUsers: (myftLicenceData, myftGroupData, membershipData) => {
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
